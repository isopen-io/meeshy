import type { ExportSound, VolumePoint } from './scene-export-plan';

/**
 * **LA PISTE SON D'UN EXPORT** (#13873) — chaque son du plan devient UNE
 * lecture programmée sur le graphe Web Audio : son heure de départ, son
 * décalage dans le fichier (la coupe), sa durée, sa boucle et son gain. Le
 * graphe mixe le tout vers la destination que l'enregistreur filme : c'est le
 * son qui JOUE dans la vidéo rendue, jamais une piste muette à côté.
 *
 * La courbe de volume de l'auteur (#13880 — keyframes de volume, fondus
 * d'entrée et de sortie) suit le son : un palier à son premier point, puis
 * des rampes linéaires, coupée à la longueur rendue.
 *
 * Le programme est une loi pure (`soundSchedule`) ; `playSoundSchedule` ne fait
 * que le poser sur un contexte. Aucune piste n'est mixée d'avance en mémoire :
 * une story de 4 min ne tient que ses fichiers décodés.
 */

export type ScheduledPlay = {
  readonly src: string;
  readonly whenS: number;
  readonly offsetS: number;
  readonly durationS: number;
  readonly loop: boolean;
  readonly loopStartS: number;
  readonly loopEndS: number;
  readonly gain: number;
  /** Les points de la courbe, en secondes de la timeline rendue ; vide : le gain fixe. */
  readonly envelope: readonly { readonly atS: number; readonly gain: number }[];
};

function gainBetween(lo: VolumePoint, hi: VolumePoint, atMs: number): number {
  const span = hi.atMs - lo.atMs;
  return span <= 0 ? hi.gain : lo.gain + ((hi.gain - lo.gain) * (atMs - lo.atMs)) / span;
}

/** La courbe restreinte à `[fromMs, toMs]`, ses bords interpolés là où elle continue au-delà. */
function clippedEnvelope(points: readonly VolumePoint[], fromMs: number, toMs: number): readonly { readonly atS: number; readonly gain: number }[] {
  const inside = points.filter((point) => point.atMs >= fromMs && point.atMs <= toMs);
  const before = points.filter((point) => point.atMs < fromMs).at(-1);
  const after = points.find((point) => point.atMs > toMs);
  const first = inside[0] ?? after;
  const last = inside.at(-1) ?? before;
  const head = before !== undefined && first !== undefined ? [{ atMs: fromMs, gain: gainBetween(before, first, fromMs) }] : [];
  const tail = after !== undefined && last !== undefined ? [{ atMs: toMs, gain: gainBetween(last, after, toMs) }] : [];
  return [...head, ...inside, ...tail].map((point) => ({ atS: point.atMs / 1000, gain: point.gain }));
}

function playOf(sound: ExportSound, clipDurationS: number, lengthMs: number): ScheduledPlay | null {
  if (!Number.isFinite(clipDurationS) || clipDurationS <= 0) return null;
  const points = sound.envelope ?? [];
  if (sound.startMs >= lengthMs || (sound.gain <= 0 && points.every((point) => point.gain <= 0))) return null;
  const trimStartS = Math.min(Math.max(0, sound.trimStartMs / 1000), clipDurationS);
  const declaredEndS = sound.trimEndMs === null ? clipDurationS : Math.min(sound.trimEndMs / 1000, clipDurationS);
  const loopEndS = declaredEndS > trimStartS ? declaredEndS : clipDurationS;
  const loopStartS = declaredEndS > trimStartS ? trimStartS : 0;
  const windowS = (Math.min(sound.endMs, lengthMs) - sound.startMs) / 1000;
  const durationS = sound.loop ? windowS : Math.min(loopEndS - loopStartS, windowS);
  if (durationS <= 0) return null;
  const envelope = points.length === 0 ? [] : clippedEnvelope(points, sound.startMs, sound.startMs + durationS * 1000);
  return { src: sound.src, whenS: sound.startMs / 1000, offsetS: loopStartS, durationS, loop: sound.loop, loopStartS, loopEndS, gain: sound.gain, envelope };
}

export function soundSchedule(params: {
  readonly sounds: readonly ExportSound[];
  /** La durée DÉCODÉE de chaque fichier, en secondes — absente : le fichier n'a pas pu se décoder. */
  readonly clipDurationsS: ReadonlyMap<string, number>;
  readonly lengthMs: number;
}): readonly ScheduledPlay[] {
  return params.sounds.flatMap((sound) => {
    const duration = params.clipDurationsS.get(sound.src);
    const play = duration === undefined ? null : playOf(sound, duration, params.lengthMs);
    return play === null ? [] : [play];
  });
}

/** Pose le programme sur le contexte, à partir de `startAt` (horloge du contexte) ; rend l'arrêt. */
export function playSoundSchedule(params: {
  readonly context: BaseAudioContext;
  readonly destination: AudioNode;
  readonly plays: readonly ScheduledPlay[];
  readonly buffers: ReadonlyMap<string, AudioBuffer>;
  readonly startAt: number;
}): () => void {
  const sources = params.plays.flatMap((play) => {
    const buffer = params.buffers.get(play.src);
    if (buffer === undefined) return [];
    const gain = params.context.createGain();
    gain.gain.setValueAtTime(play.gain, 0);
    play.envelope.forEach((point, index) =>
      index === 0 ? gain.gain.setValueAtTime(point.gain, params.startAt + point.atS) : gain.gain.linearRampToValueAtTime(point.gain, params.startAt + point.atS),
    );
    gain.connect(params.destination);
    const source = params.context.createBufferSource();
    source.buffer = buffer;
    source.loop = play.loop;
    source.loopStart = play.loopStartS;
    source.loopEnd = play.loopEndS;
    source.connect(gain);
    source.start(params.startAt + play.whenS, play.offsetS, play.durationS);
    return [source];
  });
  return () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        /* une source déjà arrêtée ne se rarrête pas */
      }
    }
  };
}
