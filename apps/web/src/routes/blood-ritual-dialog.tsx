import { RELATION_RITUAL_CONSENT_KEYS, type RelationRitualConsentKey, type RelationRitualStage } from '@meeshy/shared/types/socketio-events/relation';
import { RELATION_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/relation-event-names';
import { useEffect, useReducer, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { Sheet } from '@/components/sheet';
import { apiDeps } from '@/lib/api/deps';
import { relationRefusalOf, runRitualPhase, type RelationDeps } from '@/lib/api/relations';
import { translateCircles, type CirclesCatalogKey } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { INITIAL_RITUAL, holdIntervalMs, reduceRitual, shouldSeal, type RitualEvent, type RitualNotice, type RitualState } from '@/lib/relations/blood-ritual';
import { relationLevelIcon } from '@/lib/relations/level-labels';
import type { SocketClient } from '@/lib/net/socket';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';

/**
 * **LE RITUEL DU SANG** (#13938) — miroir de `BloodRitualView`
 * (`apps/ios/Meeshy/Features/Contacts/`) : des consentements explicites d'abord,
 * un à un, tous refusés au départ et chacun avec son DÉPLIANT (ce que le partage
 * montre, à qui, combien de temps) ; puis les DEUX tiennent l'écran en même
 * temps — l'anneau pulse tant qu'on attend l'autre, se remplit quand les deux
 * sont synchronisés, et le scellement part tout seul. Lâcher est calme : rien
 * n'est enregistré.
 *
 * La machine est pure (`lib/relations/blood-ritual.ts`) ; cette feuille joue les
 * requêtes (`POST /relations/:userId/ritual`) et lui rend leur issue, et écoute
 * `relation:ritual-*` par `watchLiveSocket` tant qu'elle est ouverte.
 *
 * **Tenir sans souris** : l'anneau est un bouton ; maintenir Espace tient
 * l'écran, relâcher le lâche — la phrase d'aide le dit. Sans mouvement réduit,
 * l'anneau pulse ; avec, il ne bouge pas.
 */

type Payload = Readonly<Record<string, unknown>>;

const objectOf = (raw: unknown): Payload | null => (typeof raw === 'object' && raw !== null ? (raw as Payload) : null);

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const STAGES: readonly RelationRitualStage[] = ['held', 'confirmed', 'lapsed'];

/** Les trois événements du rituel, lus pour CETTE personne seulement ; une charge illisible n'est pas appliquée. */
export function ritualEventOf(event: string, raw: unknown, userId: string): RitualEvent | null {
  const payload = objectOf(raw);
  if (payload === null || payload.userId !== userId) return null;
  const token = textOf(payload.token);
  if (event === RELATION_SERVER_EVENTS.RELATION_RITUAL_STARTED) return { type: 'other-started' };
  if (token === null) return null;
  if (event === RELATION_SERVER_EVENTS.RELATION_RITUAL_COMPLETED) return { type: 'other-completed', token };
  const stage = STAGES.find((candidate) => candidate === payload.stage);
  return event === RELATION_SERVER_EVENTS.RELATION_RITUAL_PROGRESS && stage !== undefined ? { type: 'other-progress', token, stage } : null;
}

const RITUAL_EVENTS = [
  RELATION_SERVER_EVENTS.RELATION_RITUAL_STARTED,
  RELATION_SERVER_EVENTS.RELATION_RITUAL_PROGRESS,
  RELATION_SERVER_EVENTS.RELATION_RITUAL_COMPLETED,
] as const;

function bindRitualLive(socket: SocketClient, userId: string, dispatch: (event: RitualEvent) => void): () => void {
  const handlers = RITUAL_EVENTS.map((name) => {
    const handler = (raw: unknown): void => {
      const event = ritualEventOf(name, raw, userId);
      if (event !== null) dispatch(event);
    };
    socket.on(name, handler);
    return [name, handler] as const;
  });
  return () => handlers.forEach(([name, handler]) => socket.off(name, handler));
}

function useRitualLive(userId: string, dispatch: (event: RitualEvent) => void): void {
  useEffect(() => {
    let live = true;
    let stop: (() => void) | null = null;
    void import('@/lib/api/realtime').then(
      ({ watchLiveSocket }) => {
        if (live) stop = watchLiveSocket((socket) => bindRitualLive(socket, userId, dispatch));
      },
      () => undefined,
    );
    return () => {
      live = false;
      stop?.();
    };
  }, [userId, dispatch]);
}

/**
 * Le PILOTE : les requêtes que chaque état demande. Une tenue se rejoue tous
 * les tiers de fenêtre tant que le doigt reste posé ; le scellement part dès que
 * `shouldSeal` le dit, une seule fois par tenue.
 */
function useRitualDriver(params: { readonly deps: RelationDeps; readonly userId: string; readonly state: RitualState; readonly dispatch: (event: RitualEvent) => void }): void {
  const { deps, userId, state, dispatch } = params;
  const { stage, holding, token, consents } = state;
  const interval = holdIntervalMs(state);

  useEffect(() => {
    if (stage !== 'opening') return;
    void runRitualPhase(deps, { userId, phase: 'start' }).then((result) =>
      dispatch(result.ok ? { type: 'opened', token: result.data.token, holdWindowMs: result.data.holdWindowMs } : { type: 'open-failed', refusal: relationRefusalOf(result) }),
    );
  }, [deps, userId, stage, dispatch]);

  useEffect(() => {
    if (!holding || token === null) return undefined;
    let live = true;
    const post = (): void => {
      void runRitualPhase(deps, { userId, phase: 'hold', token }).then((result) => {
        if (!live) return;
        dispatch(result.ok ? { type: 'hold-acked' } : { type: 'hold-failed', refusal: relationRefusalOf(result) });
      });
    };
    post();
    const timer = setInterval(post, interval);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [deps, userId, holding, token, interval, dispatch]);

  const sealNow = shouldSeal(state);
  useEffect(() => {
    if (!sealNow || token === null) return;
    dispatch({ type: 'seal-started' });
    void runRitualPhase(deps, { userId, phase: 'confirm', token, consents }).then((result) =>
      dispatch(result.ok ? { type: 'sealed', completed: result.data.completed === true } : { type: 'seal-failed', refusal: relationRefusalOf(result) }),
    );
  }, [deps, userId, sealNow, token, consents, dispatch]);
}

const NOTICE_KEY = {
  busy: 'circles.ritual.busy',
  openFailed: 'circles.ritual.openFailed',
  sealFailed: 'circles.ritual.sealFailed',
} as const satisfies Readonly<Record<RitualNotice, CirclesCatalogKey>>;

const NOTICE_MS = 4000;

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const BLOOD = 'var(--color-error)';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
const PRIMARY = `grid w-full place-items-center rounded-chip px-5 text-body font-semibold text-ios-on-brand ${FOCUS}`;

function ConsentStep({ language, name, state, dispatch }: { readonly language: InterfaceLanguage; readonly name: string; readonly state: RitualState; readonly dispatch: (event: RitualEvent) => void }) {
  return (
    <div className="grid gap-4">
      <p className="text-body" style={{ color: INK_2 }}>
        {translateCircles(language, 'circles.ritual.consent.intro', { name })}
      </p>
      {RELATION_RITUAL_CONSENT_KEYS.map((key: RelationRitualConsentKey) => (
        <label key={key} className="grid gap-0.5" style={{ color: INK }}>
          <span className="flex items-center gap-3" style={{ minHeight: 44 }}>
            <span className="min-w-0 flex-1 text-body font-semibold">{translateCircles(language, `circles.ritual.consent.${key}`)}</span>
            <input
              type="checkbox"
              role="switch"
              data-ritual-consent={key}
              checked={state.consents[key]}
              aria-describedby={`ritual-consent-${key}`}
              onChange={(event) => dispatch({ type: 'consent', key, granted: event.currentTarget.checked })}
              className="size-5 shrink-0"
            />
          </span>
          <span id={`ritual-consent-${key}`} className="text-caption" style={{ color: INK_2 }}>
            {translateCircles(language, `circles.ritual.consent.${key}.detail`)}
          </span>
        </label>
      ))}
      <button type="button" data-ritual-continue onClick={() => dispatch({ type: 'proceed' })} className={PRIMARY} style={{ minHeight: 44, backgroundColor: 'var(--ios-indigo-600)', outlineColor: 'var(--color-ios-brand)' }}>
        {translateCircles(language, 'circles.ritual.consent.continue')}
      </button>
    </div>
  );
}

const ringFill = (state: RitualState): number => (state.stage === 'synchronised' || state.stage === 'awaitingOther' ? 1 : state.otherHolding ? 0.5 : 0.15);

function holdCaption(language: InterfaceLanguage, name: string, state: RitualState): string {
  if (state.stage === 'synchronised') return translateCircles(language, 'circles.ritual.synchronised');
  if (state.stage === 'awaitingOther') return translateCircles(language, 'circles.ritual.awaiting', { name });
  return state.holding ? translateCircles(language, 'circles.ritual.waitingOther', { name }) : translateCircles(language, 'circles.ritual.hold');
}

/** Les transitions et la pulsation sont coupées par la règle générale `prefers-reduced-motion` (`styles/app.css`). */
const RING_SIZE = 180;
const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function HoldStep({ language, name, state, dispatch }: { readonly language: InterfaceLanguage; readonly name: string; readonly state: RitualState; readonly dispatch: (event: RitualEvent) => void }) {
  const begin = (): void => dispatch({ type: 'hold-began' });
  const end = (): void => dispatch({ type: 'hold-ended' });
  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) begin();
  };
  const onKeyUp = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    end();
  };
  const fill = ringFill(state);
  return (
    <div className="grid justify-items-center gap-4 text-center">
      <button
        type="button"
        data-ritual-ring
        aria-pressed={state.holding}
        aria-describedby="ritual-hold-hint"
        aria-label={translateCircles(language, 'circles.ritual.hold')}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onContextMenu={(event) => event.preventDefault()}
        className={`relative grid touch-none select-none place-items-center rounded-full ${state.holding ? '' : 'motion-safe:animate-pulse'} ${FOCUS}`}
        style={{ width: RING_SIZE, height: RING_SIZE, outlineColor: BLOOD }}
      >
        <svg aria-hidden="true" viewBox="0 0 180 180" className="absolute inset-0 size-full -rotate-90">
          <circle cx="90" cy="90" r={RADIUS} fill="none" strokeWidth="8" style={{ stroke: `color-mix(in srgb, ${BLOOD} 20%, transparent)` }} />
          <circle
            cx="90"
            cy="90"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fill)}
            style={{ stroke: BLOOD, transition: 'stroke-dashoffset 300ms ease-out' }}
          />
        </svg>
        <span aria-hidden="true" style={{ fontSize: '2.5rem' }}>
          {relationLevelIcon('BLOOD')}
        </span>
      </button>
      <p role="status" data-ritual-caption className="text-body font-semibold" style={{ color: INK }}>
        {holdCaption(language, name, state)}
      </p>
      <p id="ritual-hold-hint" className="text-caption" style={{ color: INK_2 }}>
        {translateCircles(language, 'circles.ritual.hold.hint')}
      </p>
    </div>
  );
}

function Outcome({ language, text, retry, dispatch, onClose }: { readonly language: InterfaceLanguage; readonly text: string; readonly retry: boolean; readonly dispatch: (event: RitualEvent) => void; readonly onClose: () => void }) {
  return (
    <div className="grid justify-items-center gap-4 text-center">
      <p role="status" data-ritual-outcome className="text-body" style={{ color: INK }}>
        {text}
      </p>
      <button
        type="button"
        data-ritual-outcome-action={retry ? 'retry' : 'close'}
        onClick={() => (retry ? dispatch({ type: 'retry' }) : onClose())}
        className={PRIMARY}
        style={{ minHeight: 44, backgroundColor: 'var(--ios-indigo-600)', outlineColor: 'var(--color-ios-brand)' }}
      >
        {translateCircles(language, retry ? 'circles.ritual.retry' : 'circles.sheet.close')}
      </button>
    </div>
  );
}

/** Le CORPS de la feuille, pur : l'état et le geste qu'il offre. */
export function BloodRitualBody({
  language,
  name,
  state,
  dispatch,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly state: RitualState;
  readonly dispatch: (event: RitualEvent) => void;
  readonly onClose: () => void;
}) {
  switch (state.stage) {
    case 'consent':
      return <ConsentStep language={language} name={name} state={state} dispatch={dispatch} />;
    case 'ready':
    case 'opening':
      return (
        <div className="grid gap-3 text-center">
          {state.otherWaiting ? (
            <p role="status" data-ritual-other-waiting className="text-body font-semibold" style={{ color: INK }}>
              {translateCircles(language, 'circles.ritual.otherWaiting', { name })}
            </p>
          ) : null}
          <button
            type="button"
            data-ritual-open
            disabled={state.stage === 'opening'}
            onClick={() => dispatch({ type: 'open-requested', online: navigator.onLine })}
            className={`${PRIMARY} disabled:opacity-60`}
            style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-error) 82%, var(--color-media-backdrop))', outlineColor: BLOOD }}
          >
            {translateCircles(language, 'circles.requests.ritual')}
          </button>
        </div>
      );
    case 'waiting':
    case 'synchronised':
    case 'awaitingOther':
      return <HoldStep language={language} name={name} state={state} dispatch={dispatch} />;
    case 'completed':
      return <Outcome language={language} text={translateCircles(language, 'circles.ritual.completed', { name })} retry={false} dispatch={dispatch} onClose={onClose} />;
    case 'lapsed':
      return <Outcome language={language} text={translateCircles(language, 'circles.ritual.lapsed')} retry dispatch={dispatch} onClose={onClose} />;
    case 'unavailable':
      return (
        <Outcome
          language={language}
          text={translateCircles(language, state.offline ? 'circles.ritual.unavailable.offline' : 'circles.ritual.unavailable.generic')}
          retry={false}
          dispatch={dispatch}
          onClose={onClose}
        />
      );
  }
}

export function BloodRitualDialog({
  language,
  userId,
  name,
  onFinished,
  deps = apiDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly userId: string;
  readonly name: string;
  readonly onFinished: () => void;
  readonly deps?: RelationDeps;
}) {
  const ready = useCirclesCatalog(language);
  const [state, dispatch] = useReducer(reduceRitual, INITIAL_RITUAL);
  useRitualLive(userId, dispatch);
  useRitualDriver({ deps, userId, state, dispatch });
  useEffect(() => {
    if (state.notice === null) return undefined;
    const timer = setTimeout(() => dispatch({ type: 'notice-shown' }), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [state.notice]);
  if (!ready) return null;
  return (
    <Sheet
      title={translateCircles(language, 'circles.ritual.title')}
      presentation="centered"
      bodyAs="div"
      closeLabel={translateCircles(language, 'circles.sheet.close')}
      dialogData={{ 'data-blood-ritual': userId, 'data-ritual-stage': state.stage }}
      onClose={onFinished}
    >
      <div className="grid gap-4 px-5 pb-6">
        <BloodRitualBody language={language} name={name} state={state} dispatch={dispatch} onClose={onFinished} />
        {/* La région vit AVANT qu'on y écrive (leçon 519) : seul son texte change. */}
        <p role="status" data-ritual-notice={state.notice ?? ''} className="text-caption font-semibold" style={{ color: INK, minHeight: '1lh' }}>
          {state.notice === null ? '' : translateCircles(language, NOTICE_KEY[state.notice])}
        </p>
      </div>
    </Sheet>
  );
}
