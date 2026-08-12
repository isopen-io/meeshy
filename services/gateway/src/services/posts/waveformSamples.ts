/**
 * Échantillons de forme d'onde d'un son.
 *
 * `Sound.waveform` est déclaré et lu depuis toujours, mais n'avait **aucun
 * écrivain** : le champ valait `[]` pour toute la bibliothèque. Le client
 * envoyait pourtant déjà ses échantillons — le serveur les jetait.
 *
 * Module partagé parce que les **deux** chemins de création d'un `Sound` en ont
 * besoin : la capture d'un son original (`captureTracks` → `SoundCaptureService`)
 * et l'upload manuel (`routes/posts/audio.ts`). Un plafond dupliqué dans deux
 * fichiers finirait par diverger.
 */

/** Plafond aligné sur `StoryAudioObjectSchema.waveformSamples` (`routes/posts/types.ts`). */
export const MAX_WAVEFORM_SAMPLES = 2048;

/**
 * Échantillons exploitables, ou `undefined`. Filtre les entrées non numériques
 * et non finies : `Float[]` en Prisma/MongoDB n'accepte pas `NaN`, et le
 * tableau vient entièrement du client.
 */
export function cleanWaveformSamples(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const clean = value
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .slice(0, MAX_WAVEFORM_SAMPLES);
  return clean.length > 0 ? clean : undefined;
}

/**
 * Lit le champ multipart `waveform` de l'upload manuel.
 *
 * Décoder l'audio côté serveur imposerait ffmpeg dans le conteneur gateway pour
 * une donnée purement décorative, que le client possède déjà pour l'afficher.
 * Un champ malformé est **ignoré**, jamais une cause de rejet : on ne fait pas
 * échouer l'envoi d'un fichier sur un ornement.
 */
export function parseWaveformField(raw: unknown): number[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return cleanWaveformSamples(parsed) ?? [];
  } catch {
    return [];
  }
}
