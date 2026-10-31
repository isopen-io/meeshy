import type { ExportSound } from './scene-export-plan';

/**
 * **LA PISTE SON D'UN EXPORT** (#13873) — chaque son du plan devient UNE
 * lecture programmée sur le graphe Web Audio : son heure de départ, son
 * décalage dans le fichier (la coupe), sa durée, sa boucle et son gain. Le
 * graphe mixe le tout vers la destination que l'enregistreur filme : c'est le
 * son qui JOUE dans la vidéo rendue, jamais une piste muette à côté.
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
};

function playOf(sound: ExportSound, clipDurationS: number, lengthMs: number): ScheduledPlay | null {
  if (!Number.isFinite(clipDurationS) || clipDurationS <= 0) return null;
  if (sound.startMs >= lengthMs || sound.gain <= 0) return null;
  const trimStartS = Math.min(Math.max(0, sound.trimStartMs / 1000), clipDurationS);
  const declaredEndS = sound.trimEndMs === null ? clipDurationS : Math.min(sound.trimEndMs / 1000, clipDurationS);
  const loopEndS = declaredEndS > trimStartS ? declaredEndS : clipDurationS;
  const loopStartS = declaredEndS > trimStartS ? trimStartS : 0;
  const windowS = (Math.min(sound.endMs, lengthMs) - sound.startMs) / 1000;
  const durationS = sound.loop ? windowS : Math.min(loopEndS - loopStartS, windowS);
  if (durationS <= 0) return null;
  return { src: sound.src, whenS: sound.startMs / 1000, offsetS: loopStartS, durationS, loop: sound.loop, loopStartS, loopEndS, gain: sound.gain };
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
