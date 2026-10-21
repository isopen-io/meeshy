import type { ConversationsPage } from './conversations-pages';
import { amina, bruno, conversationDefaults, dayAt, fatou, kwame, message, viewer } from './fixtures-base';
import { FIXTURE_PROCHES_CATEGORY_ID, FIXTURE_TRAVAIL_CATEGORY_ID } from './fixtures-categories';
import type { Conversation } from './types';

/**
 * LE CORPUS DE PAGINATION (#6195) — 34 conversations qui, ajoutées aux 11
 * existantes (`fixtures.ts`), portent la Lentille à 45 : de quoi observer une
 * page 1 (30) et une page 2 (15). AUCUN des titres n'est Kwame/Amina/Fatou/
 * Bruno — ces noms sont les PREUVES « ceci est une fixture » du socle
 * (§ « DEUX SIMULATEURS » du CLAUDE.md racine) ; les réutiliser ici comme
 * TITRE brouillerait cette preuve sur l'écran le plus peuplé de fixtures.
 * `lastMessageAt = dayAt(10 + i, 10, 0)` : 10 jours et plus, STRICTEMENT plus
 * ancien que la plus ancienne des 11 (`c-nouvelle`, 3 jours) — vérifié par
 * témoin, jamais supposé.
 */
const PAGINATION_TITLES: readonly string[] = [
  'Julien Moreau', 'Camille Girard', 'Antoine Lefèvre', 'Sophie Bonnet', 'Mathieu Rousseau',
  'Claire Fontaine', 'Nicolas Faure', 'Laura Chevalier', 'Thomas Robin', 'Émilie Mercier',
  'Vincent Blanchard', 'Aurélie Garnier', 'Baptiste Renard', 'Manon Lambert', 'Hugo Simon',
  'Chloé Michel', 'Maxime Leroy', 'Léa Perrot', 'Romain Fournier', 'Inès Bertrand',
  'Adrien Roy', 'Margaux Noël', 'Florian Guérin', 'Alice Muller', 'Quentin Masson',
  'Justine Roussel', 'Damien Colin', 'Pauline Vidal', 'Cyril Caron', 'Élodie Picard',
  'Grégoire Dumas', 'Sarah Lopez', 'Kevin Meyer', 'Nadia Roche',
];

const PAGINATION_POOL = [amina, kwame, fatou, bruno] as const;

/** Les trois premières sont RANGÉES (#10103) — « Travail » puis « Proches »
 * (`fixtures-categories.ts`) : une catégorie peut porter des conversations
 * anciennes, qui quittent alors « Plus ancien ». */
const CATEGORY_OF: Readonly<Record<number, string>> = {
  0: FIXTURE_TRAVAIL_CATEGORY_ID,
  1: FIXTURE_PROCHES_CATEGORY_ID,
  2: FIXTURE_PROCHES_CATEGORY_ID,
};

/**
 * LE SEUL GROUPE DE LA DÉMONSTRATION QUE LE LECTEUR A CRÉÉ (#11211) — ailleurs
 * il est membre (`participantDefaults.role`), et un membre ne renomme ni
 * n'invite (`conversationActionsFor`). `c-page-04` porte donc le rang que la
 * passerelle sert dans `currentUserRole`, pour que Renommer, Inviter et Gérer
 * les membres aient une ligne où se montrer (`check-row-menu-more.mjs`).
 */
export const READER_CREATED_GROUP_ID = 'c-page-04';

export const PAGINATION_CONVERSATIONS: readonly Conversation[] = Array.from({ length: 34 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  const isGroupType = i % 2 === 1;
  const first = PAGINATION_POOL[i % PAGINATION_POOL.length]!;
  const second = PAGINATION_POOL[(i + 1) % PAGINATION_POOL.length]!;
  const lastMessage = message({
    id: `m-page-${n}`,
    senderId: first.userId ?? first.id,
    sender: first,
    content: `Archive de conversation numéro ${i + 1}.`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: dayAt(10 + i, 10, 0),
  });
  return {
    ...conversationDefaults,
    id: `c-page-${n}`,
    title: PAGINATION_TITLES[i]!,
    type: isGroupType ? 'group' : 'direct',
    memberCount: isGroupType ? 3 : 2,
    participants: isGroupType ? [viewer, first, second] : [viewer, first],
    unreadCount: 0,
    lastMessage,
    lastMessageAt: lastMessage.createdAt,
    lastMessageOriginalLanguage: 'fr',
    ...(`c-page-${n}` === READER_CREATED_GROUP_ID ? { currentUserRole: 'creator' } : {}),
    ...(CATEGORY_OF[i] === undefined
      ? {}
      : { userPreferences: [{ isPinned: false, isMuted: false, isArchived: false, categoryId: CATEGORY_OF[i] }] }),
  };
});

/** `lastMessageAt` est `Date | undefined` sur le TYPE (jamais absent sur le
 * WIRE, `schema.prisma:495` § doc-comment de `fixtures.ts` : « la passerelle
 * sert TOUJOURS une valeur ») — `0` classe une entrée sans date en DERNIER,
 * jamais en tête d'un tri décroissant. */
const timeOf = (value: Date | undefined): number => value?.getTime() ?? 0;

/**
 * `pageOfConversations` — la loi qui MIME `core-list.ts` (§3 de la
 * spécification) : tri `lastMessageAt desc` (`:325-327`), fenêtrage par
 * curseur `lastMessageAt < cursor` — un `before` INCONNU laisse la fenêtre
 * INTACTE, donc RESERT la page 1 (`:245`) — et les DEUX blocs de pagination
 * de `:916-937` (`buildCursorPaginationMeta`, `pagination.ts:62-73` :
 * `hasMore = N === limit`, TOUJOURS ; le compte TOTAL n'est connu QUE quand
 * aucun curseur n'a été demandé, `:401-405` / `:505`).
 *
 * PURE, sans horloge : le corpus et l'instant sont REÇUS, jamais lus.
 */
export function pageOfConversations(
  corpus: readonly Conversation[],
  params: { readonly before?: string; readonly limit: number },
): ConversationsPage {
  const { before, limit } = params;
  const sorted = [...corpus].sort((a, b) => timeOf(b.lastMessageAt) - timeOf(a.lastMessageAt));
  const cursorRow = before === undefined ? undefined : sorted.find((c) => c.id === before);
  const windowed =
    cursorRow === undefined ? sorted : sorted.filter((c) => timeOf(c.lastMessageAt) < timeOf(cursorRow.lastMessageAt));

  const page = windowed.slice(0, limit);
  const cursorHasMore = page.length === limit;
  const lastId = page.length > 0 ? (page[page.length - 1] as Conversation).id : null;
  const total = before === undefined ? sorted.length : 0;
  const paginationHasMore = before === undefined ? page.length < total : cursorHasMore;

  return {
    conversations: page,
    pagination: { limit, offset: 0, total, hasMore: paginationHasMore },
    cursorPagination: { limit, hasMore: cursorHasMore, nextCursor: cursorHasMore ? lastId : null },
  };
}
