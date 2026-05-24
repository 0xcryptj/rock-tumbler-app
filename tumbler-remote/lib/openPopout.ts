import { Linking, Platform } from 'react-native';

/** Open a player page in a new tab/window (avoids about:blank from blocked popups). */
export function openPopoutPlayer(url: string): void {
  if (!url) {
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    return;
  }
  void Linking.openURL(url);
}
