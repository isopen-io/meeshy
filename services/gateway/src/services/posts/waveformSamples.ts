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

/**
 * Nombre d'échantillons rendus par la capture SERVEUR (#6602) — assez pour un
 * sélecteur de zone lisible, très en-deçà de `MAX_WAVEFORM_SAMPLES`.
 */
export const COMPUTED_WAVEFORM_SAMPLES = 100;

/**
 * Réduit un flux PCM 16 bits signé, MONO, en `targetSamples` amplitudes de
 * crête normalisées dans `[0, 1]` — une valeur par tranche égale du flux.
 *
 * Fonction PURE, sans E/S : c'est le décodage (ffmpeg, cf. `SoundCaptureService`)
 * qui produit ce buffer, jamais cette fonction — elle reste testable sans
 * binaire externe. Un buffer vide ou plus court qu'un seul échantillon 16 bits
 * rend `[]`, jamais une division par zéro.
 */
export function pcm16ToWaveform(pcm: Buffer, targetSamples: number = COMPUTED_WAVEFORM_SAMPLES): number[] {
  const sampleCount = Math.floor(pcm.length / 2);
  if (sampleCount === 0 || targetSamples <= 0) return [];

  const bucketSize = Math.max(1, Math.floor(sampleCount / targetSamples));
  const result: number[] = [];

  for (let start = 0; start < sampleCount && result.length < targetSamples; start += bucketSize) {
    const end = Math.min(start + bucketSize, sampleCount);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const amplitude = Math.abs(pcm.readInt16LE(i * 2));
      if (amplitude > peak) peak = amplitude;
    }
    result.push(Math.min(1, peak / 32768));
  }

  return result;
}
