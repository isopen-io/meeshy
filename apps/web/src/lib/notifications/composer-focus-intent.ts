import { COMPOSE_PARAM } from './content-detail';
import { NOTIFICATION_CLICKED_MESSAGE } from './tap-navigation';

/**
 * **« RÉPONDRE » POSE LE CURSEUR DANS LE COMPOSEUR** (#8860) — jumeau web de
 * l'action texte `notifications.action.reply` iOS. Le navigateur n'offre pas
 * de saisie dans une notification : « Répondre » ouvre le fil ET y met le
 * curseur, sans quoi le bouton ferait exactement ce que fait le toucher du
 * corps — un contrôle qui ment (loi 4).
 *
 * L'intention arrive par trois portes : l'adresse d'un onglet NEUF ouvert par
 * le worker (`?ecrire=1`, retirée aussitôt pour qu'un rechargement ne vole pas
 * le focus), le message qu'un onglet DÉJÀ OUVERT reçoit du worker
 * (`compose: true`, à côté de l'adresse que `tap-navigation.ts` suit), et le
 * bouton de la bannière in-app, qui appelle `focusComposerWhenReady` lui-même.
 */

export const COMPOSER_INPUT_SELECTOR = '[data-composer] textarea';

/** Le fil s'ouvre depuis un chunk et un cache : on attend son composeur, borné. */
const WAIT_MS = 5000;
const STEP_MS = 60;

export type FocusTarget = { focus(options?: { readonly preventScroll?: boolean }): void };

export type ComposerFocusEnvironment = {
  readonly find: () => FocusTarget | null;
  readonly schedule: (run: () => void, delayMs: number) => void;
  readonly now: () => number;
};

export function focusComposerWhenReady(env: ComposerFocusEnvironment): void {
  const deadline = env.now() + WAIT_MS;
  const attempt = (): void => {
    const input = env.find();
    if (input !== null) {
      input.focus({ preventScroll: true });
      return;
    }
    if (env.now() < deadline) env.schedule(attempt, STEP_MS);
  };
  attempt();
}

export function composeRequestedInSearch(search: string): boolean {
  return new URLSearchParams(search).get(COMPOSE_PARAM) === '1';
}

export function composeRequestedInMessage(message: unknown): boolean {
  if (message === null || typeof message !== 'object') return false;
  const { type, compose } = message as { readonly type?: unknown; readonly compose?: unknown };
  return type === NOTIFICATION_CLICKED_MESSAGE && compose === true;
}

export type ComposerIntentEnvironment = {
  readonly search: string;
  readonly forgetParam: () => void;
  readonly container: { addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void } | undefined;
  readonly focusComposer: () => void;
};

export function listenComposerFocusIntents(env: ComposerIntentEnvironment): void {
  if (composeRequestedInSearch(env.search)) {
    env.forgetParam();
    env.focusComposer();
  }
  env.container?.addEventListener('message', (event) => {
    if (composeRequestedInMessage(event.data)) env.focusComposer();
  });
}

/** L'ENVIRONNEMENT RÉEL du DOM — partagé par la bannière in-app et les intentions du worker. */
export function focusComposerInDocument(): void {
  focusComposerWhenReady({
    find: () => document.querySelector<HTMLTextAreaElement>(COMPOSER_INPUT_SELECTOR),
    schedule: (run, delayMs) => void setTimeout(run, delayMs),
    now: () => Date.now(),
  });
}

/** L'ENVIRONNEMENT RÉEL — même découpage que `listenCallAnswerIntentsInBrowser`. */
export async function listenComposerFocusIntentsInBrowser(): Promise<void> {
  const { navigate } = await import('@/lib/router');
  listenComposerFocusIntents({
    search: window.location.search,
    forgetParam: () => {
      const url = new URL(window.location.href);
      url.searchParams.delete(COMPOSE_PARAM);
      navigate(url.pathname + url.search + url.hash, true);
    },
    container:
      'serviceWorker' in navigator ? (navigator.serviceWorker as unknown as ComposerIntentEnvironment['container']) : undefined,
    focusComposer: focusComposerInDocument,
  });
}
