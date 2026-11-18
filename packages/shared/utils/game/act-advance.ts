import type { MissionDifficulty } from './missions.js';

/**
 * L'ACTE QUI AVANCE (#17367) — après un envoi qui fait avancer un acte du Rêve, une pastille discrète dit
 * « Acte II · 3 sur 5 » dans la conversation, puis s'efface.
 *
 * Le client ne recalcule AUCUNE règle : la progression de chaque acte est décidée par la passerelle et servie dans le
 * bloc `game` (`missions.items[].progress`, `target`). Cette loi compare deux lectures successives du bloc et dit quel
 * acte vient d'avancer. Seul un MÊME acte (même `id`) d'une MÊME journée (`dayKey`) se compare : un nouveau jour ou un
 * acte relancé n'est pas une avancée. Deux actes avancés ensemble : le premier dans l'ordre du jour parle.
 *
 * `null` ⇒ aucune pastille : « Jeu masqué », lecture absente (cache vide, ancien serveur), actes pas encore ouverts,
 * aucune progression montée. Aucune notification n'en découle (#17368).
 */
export type ActAdvance = {
  readonly difficulty: MissionDifficulty;
  readonly progress: number;
  readonly target: number;
};

/** La part du bloc `game` que la loi lit — rien d'autre. */
export type ActAdvanceSource = {
  readonly missions: {
    readonly dayKey: string;
    readonly unlocked: boolean;
    readonly items: ReadonlyArray<{
      readonly id: string;
      readonly difficulty: MissionDifficulty;
      readonly progress: number;
      readonly target: number;
    }>;
  };
};

export function actAdvance(
  before: ActAdvanceSource | null | undefined,
  after: ActAdvanceSource | null | undefined,
  options: { readonly hidden: boolean },
): ActAdvance | null {
  if (options.hidden || before == null || after == null) return null;
  if (!after.missions.unlocked || before.missions.dayKey !== after.missions.dayKey) return null;
  const previous = new Map(before.missions.items.map((item) => [item.id, item.progress] as const));
  const moved = after.missions.items.find((item) => {
    const was = previous.get(item.id);
    return was !== undefined && item.progress > was;
  });
  if (moved === undefined) return null;
  return { difficulty: moved.difficulty, progress: Math.min(moved.progress, moved.target), target: moved.target };
}
