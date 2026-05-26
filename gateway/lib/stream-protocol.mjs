/**

 * Pick playback protocol for /api/stream/start (go2rtc-native paths, no gateway ffmpeg).

 */

const DEFAULT = (process.env.DEFAULT_STREAM_PROTOCOL || 'auto').toLowerCase();



export function isSafariUserAgent(userAgent = '') {

  return /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS|SamsungBrowser/i.test(userAgent);

}



export function isIosUserAgent(userAgent = '') {

  return /iPhone|iPad|iPod/i.test(userAgent);

}



export function resolveStreamProtocol(body = {}, userAgent = '') {

  const preference = String(body.preference || 'auto').toLowerCase();

  const platform = String(body.platform || '').toLowerCase();

  const browser = String(body.browser || '').toLowerCase();



  if (preference === 'mse' || preference === 'hls' || preference === 'mp4') {

    return preference;

  }



  // iPhone Safari, Shortcuts, Add to Home Screen — native HLS only

  if (browser === 'safari' || isSafariUserAgent(userAgent) || isIosUserAgent(userAgent)) {

    return 'hls';

  }



  if (platform === 'ios') {

    return 'hls';

  }

  if (platform === 'android') {

    return 'mse';

  }

  if (platform === 'web') {

    return 'mse';

  }



  if (DEFAULT === 'mse' || DEFAULT === 'hls' || DEFAULT === 'mp4') {

    return DEFAULT;

  }



  if (/\b(Windows NT|Macintosh|Linux x86|CrOS)\b/i.test(userAgent) && !/Mobile/i.test(userAgent)) {

    return 'mse';

  }



  return 'hls';

}



export function buildStreamUrls({ publicBaseUrl, sessionId, tokenQ, protocol }) {

  const tokenParam = `token=${tokenQ}`;

  const mp4Url = `${publicBaseUrl}/api/mp4/${sessionId}/stream.mp4?${tokenParam}`;

  const hlsUrl = `${publicBaseUrl}/api/hls/${sessionId}/stream.m3u8?${tokenParam}&mp4`;

  const wsBase = publicBaseUrl.replace(/^http/i, 'ws');

  const wsUrl = `${wsBase}/api/mse/${sessionId}/ws?${tokenParam}`;

  const popoutLive = `${publicBaseUrl}/api/player/${sessionId}/live?${tokenParam}`;

  const popoutMp4 = `${publicBaseUrl}/api/player/${sessionId}/view?${tokenParam}`;



  if (protocol === 'mse') {

    return {

      protocol: 'mse',

      playbackUrl: wsUrl,

      wsUrl,

      popoutUrl: popoutLive,

    };

  }

  if (protocol === 'hls') {

    return {

      protocol: 'hls',

      playbackUrl: hlsUrl,

      popoutUrl: `${publicBaseUrl}/api/player/${sessionId}/hls?${tokenParam}`,

    };

  }

  return {

    protocol: 'mp4',

    playbackUrl: mp4Url,

    popoutUrl: popoutMp4,

  };

}


