import { actAdvance, type ActAdvance, type ActAdvanceSource } from '@meeshy/shared/utils/game/act-advance';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **L'ACTE QUI AVANCE** (#17367) — après un envoi qui fait avancer un acte du Rêve, la conversation dit
 * « Acte II · 3 sur 5 » quelques secondes, puis s'efface. L'envoi ARME le guet (`ACT_ADVANCE_ARMED_MS`) ; le guet
 * compare les lectures successives du bloc `game` en cache (`actAdvance`, la loi partagée) — le cache que
 * `game:updated` et `game:missions-updated` tiennent à jour. Aucune requête ne part pour lui. « Jeu masqué » : rien.
 */

/** Le temps, après un envoi, pendant lequel une avancée d'acte lui est attribuée. */
export const ACT_ADVANCE_ARMED_MS = 15_000;

/** Le temps pendant lequel la pastille reste lisible avant de s'effacer. */
export const ACT_ADVANCE_SHOWN_MS = 2_600;

export function watchActAdvance(options: {
  readonly read: () => unknown;
  readonly subscribe: (listener: () => void) => () => void;
  readonly hidden: () => boolean;
  readonly onAdvance: (advance: ActAdvance) => void;
}): () => void {
  let last = actSource(options.read());
  return options.subscribe(() => {
    const next = actSource(options.read());
    const advance = actAdvance(last, next, { hidden: options.hidden() });
    if (next !== null) last = next;
    if (advance !== null) options.onAdvance(advance);
  });
}

export function actAdvanceLabel(advance: ActAdvance, language: InterfaceLanguage): string {
  return translate(language, 'engagement.act.advance', {
    act: translate(language, `engagement.act.${advance.difficulty}`),
    progress: String(advance.progress),
    target: String(advance.target),
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isAct = (value: unknown): boolean =>
  isRecord(value)
  && typeof value['id'] === 'string'
  && typeof value['difficulty'] === 'string'
  && typeof value['progress'] === 'number'
  && typeof value['target'] === 'number';

/** Un bloc d'un ancien serveur peut manquer les actes : alors rien à comparer, jamais une exception. */
function actSource(data: unknown): ActAdvanceSource | null {
  const game = isRecord(data) ? data['game'] : undefined;
  const missions = isRecord(game) ? game['missions'] : undefined;
  if (!isRecord(missions) || typeof missions['dayKey'] !== 'string' || typeof missions['unlocked'] !== 'boolean') return null;
  const items = missions['items'];
  if (!Array.isArray(items) || !items.every(isAct)) return null;
  return game as ActAdvanceSource;
}
