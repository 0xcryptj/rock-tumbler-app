/**
 * Platform-specific paths for go2rtc and ffmpeg under gateway/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GATEWAY_ROOT } from './camera.mjs';

export const GO2RTC_BIN_NAME = process.platform === 'win32' ? 'go2rtc.exe' : 'go2rtc';
export const FFMPEG_BIN_NAME = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

export function gatewayBinPath(name) {
  return path.join(GATEWAY_ROOT, 'bin', name);
}

export function getFfmpegBin() {
  if (process.env.FFMPEG_BIN) {
    return path.resolve(process.env.FFMPEG_BIN);
  }
  const local = gatewayBinPath(FFMPEG_BIN_NAME);
  if (fs.existsSync(local)) {
    return local;
  }
  if (process.platform !== 'win32') {
    return FFMPEG_BIN_NAME;
  }
  return local;
}

export function ffmpegExists() {
  const bin = getFfmpegBin();
  if (bin === FFMPEG_BIN_NAME) {
    return false;
  }
  return fs.existsSync(bin);
}

/** Relative path for go2rtc.yaml `ffmpeg.bin` (from gateway/). */
export function go2rtcFfmpegBinYaml() {
  const local = gatewayBinPath(FFMPEG_BIN_NAME);
  if (fs.existsSync(local)) {
    return `bin/${FFMPEG_BIN_NAME}`;
  }
  if (process.env.FFMPEG_BIN) {
    return process.env.FFMPEG_BIN.replace(/\\/g, '/');
  }
  return `bin/${FFMPEG_BIN_NAME}`;
}

export function findGo2rtcBin() {
  const candidates = [
    gatewayBinPath(GO2RTC_BIN_NAME),
    path.join(GATEWAY_ROOT, GO2RTC_BIN_NAME),
  ];
  if (process.platform === 'win32') {
    candidates.push(
      path.join(process.env.USERPROFILE || '', 'Downloads', 'go2rtc.exe'),
      path.join(process.env.USERPROFILE || '', 'Downloads', 'go2rtc_win64', 'go2rtc.exe')
    );
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function pathSeparatorForEnv() {
  return process.platform === 'win32' ? ';' : ':';
}
