import type { CaptureTrack } from './SoundCaptureService';

/**
 * Lit les pistes audio d'un blob `storyEffects` produit par le client.
 *
 * Fonction PURE et exportée : tant qu'elle vivait en méthode privée de
 * `PostService`, rien ne la testait — or c'est elle qui décide ce qui entre
 * dans la bibliothèque. Une piste mal lue, et le son n'est jamais capturé
 * (silencieux) ou l'est sous le mauvais identifiant.
 *
 * Le blob est ENTIÈREMENT contrôlé par le client : chaque champ est vérifié,
 * jamais coercé. `postMediaId` reste ici une simple chaîne — c'est
 * `SoundCaptureService` qui la contraint au post courant.
 */
export function extractCaptureTracks(storyEffects?: Record<string, unknown>): CaptureTrack[] {
  const raw = storyEffects?.['audioPlayerObjects'];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
    .map((o) => ({
      trackId: String(o['id'] ?? ''),
      postMediaId: typeof o['postMediaId'] === 'string' && o['postMediaId'] ? o['postMediaId'] : undefined,
      soundId: typeof o['soundId'] === 'string' && o['soundId'] ? o['soundId'] : undefined,
      // `startTime`/`duration` sont en SECONDES côté client, en millisecondes en base.
      startMs: typeof o['startTime'] === 'number' ? Math.round(o['startTime'] * 1000) : undefined,
      endMs: typeof o['duration'] === 'number' && typeof o['startTime'] === 'number'
        ? Math.round((o['startTime'] + o['duration']) * 1000) : undefined,
    }))
    // Une piste sans identifiant, ou qui ne désigne NI un média propre NI un son
    // emprunté, n'a rien à faire dans la capture.
    .filter((t) => t.trackId && (t.postMediaId || t.soundId));
}
