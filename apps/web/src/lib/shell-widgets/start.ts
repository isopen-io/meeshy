import { currentDeviceLocale } from '@/lib/api/client';
import { CONVERSATIONS_QUERY_KEY, findCachedConversation } from '@/lib/api/conversations';
import { flattenConversationPages, type ConversationsInfiniteData } from '@/lib/api/conversations-pages';
import { apiDeps } from '@/lib/api/deps';
import { rowAction } from '@/lib/api/query';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore, type SessionState } from '@/lib/api/session';
import { conversationStore, effectiveUnreadOf } from '@/lib/conversation-store';
import { currentInterfaceLanguage, subscribeInterfaceLanguage } from '@/lib/interface-language';
import { coqueCourante } from '@/lib/native-shell';
import { resolveReaderLanguages } from '@/lib/reader';

import { createWidgetChannel, widgetBridgeOf, type WidgetChannel } from './channel';
import { ecouterDemandesDeReponse, focusComposerWhenReady } from './compose-focus';
import { widgetSnapshotOf } from './snapshot';

/**
 * **LE BRANCHEMENT DES WIDGETS DE LA COQUE ANDROID** (#10626) — chargé par
 * `main.tsx` dans la coque seulement, hors de tout composant : la purge à la
 * déconnexion ne doit dépendre d'aucun écran monté.
 *
 * Il OBSERVE ce que l'app tient déjà — le cache de la liste (jamais une
 * requête de plus), les corrections optimistes, la session, la langue — et
 * remet l'instantané au canal (`channel.ts`), qui en règle le débit. Le cache
 * change de compte AVANT cet abonné (`query-client.ts` s'abonne à la session
 * à sa construction, donc le premier) : un instantané composé après un
 * changement de compte ne peut pas porter la liste du compte quitté.
 */
const COMPOSE_DELAY_MS = 400;

type Identity = { readonly kind: 'account'; readonly id: string } | { readonly kind: 'nobody' } | { readonly kind: 'held' };

/** Un compte qui parle le temps d'une conversation sous une identité anonyme
 * (#8816) est TENU : ses widgets restent tels quels, ni republiés ni vidés. */
const identityOf = (session: SessionState): Identity => {
  if (session.status === 'authenticated') return { kind: 'account', id: session.user.id };
  if (session.status === 'guest' && session.account !== undefined) return { kind: 'held' };
  return { kind: 'nobody' };
};

const cachedConversations = () => {
  const data = appQueryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY);
  return data !== undefined && Array.isArray(data.pages) ? flattenConversationPages(data) : undefined;
};

function offerCurrent(channel: WidgetChannel): void {
  const session = sessionStore.getState().session;
  const identity = identityOf(session);
  if (identity.kind === 'held') return;
  if (identity.kind === 'nobody' || session.status !== 'authenticated') {
    channel.offer(null, undefined);
    return;
  }
  const conversations = cachedConversations();
  const languages = resolveReaderLanguages({
    source: apiDeps.source,
    session: { status: session.status, user: session.user, guest: {} },
    deviceLocale: currentDeviceLocale(),
  });
  channel.offer(
    identity.id,
    conversations === undefined
      ? undefined
      : widgetSnapshotOf({
          conversations,
          overrides: conversationStore.getState().overrides,
          viewerId: identity.id,
          languages,
          interfaceLanguage: currentInterfaceLanguage(),
          now: Date.now(),
        }),
  );
}

/** « Marquer lu » touché sur un widget : rejoué par la loi de la rangée, et
 * seulement si la conversation est encore non lue — `rowAction('read')`
 * BASCULE, il rendrait non lue une conversation déjà lue. */
const markReadFromWidget = (conversationId: string): void => {
  const conversation = findCachedConversation(appQueryClient, conversationId);
  if (conversation === undefined) return;
  if (effectiveUnreadOf(conversation, conversationStore.getState().overrides) > 0) rowAction(conversationId, 'read');
};

export function startShellWidgets(): boolean {
  const coque = coqueCourante();
  const bridge = widgetBridgeOf(coque);
  if (bridge === null) return false;

  const channel = createWidgetChannel({
    bridge,
    timers: { set: (run, ms) => window.setTimeout(run, ms), clear: (id) => window.clearTimeout(id) },
  });
  const refresh = (): void => offerCurrent(channel);
  /* Le cache de liste notifie à chaque observateur et chaque patch : la
     composition attend que la rafale retombe. Seule la SESSION passe tout
     de suite — une déconnexion vide les widgets sans délai. */
  let pending: number | undefined;
  const soon = (): void => {
    if (pending !== undefined) return;
    pending = window.setTimeout(() => {
      pending = undefined;
      refresh();
    }, COMPOSE_DELAY_MS);
  };
  let drained = false;
  const drain = (): void => {
    if (cachedConversations() === undefined) return;
    drained = true;
    void channel.drainMarkRead(markReadFromWidget);
  };

  sessionStore.subscribe(refresh);
  conversationStore.subscribe(soon);
  subscribeInterfaceLanguage(soon);
  appQueryClient.getQueryCache().subscribe((event) => {
    const key = event.query.queryKey;
    if (key.length !== 1 || key[0] !== CONVERSATIONS_QUERY_KEY[0]) return;
    soon();
    if (!drained) drain();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      refresh();
      channel.flush();
      return;
    }
    drain();
  });
  ecouterDemandesDeReponse(coque, (conversationId) =>
    focusComposerWhenReady({
      conversationId,
      doc: document,
      path: () => window.location.pathname,
      timers: { set: (run, ms) => window.setTimeout(run, ms) },
      now: () => Date.now(),
    }),
  );

  refresh();
  drain();
  return true;
}
