import { useEffect } from 'react';
import { useStore } from 'zustand/react';

import { useConversationsSnapshot } from '@/lib/api/query';
import type { Conversation } from '@/lib/api/types';
import {
  conversationStore,
  effectiveFlagsOf,
  effectiveUnreadOf,
  type ConversationOverride,
} from '@/lib/conversation-store';

type Overrides = Readonly<Record<string, ConversationOverride>>;

/**
 * **D-L1 (spécification du 2026-09-21, § 3) — LE BADGE COMPTE LES
 * CONVERSATIONS NON LUES, HORS MUETTES**, jamais les notifications (la cloche
 * garde son propre compte, `use-notification-counts.ts`) et jamais les
 * MESSAGES non lus (une conversation à douze messages pèse UN, comme
 * WhatsApp).
 *
 * LOI iOS DE RÉFÉRENCE (D-1) : `NotificationCoordinator.recomputeTotal`
 * (`packages/MeeshySDK/…/Notifications/NotificationCoordinator.swift:399`) →
 * `ConversationReadLedger.total(excludingOpen:excludingMuted:)`
 * (`…/Store/ConversationReadLedger.swift:272-281`) — « le badge d'icône et le
 * widget comptent les AUTRES conversations, et jamais les muettes ».
 *
 * `effectiveUnreadOf`/`effectiveFlagsOf` (`lib/conversation-store.ts:121-129`)
 * sont les SEULES lois de non-lu et de sourdine de l'application — les mêmes
 * que la Lentille (`lib/lens/filters.ts:53-70`). Les relire ici ferait un
 * SECOND compte : « marquer lu » ou « mettre en sourdine » depuis la rangée
 * pose un override OPTIMISTE que le wire ne porte pas encore, et le badge
 * serait resté en retard d'un aller-retour serveur (Instant App § Optimistic
 * Updates).
 *
 * Cache absent (`undefined`) retourne `undefined` pour signaler que le badge
 * ne doit pas être mis à jour — il reste inchangé jusqu'à la première valeur
 * servie. Cela distingue l'absence de données (undefined) d'une liste vide
 * chargée ([] → 0, le badge doit être effacé).
 */
export function countUnreadConversations(
  conversations: readonly Conversation[] | undefined,
  overrides: Overrides,
): number | undefined {
  if (conversations === undefined) return undefined;
  return conversations.filter(
    (conversation) =>
      effectiveUnreadOf(conversation, overrides) > 0 && !effectiveFlagsOf(conversation, overrides).isMuted,
  ).length;
}

/**
 * L'API Badging — DÉCLARÉE par `lib.dom` (`Navigator.setAppBadge(contents?:
 * number): Promise<void>`, `clearAppBadge(): Promise<void>`), donc aucun
 * `any` n'est nécessaire pour l'appeler. Elle est en revanche ABSENTE de
 * Firefox et du Safari de bureau : d'où le `Partial`, qui force le site
 * d'appel à en traiter l'absence au lieu de la supposer.
 */
export type BadgingNavigator = Partial<Pick<Navigator, 'setAppBadge' | 'clearAppBadge'>>;

/** Le seul pixel que ce module écrit dans le document : son titre. */
export type TitleHost = Pick<Document, 'title'>;

export type AppBadgeHost = {
  readonly navigator?: BadgingNavigator;
  readonly document?: TitleHost;
};

const UNREAD_TITLE_PREFIX = /^\(\d+\)\s+/;

/**
 * `titleWithUnread` — PURE et IDEMPOTENTE : le préfixe est toujours retiré
 * avant d'être reposé, donc une seconde mise à jour ne produit jamais
 * « (2) (5) Meeshy ». C'est ce qui autorise le module à relire le titre VIVANT
 * plutôt qu'à mémoriser un titre de base, qui deviendrait faux dès qu'un écran
 * nommerait la page.
 */
export function titleWithUnread(title: string, count: number): string {
  const base = title.replace(UNREAD_TITLE_PREFIX, '');
  return count > 0 ? `(${count}) ${base}` : base;
}

/**
 * `setAppBadge` est ASYNCHRONE : une promesse rejetée (permission refusée,
 * PWA non installée) ne passe par AUCUN `try`/`catch` synchrone — elle
 * remonterait en `unhandledrejection`. Les deux formes d'échec sont donc
 * traitées, le jet immédiat comme le rejet différé.
 */
function writeBadge(navigator: BadgingNavigator | undefined, count: number): void {
  try {
    const outcome = count > 0 ? navigator?.setAppBadge?.(count) : navigator?.clearAppBadge?.();
    if (outcome instanceof Promise) outcome.catch(() => undefined);
  } catch {
    /* Un navigateur sans API Badging n'est pas une panne — le titre suffit. */
  }
}

function writeTitle(document: TitleHost | undefined, count: number): void {
  if (document === undefined) return;
  try {
    document.title = titleWithUnread(document.title, count);
  } catch {
    /* Un document figé (rendu serveur, onglet en cours de destruction). */
  }
}

/**
 * `updateAppBadge` — les DEUX surfaces d'un même nombre : le badge d'icône de
 * la PWA et le titre de l'onglet. `host` n'existe que pour les témoins ; en
 * production les deux globales sont lues telles quelles.
 *
 * `undefined` signale une absence de données : ni badge ni titre ne sont mis
 * à jour. Cela permet au badge de rester inchangé tant que le cache n'a pas
 * livré sa première valeur.
 */
export function updateAppBadge(count: number | undefined, host: AppBadgeHost = {}): void {
  if (count === undefined) return;
  writeBadge(host.navigator ?? globalThis.navigator, count);
  writeTitle(host.document ?? globalThis.document, count);
}

/**
 * `useAppBadge` — monté UNE fois par `Shell` (`components/shell.tsx`), le seul
 * composant racine de toutes les routes.
 *
 * DEUX sources, parce que le non-lu effectif en a deux : le cache de la liste
 * (`useConversationsSnapshot`, `enabled: false` — il OBSERVE, il ne demande
 * jamais) que `applyConversationUnreadUpdated` réécrit sur
 * `conversation:unread-updated` (`lib/api/realtime-apply.ts:196-205`), et les
 * overrides optimistes de `conversationStore`. S'abonner au seul cache
 * laissait le badge sourd à « marquer lu » tant que le serveur n'avait pas
 * répondu.
 */
export function useAppBadge(): void {
  const conversations = useConversationsSnapshot();
  const overrides = useStore(conversationStore, (state) => state.overrides);

  useEffect(() => {
    updateAppBadge(countUnreadConversations(conversations, overrides));
  }, [conversations, overrides]);
}
