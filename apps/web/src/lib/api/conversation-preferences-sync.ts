import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import type { ConversationOverride, ConversationStoreState, OverrideKey } from '@/lib/conversation-store';
import type { SocketClient } from '@/lib/net/socket';

import { conversationQueryKey, findCachedConversation, patchConversation, patchConversationDetail } from './conversations';
import { APP_PREFERENCES_QUERY_KEY } from './me-keys';
import { messagesQueryKey } from './messages';
import type { MessagesInfiniteData } from './messages-pages';
import { requestFullThreadRead } from './messages-revalidation';
import { supersedeRowGestures, type RowGestureQueue } from './row-gestures';
import { preferenceEntryOf } from './preferences';
import { preferencesVersionOf } from './preferences-version';
import type { Conversation } from './types';

/**
 * **LE PUITS DES PRÉFÉRENCES D'UN AUTRE APPAREIL** (#10663 pour l'apparence,
 * #18914 pour le reste, WEB-03) — `user:preferences-updated`, diffusé vers
 * `user:<id>` par tout écrivain de `UserConversationPreferences`
 * (`conversationPreferencesSync.ts`, passerelle) et par chaque catégorie de
 * réglages d'application (`preferences-broadcast.ts`).
 *
 * Il n'appliquait que l'apparence : une épingle, une sourdine, une archive, un
 * nom personnel, une catégorie ou un favori posés ailleurs restaient absents
 * de la liste jusqu'à sa relecture, un historique vidé restait dans le fil
 * ouvert, et un réglage d'application attendait sa fenêtre de trente minutes.
 *
 * - **Portée conversation** — l'instantané COMPLET et versionné : les onze
 *   champs que la ligne SERVIE déclare (`ROW_FIELDS` ; `mentionsOnly`,
 *   `orderInCategory` et `clearHistoryBefore` depuis #18925) se posent sur la
 *   ligne et la fiche du fil, avec la `version` de la diffusion. Rien d'autre
 *   n'y entre : `readingMode` n'est pas déclaré par la ligne, une relecture
 *   REST l'effacerait aussitôt. Une remise à zéro (`reset`) sert les défauts
 *   du serveur.
 * - **La version arbitre** (#18925, `preferences-version.ts`) : une diffusion
 *   dont la version n'excède pas la plus récente connue — celle d'une
 *   diffusion déjà reçue sur cette connexion, ou celle que la ligne et la
 *   fiche en cache portent (relecture REST, cache réhydraté) — est ignorée.
 * - **Les overrides de rangée** (`conversation-store.ts`) : un override ÉGAL à
 *   la valeur servie est retiré — le serveur reprend la main, et un geste
 *   ultérieur fait ailleurs pourra se voir. Un override CONTRAIRE reste : c'est
 *   l'écho d'un geste plus ancien, et le geste suivant attend sa propre issue.
 * - **L'historique vidé** : un `clearHistoryBefore` périme le fil de la
 *   conversation, lui seul, quand le fil en cache porte encore un message
 *   d'AVANT la date (la passerelle ne sert que `createdAt >= clearHistoryBefore`,
 *   `personalHistoryFilter.ts`). Rien à retirer — une épingle, une date déjà
 *   appliquée, un fil jamais ouvert — ne relit rien : la décision se lit dans
 *   le cache, pas dans une mémoire que chaque connexion neuve repartait vide
 *   (#19116).
 * - **Portée catégorie** (`{ userId, category }`) : les réglages d'application
 *   sont périmés. La portée communauté n'a pas de lecteur web.
 */
type Payload = Readonly<Record<string, unknown>>;

const recordOf = (value: unknown): Payload | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Payload) : null);

const isBoolean = (value: unknown): boolean => typeof value === 'boolean';
const isTextOrNull = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isTags = (value: unknown): boolean => Array.isArray(value) && value.every((tag) => typeof tag === 'string');
const isOrderOrNull = (value: unknown): boolean => value === null || (typeof value === 'number' && Number.isFinite(value));

/** `CONVERSATION_PREFERENCES_DEFAULTS` (passerelle) : ce qu'une remise à zéro sert. */
const SERVED_DEFAULTS: Payload = {
  isPinned: false,
  isMuted: false,
  mentionsOnly: false,
  isArchived: false,
  orderInCategory: null,
  tags: [],
  categoryId: null,
  customName: null,
  reaction: null,
  appearance: null,
  clearHistoryBefore: null,
};

/** Les champs que la ligne SERVIE déclare (`userPreferences`,
 * `packages/shared/types/api-schemas/conversation.ts`) — fail-closed champ
 * par champ ; l'apparence est lue tolérante à l'affichage (`appearanceOf`). */
const ROW_FIELDS: ReadonlyArray<readonly [string, (value: unknown) => boolean]> = [
  ['isPinned', isBoolean],
  ['isMuted', isBoolean],
  ['isArchived', isBoolean],
  ['mentionsOnly', isBoolean],
  ['orderInCategory', isOrderOrNull],
  ['clearHistoryBefore', isTextOrNull],
  ['tags', isTags],
  ['categoryId', isTextOrNull],
  ['customName', isTextOrNull],
  ['reaction', isTextOrNull],
  ['appearance', () => true],
];

const rowFieldsOf = (served: Payload): Payload =>
  Object.fromEntries(
    ROW_FIELDS.filter(([field, valid]) => field in served && valid(served[field])).map(([field]) => [field, served[field] ?? null] as const),
  );

const FLAG_KEYS = ['isPinned', 'isMuted', 'isArchived'] as const satisfies readonly OverrideKey[];
const PREFERENCE_KEYS = ['reaction', 'categoryId', 'customName'] as const satisfies readonly OverrideKey[];

/** Les overrides que la valeur servie CONFIRME — et eux seuls. */
function confirmedOverrides(override: ConversationOverride | undefined, fields: Payload): readonly OverrideKey[] {
  if (override === undefined) return [];
  const flags = FLAG_KEYS.filter((key) => key in fields && override.flags?.[key] === fields[key]);
  const preferences = PREFERENCE_KEYS.filter(
    (key) => key in fields && override.preferences !== undefined && key in override.preferences && override.preferences[key] === fields[key],
  );
  return [...flags, ...preferences];
}

/** La conversation portant `fields` dans son entrée UNIQUE de préférences —
 * les autres clés de l'entrée restent telles qu'elles étaient. */
const withPreferenceFields = (conversation: Conversation, fields: Payload): Conversation => ({
  ...conversation,
  userPreferences: [{ ...preferenceEntryOf(conversation), ...fields }],
});

/** Le fil en cache porte-t-il un message créé avant `cutoff` ? Les dates d'un
 * cache réhydraté sont des chaînes : `new Date` lit les deux formes. */
const threadHoldsMessageBefore = (queryClient: QueryClient, conversationId: string, cutoff: number): boolean => {
  const pages = queryClient.getQueryData<MessagesInfiniteData>(messagesQueryKey(conversationId))?.pages;
  return Array.isArray(pages) && pages.some((page) => page.messages.some((message) => new Date(message.createdAt).getTime() < cutoff));
};

const patchBoth = (queryClient: QueryClient, conversationId: string, edit: (conversation: Conversation) => Conversation): void => {
  patchConversation(queryClient, conversationId, edit);
  patchConversationDetail(queryClient, conversationId, edit);
};

export function createPreferencesSync(params: {
  readonly queryClient: QueryClient;
  readonly conversations: StoreApi<ConversationStoreState>;
  /** La file de reprise des gestes de rangée du compte (#18917) : une valeur servie ici est plus récente qu'un geste en file. */
  readonly gestures?: () => RowGestureQueue | null;
}) {
  const { queryClient, conversations } = params;
  const versions = new Map<string, number>();
  /** La version la plus récente connue : une diffusion de cette connexion, ou ce que la ligne et la fiche en cache portent. */
  const knownVersion = (conversationId: string): number =>
    Math.max(
      versions.get(conversationId) ?? 0,
      preferencesVersionOf(findCachedConversation(queryClient, conversationId)) ?? 0,
      preferencesVersionOf(queryClient.getQueryData<Conversation>(conversationQueryKey(conversationId))) ?? 0,
    );

  const applyHistoryClear = (conversationId: string, served: Payload): void => {
    const cutoff = typeof served['clearHistoryBefore'] === 'string' ? Date.parse(served['clearHistoryBefore']) : Number.NaN;
    if (Number.isNaN(cutoff) || !threadHoldsMessageBefore(queryClient, conversationId, cutoff)) return;
    /* TOUT le fil se relit (#18918) : ce qui précède la date vit dans les pages anciennes, qu'une revalidation recollée garderait. */
    requestFullThreadRead(queryClient, conversationId);
    void queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId), exact: true });
  };

  return (value: unknown): void => {
    const payload = recordOf(value);
    if (payload === null) return;
    const conversationId = payload['conversationId'];
    if (conversationId === undefined) {
      if (typeof payload['category'] === 'string' && !('communityId' in payload)) void queryClient.invalidateQueries({ queryKey: APP_PREFERENCES_QUERY_KEY });
      return;
    }
    if (typeof conversationId !== 'string' || conversationId === '') return;
    const version = payload['version'];
    if (typeof version === 'number') {
      if (version <= knownVersion(conversationId)) return;
      versions.set(conversationId, version);
    }
    const served = payload['reset'] === true ? SERVED_DEFAULTS : recordOf(payload['preferences']);
    if (served === null) return;
    const fields = rowFieldsOf(served);
    const row = typeof version === 'number' ? { ...fields, version } : fields;
    if (Object.keys(row).length > 0) patchBoth(queryClient, conversationId, (conversation) => withPreferenceFields(conversation, row));
    const settled = confirmedOverrides(conversations.getState().overrides[conversationId], fields);
    if (settled.length > 0) conversations.getState().clearOverride(conversationId, settled);
    const queue = params.gestures?.() ?? null;
    if (queue !== null) supersedeRowGestures({ queue, store: conversations, conversationId, keys: [...FLAG_KEYS, ...PREFERENCE_KEYS].filter((key) => key in fields) });
    applyHistoryClear(conversationId, served);
  };
}

export function bindPreferencesLive(params: {
  readonly socket: SocketClient;
  readonly queryClient: QueryClient;
  readonly conversations: StoreApi<ConversationStoreState>;
  readonly gestures?: () => RowGestureQueue | null;
}): () => void {
  const handler = createPreferencesSync(params);
  params.socket.on<unknown>(SERVER_EVENTS.USER_PREFERENCES_UPDATED, handler);
  return () => params.socket.off<unknown>(SERVER_EVENTS.USER_PREFERENCES_UPDATED, handler);
}
