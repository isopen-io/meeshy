import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { GameBlock } from '@meeshy/shared/types/game';
import { dayDiff, isDayKey } from '@meeshy/shared/utils/game/day-prng';
import {
  ONBOARDING_STEPS,
  chooseGuideMoment,
  nextOnboardingStep,
  onboardingStepSeenKey,
} from '@meeshy/shared/utils/game/guide';

import { httpTransport } from '@/lib/api/client';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { markGuideSeen } from '@/lib/api/game';
import type { HttpTransport } from '@/lib/api/http';
import { cardOfMoment, cardOfStep, type GuideCard } from '@/lib/game-guide/card';
import { standingGuideEvents, transitionGuideEvents } from '@/lib/game-guide/events';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

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
 * Le dernier passage (jour, dans le fuseau du joueur) se garde en local, avec
 * un `try/catch` partout : il ne sert qu'à dire « content de te revoir » après
 * sept jours, jamais à quoi que ce soit d'autre.
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

function openingCard(game: GameBlock, seen: ReadonlySet<string>, daysAway: number | null): GuideCard | null {
  const step = nextOnboardingStep(seen);
  if (step !== null) return cardOfStep(step);
  const moment = chooseGuideMoment(standingGuideEvents(game, seen, { daysAway }), seen);
  return moment === null ? null : cardOfMoment(moment);
}

export function useGameGuide(params: {
  readonly view: EngagementWithGame | undefined;
  readonly transport?: HttpTransport;
  readonly storage?: SafeStorage;
}): GameGuide {
  const { view } = params;
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
      void markGuideSeen(transport, crypto.randomUUID(), keys).catch(() => undefined);
    },
    [client, transport],
  );

  useEffect(() => {
    const game = view?.game;
    if (view === undefined || game === undefined) return;
    for (const key of game.guideSeen) seen.current.add(key);
    const before = previous.current;
    previous.current = view;

    if (!opened.current) {
      opened.current = true;
      const day = game.missions.dayKey;
      const last = lastVisit(storage.current);
      rememberVisit(storage.current, day);
      setCard(openingCard(game, seen.current, last === null ? null : dayDiff(last, day)));
      return;
    }
    if (before === null) return;
    const events = transitionGuideEvents(before, view);
    if (events.length === 0) return;
    const moment = chooseGuideMoment(events, seen.current);
    if (moment === null) return;
    setCard((current) => (current?.step !== undefined ? current : cardOfMoment(moment)));
  }, [view]);

  useEffect(() => {
    if (card === null || seen.current.has(card.key)) return;
    markSeen([card.key]);
  }, [card, markSeen]);

  const dismiss = useCallback(() => {
    setCard((current) => {
      if (current?.step === undefined) return null;
      const next = nextOnboardingStep(seen.current);
      return next === null ? null : cardOfStep(next);
    });
  }, []);

  const skipAll = useCallback(() => {
    const remaining = ONBOARDING_STEPS.map((step) => onboardingStepSeenKey(step.key)).filter((key) => !seen.current.has(key));
    markSeen(remaining);
    setCard(null);
  }, [markSeen]);

  return { card, dismiss, skipAll };
}
