import type { CaptureTrack } from './SoundCaptureService';
import { cleanWaveformSamples } from './waveformSamples';
import { isCanvasV3OrNewer } from './storyEffectsV3';

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
/**
 * Un nombre exploitable, ou `undefined`. `typeof NaN === 'number'` et
 * `typeof Infinity === 'number'` : sans le test de finitude, un blob hostile
 * ferait entrer `NaN` en base à travers `Math.round`.
 */
function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
    : [];
}

/**
 * Pistes d'un canvas v3 (#8012) : chaque objet `audio` de chaque scène — sa
 * charge porte les mêmes clés que la piste v1 (`convertV1ToV3` la répand),
 * l'identifiant vit sur l'objet — plus le son de scène EMPRUNTÉ à la
 * bibliothèque, dont la fenêtre `bounds` est en secondes.
 */
function canvasTrackSources(canvas: Record<string, unknown>): Record<string, unknown>[] {
  const objects = records(canvas['scenes'])
    .flatMap((scene) => records(scene['objects']))
    .filter((o) => o['kind'] === 'audio')
    .map((o) => {
      const payload = typeof o['payload'] === 'object' && o['payload'] !== null
        ? (o['payload'] as Record<string, unknown>)
        : {};
      return { ...payload, id: o['id'] };
    });
  const sound = typeof canvas['sound'] === 'object' && canvas['sound'] !== null
    ? (canvas['sound'] as Record<string, unknown>)
    : {};
  const source = typeof sound['source'] === 'object' && sound['source'] !== null
    ? (sound['source'] as Record<string, unknown>)
    : {};
  if (source['t'] !== 'library') return objects;
  const bounds = typeof sound['bounds'] === 'object' && sound['bounds'] !== null
    ? (sound['bounds'] as Record<string, unknown>)
    : {};
  const start = finiteNumber(bounds['start']);
  const end = finiteNumber(bounds['end']);
  return [...objects, {
    id: SCENE_SOUND_TRACK_ID,
    soundId: source['soundId'],
    ...(start !== undefined ? { sourceStart: start } : {}),
    ...(start !== undefined && end !== undefined && end >= start ? { duration: end - start } : {}),
  }];
}

/** `trackId` du son de scène — un seul par canvas, donc stable d'une édition à l'autre. */
export const SCENE_SOUND_TRACK_ID = 'scene-sound';

export function extractCaptureTracks(storyEffects?: Record<string, unknown>): CaptureTrack[] {
  const sources = isCanvasV3OrNewer(storyEffects)
    ? canvasTrackSources(storyEffects as unknown as Record<string, unknown>)
    : records(storyEffects?.['audioPlayerObjects']);
  return sources
    .map((o) => {
      // Fenêtre de SOURCE, pas fenêtre de timeline. `SoundUsage.startMs/endMs`
      // disent QUELLE PART DU SON a été utilisée ; y ranger `startTime` — la
      // position de la piste sur la timeline — écrivait une attribution fausse
      // à chaque publication. Corrigé le 2026-08-02.
      //
      // Un client antérieur n'envoie pas `sourceStart` : il entre la source à
      // 0, donc `0 → duration` est exactement juste pour lui. C'est ce qui
      // permet de livrer cette correction avant le client.
      //
      // Secondes côté client, millisecondes en base.
      const sourceStart = finiteNumber(o['sourceStart']) ?? 0;
      const duration = finiteNumber(o['duration']);
      const intrinsic = finiteNumber(o['intrinsicDuration']);
      // La part réellement utilisée ne peut pas dépasser ce qui reste de source
      // après l'entrée : au-delà, la piste BOUCLE, elle ne consomme pas plus
      // de son.
      const excerpt = duration === undefined
        ? undefined
        : intrinsic === undefined
          ? duration
          : Math.min(duration, Math.max(0, intrinsic - sourceStart));
      return {
        trackId: String(o['id'] ?? ''),
        postMediaId: typeof o['postMediaId'] === 'string' && o['postMediaId'] ? o['postMediaId'] : undefined,
        soundId: typeof o['soundId'] === 'string' && o['soundId'] ? o['soundId'] : undefined,
        startMs: Math.round(sourceStart * 1000),
        endMs: excerpt === undefined ? undefined : Math.round((sourceStart + excerpt) * 1000),
        waveform: cleanWaveformSamples(o['waveformSamples']),
        // Distingue « l'auteur a déplacé sa fenêtre » de « il a accepté le
        // défaut ». Booléen STRICT : le blob vient du client, pas de coercion.
        windowAdjusted: o['windowAdjusted'] === true ? true : undefined,
      };
    })
    // Une piste sans identifiant, ou qui ne désigne NI un média propre NI un son
    // emprunté, n'a rien à faire dans la capture.
    .filter((t) => t.trackId && (t.postMediaId || t.soundId));
}
