import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { OnboardingStepId, OnboardingStepOutcome, OnboardingSuggestion } from '@meeshy/shared/types/onboarding';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import '@/styles/onboarding.css';

import { apiDeps } from '@/lib/api/deps';
import { performSendRequest, type FriendActionOutcome } from '@/lib/api/friend-actions';
import { ONBOARDING_STEPS, onboardingQueryOptions, type OnboardingDeps } from '@/lib/api/onboarding';
import { performProfileEdit } from '@/lib/api/profile-actions';
import { sendAction } from '@/lib/api/query';
import { appQueryClient } from '@/lib/api/query-client';
import { loadEngagementProgress } from '@/lib/api/engagement';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { translateOnboarding } from '@/lib/i18n-onboarding-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { finishJourney, recordStep, type OnboardingActionDeps } from '@/lib/onboarding/actions';
import {
  nextStepAfter,
  pointsOf,
  producedSomething,
  recapOf,
  resumeStep,
  stepPoints,
  withDone,
  withFriendRequest,
  type JourneyContext,
  type JourneyProgress,
  type JourneyStep,
} from '@/lib/onboarding/journey';
import { journeyProgressStore, type JourneyProgressStore } from '@/lib/onboarding/progress-store';
import { useSearch } from '@/lib/router';
import { confirmedCountOf, outboxStore } from '@/lib/send/outbox-store';

import {
  FriendsCard,
  GlobalCard,
  LanguagesCard,
  NotificationsCard,
  StoryCard,
  languageNameIn,
  listIn,
  type CardHost,
  type GreetingSend,
  type LanguagesSave,
} from './onboarding-cards';
import { RecapCard, type RecapNumbers } from './onboarding-recap';
import { PointsPill, ProgressSegments } from './onboarding-visuals';
import { href, navigate } from './route-table';

/**
 * **L'ACCUEIL POST-INSCRIPTION** (#7729) — `/onboarding`, les cinq cartes
 * jouées une fois après l'inscription, sur le web ET sur Android (la coque
 * Capacitor sert cette même page). Miroir d'`OnboardingOverlay.swift`.
 *
 * - **Le serveur arbitre** : l'état (`GET /me/onboarding`) se lit en cache
 *   d'abord (le cache de requêtes est persisté), la reprise rouvre la première
 *   étape absente des étapes vues ET pré-cochées (`journey.ts § resumeStep`).
 * - **« Passer tout » est visible dès la première carte** ; aucun écran ne
 *   bloque, aucune phrase ne parle de perte, aucun compte à rebours.
 * - **Chaque carte finit sur un geste réel** (`onboarding-cards.tsx`) et la
 *   récompense (« +N » qui s'envole vers la pastille) n'apparaît qu'à
 *   l'accusé qui la fonde.
 * - **L'étape 5 n'existe que si 2, 3 ou 4 a produit quelque chose**, et la
 *   fenêtre système ne s'ouvre QUE sur « Oui ».
 */

export type OnboardingScreenDeps = {
  readonly api: OnboardingDeps;
  readonly queryClient: QueryClient;
  readonly progress: JourneyProgressStore;
  readonly sendGreeting: (input: {
    readonly conversationId: string;
    readonly content: string;
    readonly language: string;
    readonly viewerId: string;
    readonly online: boolean;
  }) => Promise<GreetingSend>;
  readonly addFriend: (suggestion: OnboardingSuggestion, viewerId: string | null) => Promise<FriendActionOutcome>;
  readonly saveLanguages: (patch: { readonly systemLanguage: string; readonly regionalLanguage: string }) => Promise<LanguagesSave>;
  readonly notificationsAskable: () => boolean;
  readonly askNotifications: () => Promise<void>;
  readonly loadRecap: () => Promise<RecapNumbers | null>;
  readonly random: () => number;
  readonly navigate: (path: string, replace?: boolean) => void;
};

const browserNotifications = (): typeof Notification | null =>
  typeof globalThis.Notification === 'function' ? globalThis.Notification : null;

export const defaultOnboardingScreenDeps: OnboardingScreenDeps = {
  api: apiDeps,
  queryClient: appQueryClient,
  progress: journeyProgressStore,
  sendGreeting: async ({ conversationId, content, language, viewerId, online }) => {
    if (!online) return 'offline';
    const before = confirmedCountOf(outboxStore.getState(), conversationId);
    await sendAction({ conversationId, draft: { content, originalLanguage: language }, viewerId, online });
    return confirmedCountOf(outboxStore.getState(), conversationId) > before ? 'sent' : 'failed';
  },
  addFriend: (suggestion, viewerId) =>
    performSendRequest({
      person: { id: suggestion.id, username: suggestion.username, displayName: suggestion.displayName, avatar: suggestion.avatarUrl },
      deps: { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine, viewerId: () => viewerId },
    }),
  saveLanguages: async (patch) => {
    const outcome = await performProfileEdit({
      patch,
      deps: { ...apiDeps, queryClient: appQueryClient, session: sessionStore, isOnline: () => navigator.onLine },
    });
    return outcome.status === 'saved' ? 'saved' : outcome.status === 'offline' ? 'offline' : 'failed';
  },
  notificationsAskable: () => browserNotifications()?.permission === 'default',
  askNotifications: async () => {
    await browserNotifications()?.requestPermission();
  },
  /* Les chiffres RELUS du serveur. En fixtures, aucun : le corpus de la
     progression (`engagement-fixture.ts`) décrit un compte ANCIEN, celui de
     l'accueil un compte NEUF — les mêler peindrait « niveau 5 » au bout d'un
     premier parcours. Le récapitulatif retombe alors sur ce que l'écran a vu
     se confirmer. */
  loadRecap: async () => {
    if (apiDeps.source === 'fixtures') return null;
    const result = await loadEngagementProgress(apiDeps);
    if (!result.ok) return null;
    const { level, streak, badgesEarned } = result.data;
    return { points: level.value, level: level.level, streakDays: streak.currentDays, badges: badgesEarned };
  },
  random: Math.random,
  navigate,
};

const isStepId = (value: string | null): value is OnboardingStepId =>
  value !== null && (ONBOARDING_STEPS as readonly string[]).includes(value);

const FLIGHT_MS = 1300;
const BUMP_AT_MS = 850;

type Flight = { readonly points: number; readonly key: number };

function useRewardFlight(lang: InterfaceLanguage) {
  const [flight, setFlight] = useState<Flight | null>(null);
  const [bump, setBump] = useState(false);
  /* Les points EN VOL : la pastille ne les compte qu'à l'arrivée du « +N »,
     sans quoi le chiffre changerait avant que le lecteur ait vu d'où il vient. */
  const [travelling, setTravelling] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const celebrate = useCallback(
    (points: number) => {
      if (points <= 0) return;
      setAnnouncement(translateOnboarding(lang, 'onboarding.points.announce', { points: String(points) }));
      setFlight({ points, key: Date.now() });
      setTravelling(points);
      timers.current.push(
        setTimeout(() => {
          setTravelling(0);
          setBump(true);
        }, BUMP_AT_MS),
        setTimeout(() => {
          setBump(false);
          setFlight(null);
        }, FLIGHT_MS),
      );
    },
    [lang],
  );

  return { flight, bump, travelling, announcement, celebrate };
}

/** « Étape N sur M » — M compte les étapes de CE parcours : ni celles que le
 * serveur a pré-cochées, ni l'étape 5 tant que rien ne l'appelle. */
function journeyPositions(context: JourneyContext, current: JourneyStep): { readonly position: number; readonly count: number } {
  const offersNotifications = context.notificationsAskable && producedSomething(context);
  const offered = ONBOARDING_STEPS.filter(
    (step) => step === current || (!context.state.prefilledSteps.includes(step) && (step !== 'notifications' || offersNotifications)),
  );
  const index = current === 'recap' ? offered.length : offered.indexOf(current) + 1;
  return { position: Math.max(1, index), count: Math.max(1, offered.length) };
}

export default function OnboardingScreen() {
  const [search, setSearch] = useSearch();
  const clearSearch = useCallback(() => setSearch(new URLSearchParams(), true), [setSearch]);
  return <OnboardingJourney deps={defaultOnboardingScreenDeps} search={search} clearSearch={clearSearch} />;
}

/** Le parcours, hors du routeur — ce que les témoins montent. */
export function OnboardingJourney({
  deps,
  search,
  clearSearch,
}: {
  readonly deps: OnboardingScreenDeps;
  readonly search: URLSearchParams;
  readonly clearSearch: () => void;
}) {
  const lang = currentInterfaceLanguage();
  const online = useOnline();
  const session = useStore(sessionStore, (s) => s.session);
  const viewer = resolveViewer({ source: deps.api.source, session });
  const viewerKey = viewer.id ?? 'anonyme';
  const query = useQuery(onboardingQueryOptions(deps.api), deps.queryClient);
  const state = query.data;

  const [progress, setProgressState] = useState<JourneyProgress>(() => deps.progress.read(viewerKey));
  const setProgress = useCallback(
    (update: (current: JourneyProgress) => JourneyProgress) =>
      setProgressState((current) => {
        const next = update(current);
        deps.progress.write(viewerKey, next);
        return next;
      }),
    [deps.progress, viewerKey],
  );

  const [askable] = useState(() => deps.notificationsAskable());
  const [step, setStep] = useState<JourneyStep | null>(null);
  const [storyPublished, setStoryPublished] = useState(false);
  const { flight, bump, travelling, announcement, celebrate } = useRewardFlight(lang);
  const actionDeps: OnboardingActionDeps = useMemo(() => ({ ...deps.api, queryClient: deps.queryClient }), [deps.api, deps.queryClient]);

  const context = useMemo<JourneyContext | null>(
    () => (state === undefined ? null : { state, progress, notificationsAskable: askable }),
    [state, progress, askable],
  );

  /* L'ENTRÉE — une fois l'état connu (cache d'abord) : `?story=published` au
     retour du studio, sinon `?step=` (un lien de reprise), sinon la première
     étape manquante. Le paramètre est retiré de l'adresse : un rechargement
     ne rejoue pas la récompense. */
  useEffect(() => {
    if (context === null || step !== null) return;
    if (search.get('story') === 'published') {
      setStoryPublished(true);
      setProgress((current) => withDone(current, 'story'));
      celebrate(stepPoints('story'));
      setStep('story');
      clearSearch();
      return;
    }
    const asked = search.get('step');
    if (isStepId(asked)) {
      setStep(asked);
      return;
    }
    /* Un parcours CLOS (fini, passé, ou plus de sept jours) ne se rejoue pas :
       l'adresse, tapée ou gardée en favori, rend l'accueil. */
    if (!context.state.eligible) {
      deps.navigate(href('list'), true);
      return;
    }
    setStep(resumeStep(context));
  }, [context, step, search, clearSearch, setProgress, celebrate, deps]);

  const leave = useCallback(
    (path: string) => {
      void finishJourney(actionDeps);
      deps.navigate(path, true);
    },
    [actionDeps, deps],
  );

  const advance = useCallback(
    (from: OnboardingStepId, outcome: OnboardingStepOutcome) => {
      if (context === null) return;
      void recordStep(actionDeps, from, outcome);
      setStep(nextStepAfter(from, context));
    },
    [actionDeps, context],
  );

  const reward = useCallback(
    (step: OnboardingStepId) => {
      setProgress((current) => withDone(current, step));
      celebrate(stepPoints(step));
    },
    [setProgress, celebrate],
  );

  if (context === null || state === undefined || step === null) {
    return <OnboardingSkeleton lang={lang} failed={query.isError} onLater={() => deps.navigate(href('list'), true)} />;
  }

  const sessionPoints = pointsOf(progress);
  const host: CardHost = { lang, online, points: sessionPoints };
  const { position, count } = journeyPositions(context, step);
  const account = session.status === 'authenticated' ? session.user : null;
  const primaryLanguage = account?.systemLanguage ?? lang;
  const secondaryLanguage = account?.regionalLanguage ?? null;
  const displayName = account?.displayName ?? account?.username ?? (viewer.displayName === '' ? (viewer.handle ?? '') : viewer.displayName);
  const avatar = account?.avatar ?? viewer.avatar;
  const languagesLabel = listIn(lang, [primaryLanguage, ...(secondaryLanguage === null ? [] : [secondaryLanguage])].map((code) => languageNameIn(lang, code)));

  return (
    <main data-onboarding className="onb" dir={lang === 'ar' ? 'rtl' : 'ltr'} aria-label={translateOnboarding(lang, 'onboarding.title')}>
      <div className="onb-backdrop" aria-hidden="true" />
      <header className="onb-top">
        <div className="onb-top-row">
          {step === 'recap' ? (
            <span />
          ) : (
            <span className="onb-pill-anchor">
              <PointsPill points={Math.max(0, sessionPoints - travelling)} bump={bump} label={translateOnboarding(lang, 'onboarding.points.announce', { points: String(sessionPoints) })} />
              {flight === null ? null : (
                <span key={flight.key} data-onb-flight className="onb-flight" dir="ltr" aria-hidden="true">
                  {translateOnboarding(lang, 'onboarding.points.gained', { points: String(flight.points) })}
                </span>
              )}
            </span>
          )}
          {step === 'recap' ? null : (
            <button type="button" data-onb-action="skipAll" className="onb-skip" onClick={() => leave(href('list'))}>
              {translateOnboarding(lang, 'onboarding.skipAll')}
            </button>
          )}
        </div>
        {step === 'recap' ? null : (
          <ProgressSegments
            position={position}
            count={count}
            label={translateOnboarding(lang, 'onboarding.progress', { current: String(position), total: String(count) })}
          />
        )}
      </header>

      <div key={step} className="onb-stage">
        {step === 'languages' ? (
          <LanguagesCard
            host={host}
            initialPrimary={primaryLanguage}
            initialSecondary={secondaryLanguage}
            save={deps.saveLanguages}
            onDone={() => advance('languages', 'done')}
            onLater={() => advance('languages', 'skipped')}
          />
        ) : step === 'global' ? (
          <GlobalCard
            host={host}
            available={state.globalConversationId !== null}
            name={displayName}
            languagesLabel={languagesLabel}
            pick={(n) => Math.floor(deps.random() * n)}
            send={(content) =>
              state.globalConversationId === null || viewer.id === null
                ? Promise.resolve<GreetingSend>('failed')
                : deps.sendGreeting({ conversationId: state.globalConversationId, content, language: lang, viewerId: viewer.id, online })
            }
            onReward={() => reward('global')}
            onDone={() => advance('global', 'done')}
            onLater={() => advance('global', 'skipped')}
          />
        ) : step === 'story' ? (
          <StoryCard
            host={host}
            audience={state.storyDefaultVisibility}
            name={displayName}
            avatar={avatar}
            published={storyPublished}
            onOpen={() => deps.navigate(href('storyCompose', undefined, { audience: state.storyDefaultVisibility, from: 'onboarding' }))}
            onDone={() => advance('story', 'done')}
            onLater={() => advance('story', 'skipped')}
          />
        ) : step === 'friends' ? (
          <FriendsCard
            host={host}
            suggestions={state.suggestions}
            alreadySent={progress.friendRequests}
            add={(suggestion) => deps.addFriend(suggestion, viewer.id)}
            onSent={(userId) => setProgress((current) => withFriendRequest(current, userId))}
            onDone={() => advance('friends', 'done')}
            onLater={() => advance('friends', 'skipped')}
          />
        ) : step === 'notifications' ? (
          <NotificationsCard
            host={host}
            onYes={() => void deps.askNotifications().finally(() => advance('notifications', 'done'))}
            onNo={() => advance('notifications', 'skipped')}
          />
        ) : (
          <RecapCard
            host={host}
            session={recapOf(progress)}
            load={deps.loadRecap}
            onExplore={() => leave(state.globalConversationId === null ? href('list') : href('thread', { conversation: state.globalConversationId }))}
            onDone={() => leave(href('list'))}
          />
        )}
      </div>

      <p className="offscreen" aria-live="polite" data-onb-announce>
        {announcement}
      </p>
    </main>
  );
}

function OnboardingSkeleton({ lang, failed, onLater }: { readonly lang: InterfaceLanguage; readonly failed: boolean; readonly onLater: () => void }) {
  return (
    <main data-onboarding className="onb" aria-busy={!failed} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="onb-backdrop" aria-hidden="true" />
      <div className="onb-stage">
        <div className="onb-card-frame">
          <div className="onb-card-scroll">
            <div className="onb-card glass glass-card onb-card-skeleton">
              <span className="onb-skeleton-disc" />
              <span className="onb-skeleton-line" />
              <span className="onb-skeleton-line onb-skeleton-line-short" />
              {failed ? <p className="onb-note">{translateOnboarding(lang, 'onboarding.offline')}</p> : null}
            </div>
          </div>
          {failed ? (
            <div className="onb-actions">
              <button type="button" className="onb-secondary" onClick={onLater}>
                {translateOnboarding(lang, 'onboarding.later')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

