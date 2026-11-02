import type { CoqueNative } from '@/lib/native-shell';
import { COMPOSER_INPUT_SELECTOR } from '@/lib/notifications/composer-focus-intent';

import { WIDGETS_BRIDGE } from './channel';

/**
 * **« RÉPONDRE » DEPUIS UN WIDGET** (#10626) — iOS saisit dans le widget ;
 * Android ne le permet pas. Le toucher ouvre donc la conversation par son lien
 * profond (`meeshy://c/<id>?compose=1`, routé par `shell-deep-links.ts`), et
 * `MeeshyWidgetsPlugin` signale à part la demande de réponse : le composeur
 * prend le focus dès que le fil de CETTE conversation est peint.
 *
 * Le signal est RETENU côté natif jusqu'à ce que cet écouteur s'abonne : un
 * lancement à froid ne le perd pas.
 *
 * Le curseur se pose comme sur le web (#12499, `composer-focus-intent.ts`) :
 * même composeur, et le fil ne défile pas.
 */
export const COMPOSE_EVENT = 'composeRequested';
const DEADLINE_MS = 6_000;
const STEP_MS = 120;

export function focusComposerWhenReady(params: {
  readonly conversationId: string;
  readonly doc: Document;
  readonly path: () => string;
  readonly timers: { readonly set: (run: () => void, ms: number) => unknown };
  readonly now: () => number;
}): void {
  const { conversationId, doc, path, timers, now } = params;
  const until = now() + DEADLINE_MS;
  const threadPath = `/c/${conversationId}`;
  const attempt = (): void => {
    if (now() > until) return;
    const field = path() === threadPath ? doc.querySelector<HTMLTextAreaElement>(COMPOSER_INPUT_SELECTOR) : null;
    if (field !== null) {
      field.focus({ preventScroll: true });
      return;
    }
    timers.set(attempt, STEP_MS);
  };
  timers.set(attempt, 0);
}

const conversationOf = (donnees: unknown): string | null => {
  const id = (donnees as { readonly conversationId?: unknown } | null)?.conversationId;
  return typeof id === 'string' && id !== '' ? id : null;
};

export function ecouterDemandesDeReponse(coque: CoqueNative | undefined, onRequest: (conversationId: string) => void): boolean {
  const declare = coque?.PluginHeaders?.some((header) => header.name === WIDGETS_BRIDGE) === true;
  const addListener = coque?.addListener;
  if (!declare || typeof addListener !== 'function') return false;
  addListener(WIDGETS_BRIDGE, COMPOSE_EVENT, (donnees) => {
    const id = conversationOf(donnees);
    if (id !== null) onRequest(id);
  });
  return true;
}
