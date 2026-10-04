import { amina, conversationDefaults, kwame, message, minutesAgo, VIEWER_ID, viewer } from './fixtures-base';
import type { Conversation, Message, Participant } from './types';

/**
 * LE CORPUS DES ARCHIVES (#7420) — HORS LISTE (`fixtures.ts` §
 * `OFF_LIST_CONVERSATIONS`) : aucune liste ne le compte, l'écran des favoris
 * et les gates l'atteignent par ses messages.
 *
 * CENT SOIXANTE messages, un toutes les quarante minutes : plus de trois pages
 * de cinquante. Le favori `arch-12` est donc PLUS ANCIEN que la première page
 * — et que la deuxième —, ce qui rend atteignable l'état que #7420 existe pour
 * servir : ouvrir le fil sur un message que les pages chargées ne portent pas,
 * par la fenêtre `?around=`, puis redescendre jusqu'au présent sans trou.
 *
 * Les longueurs VARIENT (motif `benchMessages`) : une fenêtre virtualisée à
 * hauteur fixe passerait un corpus de bulles identiques.
 */
export const ARCHIVE_CONVERSATION_ID = 'c-archives';
export const ARCHIVE_STARRED_ID = 'arch-12';
const ARCHIVE_COUNT = 160;

const people: readonly Participant[] = [amina, kwame, viewer];

export const ARCHIVE_MESSAGES: readonly Message[] = Array.from({ length: ARCHIVE_COUNT }, (_, i) => {
  const author = people[i % people.length] ?? viewer;
  const starred = `arch-${i}` === ARCHIVE_STARRED_ID;
  return message({
    id: `arch-${i}`,
    conversationId: ARCHIVE_CONVERSATION_ID,
    senderId: author.userId ?? VIEWER_ID,
    sender: author,
    content: starred
      ? 'La clé du local est chez la gardienne, code 2B au portail.'
      : `Archive ${i + 1} — ${'nouvelles du chantier '.repeat(1 + ((i * 7) % 6)).trim()}.`,
    originalLanguage: 'fr',
    translations: [],
    createdAt: minutesAgo((ARCHIVE_COUNT - i) * 40),
  });
});

const lastArchive = ARCHIVE_MESSAGES[ARCHIVE_MESSAGES.length - 1] as Message;

export const ARCHIVE_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: ARCHIVE_CONVERSATION_ID,
  title: 'Archives du chantier',
  type: 'group',
  memberCount: 3,
  participants: [viewer, amina, kwame],
  unreadCount: 0,
  lastMessage: lastArchive,
  lastMessageAt: lastArchive.createdAt,
  lastMessageOriginalLanguage: 'fr',
};
