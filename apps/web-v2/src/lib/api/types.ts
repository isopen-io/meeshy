/**
 * LE VOCABULAIRE DE DONNÉES DE LA V3.1 — il n'y en a pas d'autre.
 *
 * Ce fichier ne DÉCLARE aucun type : il les fait venir de `@meeshy/shared`,
 * qui est la source de vérité du dépôt. Ce qu'il remplace est une projection
 * locale (`model.ts`) qui décrivait les mêmes objets avec d'autres noms —
 * `sentAt` pour `createdAt`, `author` pour `sender`, `unread` pour
 * `unreadCount`. Elle était documentée comme provisoire ; elle a vécu le
 * temps du POC.
 *
 * POURQUOI CE N'EST PAS UN DÉTAIL DE STYLE. Une projection ne coûte rien tant
 * qu'elle reste juste, et rien ne la tient juste : le jour où la passerelle
 * ajoute un champ, la projection ne rougit pas — elle l'ignore. Le dépôt a
 * déjà payé ce défaut trois fois sur le Prisme Linguistique (cycles 118 à 120,
 * `CLAUDE.md`), où chaque client portait sa propre descente et où trois
 * d'entre elles ne descendaient pas.
 *
 * COÛT RUNTIME : ZÉRO. Ce sont des `import type` — TypeScript les efface à la
 * compilation, donc aucun octet de `@meeshy/shared` n'atteint le navigateur
 * par ce fichier. Le peu qui arrive vraiment vient des trois FONCTIONS
 * réutilisées (`prism.ts`, `reader.ts`), et il est mesuré par
 * `scripts/measure-weight.mjs`.
 */
export type { Conversation, Message } from '@meeshy/shared/types/conversation';
export type { MessageTranslation } from '@meeshy/shared/types/message-types';
export type { Participant } from '@meeshy/shared/types/participant';
export type { Attachment } from '@meeshy/shared/types/attachment';
export type { UserPresenceStatus } from '@meeshy/shared/utils/user-presence';
