import { useEffect, useRef, useState } from 'react';

import type { ActAdvance } from '@meeshy/shared/utils/game/act-advance';

import { ENGAGEMENT_PROGRESS_QUERY_KEY } from '@/lib/api/game-state-order';
import { appQueryClient } from '@/lib/api/query-client';
import { useGamePrefs } from '@/lib/game/preferences';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { ACT_ADVANCE_ARMED_MS, ACT_ADVANCE_SHOWN_MS, actAdvanceLabel, watchActAdvance } from '@/lib/view/act-advance';

import { MeeshyGlass } from './kit/meeshy-glass-tone';

type ProgressSource = {
  readonly read: () => unknown;
  readonly subscribe: (listener: () => void) => () => void;
};

/** Le cache de la progression que `game:updated` et `game:missions-updated` tiennent à jour — aucune requête ici. */
const progressCache: ProgressSource = {
  read: () => appQueryClient.getQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY),
  subscribe: (listener) => appQueryClient.getQueryCache().subscribe(listener),
};

/**
 * **L'ACTE QUI AVANCE, DANS LA CONVERSATION** (#17367) — après un envoi qui fait avancer un acte du Rêve, une pastille
 * discrète dit « Acte II · 3 sur 5 » sous l'en-tête, puis s'efface. Elle ne recouvre ni la zone de saisie ni la couleur
 * d'accent : capsule de verre neutre, posée en haut du défileur, insensible au toucher. Le lecteur d'écran la lit
 * (`role="status"`).
 *
 * `sent` compte les messages partis (le même compte que la flamme de l'en-tête rejoue) : chaque valeur > 0 arme le
 * guet pour `armedMs`. Rien sans envoi, rien sous « Jeu masqué », rien quand l'acte n'avance pas. Le composant ne se
 * rend qu'à l'envoi et à l'avancée : la frappe ne le touche pas.
 */
export function ActAdvancePill({
  sent,
  source = progressCache,
  language,
  armedMs = ACT_ADVANCE_ARMED_MS,
  shownMs = ACT_ADVANCE_SHOWN_MS,
}: {
  readonly sent: number;
  readonly source?: ProgressSource;
  readonly language?: InterfaceLanguage;
  readonly armedMs?: number;
  readonly shownMs?: number;
}) {
  const hidden = useGamePrefs().hidden;
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const [advance, setAdvance] = useState<ActAdvance | null>(null);

  useEffect(() => {
    if (sent <= 0) return undefined;
    const stop = watchActAdvance({ ...source, hidden: () => hiddenRef.current, onAdvance: setAdvance });
    const disarm = setTimeout(stop, armedMs);
    return () => {
      clearTimeout(disarm);
      stop();
    };
  }, [sent, source, armedMs]);

  useEffect(() => {
    if (advance === null) return undefined;
    const timer = setTimeout(() => setAdvance(null), shownMs);
    return () => clearTimeout(timer);
  }, [advance, shownMs]);

  if (advance === null || hidden) return null;
  return (
    <div className="thread-act-pill pointer-events-none absolute inset-x-0 z-10 flex justify-center">
      <MeeshyGlass
        as="span"
        role="status"
        tone="theme"
        tint="card"
        data-act-advance={advance.difficulty}
        className="rounded-chip px-3 py-1.5 text-time font-semibold"
        style={{ color: 'var(--color-day-ink)', border: '0.5px solid var(--color-day-hairline)' }}
      >
        {actAdvanceLabel(advance, language ?? currentInterfaceLanguage())}
      </MeeshyGlass>
    </div>
  );
}
