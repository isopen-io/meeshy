/**
 * Le format dans lequel tout audio téléversé en clair est STOCKÉ (#8039) :
 * AAC dans un conteneur M4A, le seul que lisent à la fois AVFoundation (iOS),
 * Android et tous les navigateurs. `ipod` est le nom du muxer M4A de ffmpeg.
 */
export const NORMALIZED_AUDIO = {
  mimeType: 'audio/mp4',
  extension: '.m4a',
  ffmpegFormat: 'ipod',
} as const;

export function normalizedAudioPath(relativePath: string): string {
  const parsed = relativePath.match(/^(.*?)(\.[^./\\]*)?$/);
  return `${parsed?.[1] ?? relativePath}${NORMALIZED_AUDIO.extension}`;
}
