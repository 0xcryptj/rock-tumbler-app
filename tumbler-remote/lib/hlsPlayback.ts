/**
 * expo-video needs a media playlist, not go2rtc's HLS master playlist.
 */
export async function resolveHlsPlaybackUrl(
  playlistUrl: string,
  headers?: Record<string, string>
): Promise<string> {
  let url = playlistUrl;

  for (let depth = 0; depth < 4; depth++) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      return playlistUrl;
    }
    const text = await response.text();
    if (!text.includes('#EXT-X-STREAM-INF')) {
      return url;
    }
    const lines = text.split(/\r?\n/);
    const infIndex = lines.findIndex((line) => line.includes('#EXT-X-STREAM-INF'));
    const child = lines[infIndex + 1]?.trim();
    if (!child || child.startsWith('#')) {
      return url;
    }
    url = child.startsWith('http') ? child : new URL(child, url).toString();
  }

  return url;
}
