/** Standalone live player (MSE with HLS fallback) for pop-out / WebView. */

function escHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

/** MSE when available; falls back to HLS on iOS / browsers without MediaSource. */
export function livePlayerHtml(wsUrl, hlsUrl, liveWindowSec = 2) {
  const safeWs = escHtml(wsUrl);
  const safeHls = escHtml(hlsUrl);
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Tumbler camera</title>
<style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain;background:#000}</style>
</head><body>
<video id="v" autoplay muted playsinline></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.6.16"></script>
<script>
(function () {
  var wsUrl = "${safeWs}";
  var hlsUrl = "${safeHls}";
  var LIVE_WINDOW = ${liveWindowSec};
  var v = document.getElementById("v");
  v.preload = "auto";

  function markReady() {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage("ready");
  }

  function startHls() {
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = hlsUrl;
      v.addEventListener("playing", markReady, { once: true });
      v.play().catch(function () { v.muted = true; v.play(); });
      return;
    }
    if (window.Hls && Hls.isSupported()) {
      var hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 1, liveMaxLatencyDurationCount: 2, maxLiveSyncPlaybackRate: 1.5 });
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        v.play().catch(function () { v.muted = true; v.play(); });
      });
      hls.on(Hls.Events.ERROR, function (_e, data) {
        if (data.fatal) console.error("[live] hls", data.details || data.type);
      });
      v.addEventListener("playing", markReady, { once: true });
      hls.loadSource(hlsUrl);
      hls.attachMedia(v);
      return;
    }
    document.body.innerHTML = "<p style=\\"color:#fff;padding:16px\\">This browser cannot play live video.</p>";
  }

  if (!window.MediaSource && !window.ManagedMediaSource) {
    startHls();
    return;
  }

  var CODECS = ["avc1.640029","avc1.64002A","avc1.640033","mp4a.40.2","mp4a.40.5"];
  function codecs() {
    return CODECS.filter(function (c) {
      return MediaSource.isTypeSupported('video/mp4; codecs="' + c + '"');
    }).join();
  }
  function sendMse(ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "mse", value: codecs() }));
    }
  }
  function trimLive(ms, sb) {
    if (!sb || sb.updating || !sb.buffered.length) return;
    var end = sb.buffered.end(sb.buffered.length - 1);
    var liveStart = Math.max(sb.buffered.start(0), end - LIVE_WINDOW);
    var bufferStart = sb.buffered.start(0);
    if (liveStart > bufferStart + 0.05) {
      try { sb.remove(bufferStart, liveStart); } catch (e) {}
      try { ms.setLiveSeekableRange(liveStart, end); } catch (e) {}
    }
    if (v.currentTime < liveStart) v.currentTime = liveStart;
    var gap = end - v.currentTime;
    if (gap > 0.15) v.playbackRate = Math.min(3, Math.max(1.25, gap));
    else if (gap > 0.04) v.playbackRate = 1.05;
    else v.playbackRate = 1;
    if (v.readyState >= 2) markReady();
  }

  var ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";
  var ms, sb, buf = new Uint8Array(2 * 1024 * 1024), bufLen = 0, sourceOpen = false;

  ws.onmessage = function (ev) {
    if (typeof ev.data === "string") {
      var msg = JSON.parse(ev.data);
      if (msg.type !== "mse" || sb) return;
      sb = ms.addSourceBuffer(msg.value);
      sb.mode = "segments";
      sb.addEventListener("updateend", function () {
        if (sb && !sb.updating && bufLen > 0) {
          try { sb.appendBuffer(buf.slice(0, bufLen)); bufLen = 0; } catch (e) {}
        }
        trimLive(ms, sb);
      });
      return;
    }
    if (!sb) return;
    if (sb.updating || bufLen > 0) {
      var chunk = new Uint8Array(ev.data);
      if (bufLen + chunk.byteLength > buf.length) return;
      buf.set(chunk, bufLen);
      bufLen += chunk.byteLength;
    } else {
      try { sb.appendBuffer(ev.data); } catch (e) {}
    }
  };

  ws.onerror = function () { startHls(); };
  ws.onclose = function (ev) {
    if (ev.code !== 1000 && !sb) startHls();
  };

  ws.addEventListener("open", function () {
    ms = new MediaSource();
    v.src = URL.createObjectURL(ms);
    ms.addEventListener("sourceopen", function () {
      sourceOpen = true;
      sendMse(ws);
    }, { once: true });
    v.addEventListener("playing", markReady, { once: true });
    v.play().catch(function () { v.muted = true; v.play(); });
  }, { once: true });

  setTimeout(function () {
    if (!sb) startHls();
  }, 12000);
})();
</script>
</body></html>`;
}

export function msePlayerHtml(wsUrl, liveWindowSec = 2) {
  return livePlayerHtml(wsUrl, '', liveWindowSec);
}

export function hlsPlayerHtml(playlistUrl) {
  const safe = escHtml(playlistUrl);
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Tumbler camera</title>
<style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain;background:#000}</style>
</head><body>
<video id="v" autoplay muted playsinline controls></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.6.16"></script>
<script>
(function () {
  var url = "${safe}";
  var v = document.getElementById("v");
  function markReady() {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage("ready");
  }
  if (v.canPlayType("application/vnd.apple.mpegurl")) {
    v.src = url;
    v.addEventListener("playing", markReady, { once: true });
    v.play().catch(function () { v.muted = true; v.play(); });
    return;
  }
  if (window.Hls && Hls.isSupported()) {
    var hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 1, liveMaxLatencyDurationCount: 2, maxLiveSyncPlaybackRate: 1.5 });
    hls.loadSource(url);
    hls.attachMedia(v);
    hls.on(Hls.Events.MANIFEST_PARSED, function () {
      v.play().catch(function () { v.muted = true; v.play(); });
    });
    v.addEventListener("playing", markReady, { once: true });
  }
})();
</script>
</body></html>`;
}
