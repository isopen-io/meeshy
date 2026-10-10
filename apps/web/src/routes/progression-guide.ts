import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { GameBlock } from '@meeshy/shared/types/game';
import { dayDiff, isDayKey } from '@meeshy/shared/utils/game/day-prng';
import { ONBOARDING_STEPS, nextOnboardingStep, onboardingStepSeenKey } from '@meeshy/shared/utils/game/guide';
import { chooseGuideMomentAny } from '@meeshy/shared/utils/game/guide-v2';

import { httpTransport } from '@/lib/api/client';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { markGuideSeen } from '@/lib/api/game';
import type { HttpTransport } from '@/lib/api/http';
import { cardOfMoment, cardOfStep, type GuideCard } from '@/lib/game-guide/card';
import { standingGuideEvents, transitionGuideEvents } from '@/lib/game-guide/events';
import { eventsBetween, snapshotOf, standingGuideEventsV2, transitionGuideEventsV2 } from '@/lib/game-guide/events-v2';
import { recallSnapshot, rememberSnapshot } from '@/lib/game-guide/memory';
import type { GuideSnapshot } from '@/lib/game-guide/events-v2';
import { awaitingGesture, openingStep } from '@/lib/game-guide/gesture';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';
import { localDayOf } from '@/lib/view/engagement-pill';

/**
 * LE GUIDE D'UNE OUVERTURE D'ÉCRAN (#9379) — quelle carte Mee et Meo montrent,
 * et quand elles la considèrent comme vue.
 *
 *  1. À l'OUVERTURE (première lecture portant le bloc `game`) : l'intégration
 *     d'abord — la première étape que le serveur n'a pas vue —, sinon UN moment
 *     (`chooseGuideMoment`, la loi partagée : le plus important, un inédit
 *     passant devant un déjà vu). Une seule carte, jamais plusieurs.
 *  2. PENDANT que l'écran est ouvert : une transition (un palier franchi, une
 *     frappe) remplace la carte, sauf pendant l'intégration, qu'elle ne
 *     coupe pas.
 *  3. Une carte est VUE dès qu'elle s'affiche : sa clé part à
 *     `POST /me/game/guide/seen` et entre aussitôt dans le cache, pour que la
 *     prochaine ouverture la dise en version COURTE. Un envoi refusé ne retire
 *     pas la carte : c'est le prix d'un hors-ligne, la carte se redira.
 *  4. Chaque étape peut se passer ; passer une étape montre la suivante, passer
 *     l'intégration marque les restantes en UN envoi.
 *
 * Trois étapes demandent un GESTE (`lib/game-guide/gesture.ts` : le premier
 * geste, la mission facile, revenir le lendemain pour la Flamme). Elles
 * n'avancent pas par une carte : à l'ouverture, la dernière étape vue dont le
 * geste manque se REDIT au lieu de passer à la suivante, et pendant que l'écran
 * est ouvert elle avance d'elle-même dès que le bloc `game` montre que le geste
 * a eu lieu. « Passer » reste possible à tout moment.
 *
 * Le dernier passage (jour, dans le fuseau du joueur) se garde en local, avec
 * un `try/catch` partout : il ne sert qu'à dire « content de te revoir » après
 * sept jours, jamais à quoi que ce soit d'autre. Le jour est celui de
 * l'APPAREIL : la première lecture peut venir du cache (cache-first), et son
 * `dayKey` est alors celui de la dernière visite — le compter ferait taire le
 * retour, puis le dire à tort la fois suivante.
 *
 * `settled` est faux tant qu'un geste du jeu est EN VOL : la lecture montrée
 * est alors l'optimiste, et une transition ne se célèbre qu'une fois le geste
 * réglé — un geste refusé (restauré) ne laisse ni carte ni clé vue.
 */

export type GameGuide = {
  readonly card: GuideCard | null;
  /** « Plus tard » / « Passer » : écarte la carte (pendant l'intégration, montre l'étape suivante). */
  readonly dismiss: () => void;
  /** « Passer l'intégration ». */
  readonly skipAll: () => void;
};

const VISIT_KEY = 'meeshy.game.last-visit';

function lastVisit(storage: SafeStorage): string | null {
  try {
    const stored = storage.getItem(VISIT_KEY);
    return stored !== null && isDayKey(stored) ? stored : null;
  } catch {
    return null;
  }
}

function rememberVisit(storage: SafeStorage, day: string): void {
  try {
    storage.setItem(VISIT_KEY, day);
  } catch {
    /* Stockage refusé : on ne dira simplement pas « content de te revoir ». */
  }
}

/**
 * Les moments de l'ouverture : l'ÉTAT (les découvertes, les urgences) et, depuis
 * la vague 2, ce qui est arrivé PENDANT l'absence — la comparaison à l'instantané
 * que l'appareil a gardé (`memory.ts`) : une montée de ligue tombe le dimanche soir.
 */
function openingCard(
  view: EngagementWithGame,
  game: GameBlock,
  seen: ReadonlySet<string>,
  daysAway: number | null,
  remembered: GuideSnapshot | null,
): GuideCard | null {
  const step = openingStep(view, seen);
  if (step !== null) return cardOfStep(step, view);
  const moment = chooseGuideMomentAny(
    [
      ...standingGuideEvents(game, seen, { daysAway }),
      ...standingGuideEventsV2(game, seen),
      ...(remembered === null ? [] : eventsBetween(remembered, snapshotOf(game))),
    ],
    seen,
  );
  return moment === null ? null : cardOfMoment(moment);
}

/**
 * L'étape qui attendait son geste et l'a vu avoir lieu avance : la carte de la
 * suivante, ou `null` quand l'intégration est finie. `undefined` : rien ne
 * change (la carte n'attend pas, ou son geste manque encore).
 */
function advancedStep(current: GuideCard | null, view: EngagementWithGame, seen: ReadonlySet<string>): GuideCard | null | undefined {
  if (current?.awaiting !== true || current.stepKey === undefined) return undefined;
  if (awaitingGesture(current.stepKey, view)) return undefined;
  const next = nextOnboardingStep(seen);
  return next === null ? null : cardOfStep(next, view);
}

export function useGameGuide(params: {
  readonly view: EngagementWithGame | undefined;
  readonly transport?: HttpTransport;
  readonly storage?: SafeStorage;
  readonly settled?: boolean;
  /** Le jour civil de l'appareil (`AAAA-MM-JJ`) ; injectable pour les témoins. */
  readonly today?: () => string;
  /** Le compte : la mémoire de l'appareil (`memory.ts`) est clée par lui. `null` : pas de mémoire, le guide ne raconte que l'état. */
  readonly userId?: string | null;
}): GameGuide {
  const { view } = params;
  const userId = params.userId ?? null;
  const settled = params.settled ?? true;
  const today = useRef(params.today ?? (() => localDayOf(Date.now())));
  const transport = params.transport ?? httpTransport;
  const client = useQueryClient();
  const storage = useRef(params.storage ?? safeLocalStorage());
  const [card, setCard] = useState<GuideCard | null>(null);
  const seen = useRef(new Set<string>());
  const opened = useRef(false);
  const previous = useRef<EngagementWithGame | null>(null);

  const markSeen = useCallback(
    (keys: readonly string[]) => {
      if (keys.length === 0) return;
      for (const key of keys) seen.current.add(key);
      client.setQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY, (current) =>
        current?.game === undefined
          ? current
          : { ...current, game: { ...current.game, guideSeen: [...new Set([...current.game.guideSeen, ...keys])] } },
      );
      void markGuideSeen(transport, newClientMessageId(), keys).catch(() => undefined);
    },
    [client, transport],
  );

  useEffect(() => {
    const game = view?.game;
    if (view === undefined || game === undefined || !settled) return;
    for (const key of game.guideSeen) seen.current.add(key);
    const before = previous.current;
    previous.current = view;

    if (!opened.current) {
      opened.current = true;
      const day = today.current();
      const last = lastVisit(storage.current);
      rememberVisit(storage.current, day);
      const remembered = userId === null ? null : recallSnapshot(storage.current, userId);
      setCard(openingCard(view, game, seen.current, last === null ? null : dayDiff(last, day), remembered));
      if (userId !== null) rememberSnapshot(storage.current, userId, snapshotOf(game));
      return;
    }
    if (userId !== null) rememberSnapshot(storage.current, userId, snapshotOf(game));
    setCard((current) => {
      const advanced = advancedStep(current, view, seen.current);
      return advanced === undefined ? current : advanced;
    });
    if (before === null) return;
    const events = [...transitionGuideEvents(before, view), ...transitionGuideEventsV2(before, view)];
    if (events.length === 0) return;
    const moment = chooseGuideMomentAny(events, seen.current);
    if (moment === null) return;
    setCard((current) => (current?.step !== undefined ? current : cardOfMoment(moment)));
  }, [view, settled, userId]);

  useEffect(() => {
    if (card === null || seen.current.has(card.key)) return;
    markSeen([card.key]);
  }, [card, markSeen]);

  const dismiss = useCallback(() => {
    setCard((current) => {
      if (current?.step === undefined) return null;
      const next = nextOnboardingStep(seen.current);
      return next === null ? null : cardOfStep(next, previous.current ?? undefined);
    });
  }, []);

  const skipAll = useCallback(() => {
    const remaining = ONBOARDING_STEPS.map((step) => onboardingStepSeenKey(step.key)).filter((key) => !seen.current.has(key));
    markSeen(remaining);
    setCard(null);
  }, [markSeen]);

  return { card, dismiss, skipAll };
}
