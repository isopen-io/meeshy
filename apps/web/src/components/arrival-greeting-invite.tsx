import { useSyncExternalStore } from 'react';

import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { arrivalGreetingOf, greetingInsertion, type ArrivalGreeting } from '@/lib/view/arrival-greeting';
import { composerInsertStore } from '@/lib/view/composer-insert';
import type { SystemRow } from '@/lib/view/message-badges';

/**
 * « DIS-LUI SALUT » (#16338) — l'invite d'un avis d'arrivée : à qui elle
 * s'adresse (`arrivalGreetingOf`), et SI un composeur monté peut la recevoir.
 * Sans composeur (fil en lecture seule) ou sans personne à mentionner, rien.
 */
const viewerUsernameNow = (): string | null => {
  const { session } = sessionStore.getState();
  return session.status === 'authenticated' ? session.user.username : null;
};

export function useArrivalGreeting(row: SystemRow): ArrivalGreeting | null {
  const viewerUsername = useSyncExternalStore(sessionStore.subscribe, viewerUsernameNow, () => null);
  const listening = useSyncExternalStore(composerInsertStore.watch, composerInsertStore.available, () => false);
  return listening ? arrivalGreetingOf(row, viewerUsername) : null;
}

/** Le bouton, EN GRAS, dans la langue d'interface ; il écrit les mentions dans le composeur. */
export function ArrivalGreetingInvite({ greeting, language }: { readonly greeting: ArrivalGreeting; readonly language: InterfaceLanguage }) {
  return (
    <button
      type="button"
      data-greet-arrival=""
      onClick={() => composerInsertStore.request(greetingInsertion(greeting))}
      className="min-h-11 rounded-chip px-3 text-[12.5px] font-bold"
      style={{ color: 'var(--accent)' }}
    >
      {translate(language, greeting.plural ? 'message.join.greet.many' : 'message.join.greet.one')}
    </button>
  );
}
