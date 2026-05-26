#!/usr/bin/env bash
# Install Rock Tumbler home backend (go2rtc + API gateway) on Linux.
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/0xcryptj/rock-tumbler-app/main/gateway/scripts/install-backend.sh | bash
#
# Options (env vars before pipe):
#   INSTALL_DIR=~/rock-tumbler-app  REPO_BRANCH=main  --service (enable systemd user unit)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/0xcryptj/rock-tumbler-app.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/rock-tumbler-app}"
GO2RTC_VERSION="${GO2RTC_VERSION:-v1.9.14}"
ENABLE_SERVICE="${ENABLE_SERVICE:-0}"

for arg in "$@"; do
  case "$arg" in
    --service) ENABLE_SERVICE=1 ;;
  esac
done

info() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERR>\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

node_major() {
  node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
}

detect_go2rtc_asset() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) echo "go2rtc_linux_amd64" ;;
    aarch64|arm64) echo "go2rtc_linux_arm64" ;;
    armv7l|armhf) echo "go2rtc_linux_arm" ;;
    armv6l) echo "go2rtc_linux_armv6" ;;
    i386|i686) echo "go2rtc_linux_i386" ;;
    *) die "Unsupported CPU architecture for go2rtc: $arch" ;;
  esac
}

lan_ipv4() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") { print $(i+1); exit }}'
    return
  fi
  hostname -I 2>/dev/null | awk '{print $1}'
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && [[ "$(node_major)" -ge 18 ]]; then
    info "Node.js $(node -v)"
    return
  fi
  die "Node.js 18+ required. Install: https://nodejs.org/ or: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
}

clone_or_update() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Updating $INSTALL_DIR"
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$REPO_BRANCH"
    git -C "$INSTALL_DIR" checkout "$REPO_BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$REPO_BRANCH" || true
  elif [[ -d "$INSTALL_DIR" ]]; then
    die "$INSTALL_DIR exists but is not a git repo — remove it or set INSTALL_DIR elsewhere"
  else
    need_cmd git
    info "Cloning $REPO_URL → $INSTALL_DIR"
    git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
}

install_go2rtc() {
  local asset bin_dir dest url
  asset="$(detect_go2rtc_asset)"
  bin_dir="$INSTALL_DIR/gateway/bin"
  dest="$bin_dir/go2rtc"
  mkdir -p "$bin_dir"
  url="https://github.com/AlexxIT/go2rtc/releases/download/${GO2RTC_VERSION}/${asset}"
  info "Downloading go2rtc ($asset)"
  curl -fsSL "$url" -o "$dest"
  chmod +x "$dest"
  info "go2rtc → $dest"
}

link_ffmpeg() {
  local bin_dir dest
  bin_dir="$INSTALL_DIR/gateway/bin"
  dest="$bin_dir/ffmpeg"
  mkdir -p "$bin_dir"
  if [[ -x "$dest" || -L "$dest" ]]; then
    return
  fi
  if command -v ffmpeg >/dev/null 2>&1; then
    ln -sf "$(command -v ffmpeg)" "$dest"
    info "ffmpeg → $(readlink -f "$dest" 2>/dev/null || echo "$dest")"
    return
  fi
  warn "ffmpeg not found — install with: sudo apt install ffmpeg (needed if RTSP_USE_FFMPEG=true)"
}

seed_env() {
  local env_file example lan api_key
  env_file="$INSTALL_DIR/gateway/.env"
  example="$INSTALL_DIR/gateway/.env.example"
  if [[ -f "$env_file" ]]; then
    info "Keeping existing gateway/.env"
    return
  fi
  [[ -f "$example" ]] || die "Missing gateway/.env.example"
  cp "$example" "$env_file"
  lan="$(lan_ipv4 || true)"
  if [[ -n "$lan" ]]; then
    # Replace the RFC 5737 documentation placeholder with the detected LAN IP.
    sed -i "s|http://192\.0\.2\.30:8080|http://${lan}:8080|g" "$env_file"
  fi
  if command -v openssl >/dev/null 2>&1; then
    api_key="$(openssl rand -hex 32)"
    sed -i "s|^API_KEY=.*$|API_KEY=${api_key}|" "$env_file"
  fi
  info "Created gateway/.env — edit RTSP_URL, ESP32_BASE, and camera credentials"
}

npm_install_gateway() {
  info "Installing npm dependencies (gateway/)"
  (cd "$INSTALL_DIR/gateway" && npm install --omit=dev)
}

write_start_script() {
  cat >"$INSTALL_DIR/start-backend.sh" <<'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")/gateway" && exec node index.mjs
EOF
  chmod +x "$INSTALL_DIR/start-backend.sh"
}

install_systemd_user() {
  local unit home unit_dir
  home="$(cd "$INSTALL_DIR" && pwd)"
  unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  mkdir -p "$unit_dir"
  cat >"$unit_dir/rock-tumbler-backend.service" <<EOF
[Unit]
Description=Rock Tumbler backend (go2rtc + gateway)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${home}/gateway
ExecStart=$(command -v node) index.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now rock-tumbler-backend.service
  info "systemd user service: rock-tumbler-backend.service (systemctl --user status rock-tumbler-backend)"
}

main() {
  info "Rock Tumbler backend installer (Linux)"
  need_cmd curl
  need_cmd bash
  ensure_node
  clone_or_update
  install_go2rtc
  link_ffmpeg
  npm_install_gateway
  seed_env
  write_start_script
  node "$INSTALL_DIR/gateway/scripts/sync-go2rtc-yaml.mjs" || warn "sync-go2rtc-yaml skipped — finish gateway/.env first"

  if [[ "$ENABLE_SERVICE" == "1" ]]; then
    command -v systemctl >/dev/null 2>&1 || die "systemctl not found"
    install_systemd_user
  fi

  local lan
  lan="$(lan_ipv4 || echo 127.0.0.1)"
  echo ""
  info "Install complete: $INSTALL_DIR"
  echo "  1. Edit $INSTALL_DIR/gateway/.env (RTSP_URL, ESP32_BASE, API_KEY)"
  echo "  2. Start:  $INSTALL_DIR/start-backend.sh"
  echo "     Or:    cd $INSTALL_DIR/gateway && node index.mjs"
  echo "  3. App Settings → API base URL: http://${lan}:8080"
  echo "  4. Test:   cd $INSTALL_DIR/gateway && npm test"
  echo ""
  echo "Enable on boot: curl -fsSL .../install-backend.sh | ENABLE_SERVICE=1 bash"
}

main "$@"
