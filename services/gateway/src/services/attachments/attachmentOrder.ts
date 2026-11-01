import type { Prisma } from '@meeshy/shared/prisma/client';

/**
 * L'ORDRE des pièces d'un message (#9776) — UN site, toute lecture qui sert
 * les pièces d'un message le passe en `orderBy`.
 *
 * `rank` est l'ordre de `attachmentIds` dans la requête de création (l'ordre
 * du composeur), écrit par `associateAttachmentsToMessage`. `createdAt` seul
 * ne le dit pas : c'est l'heure de FIN d'un téléversement, et ils partent en
 * parallèle. Un message d'avant le rang n'en porte pas — MongoDB range un
 * champ absent EN TÊTE d'un tri ascendant, et `createdAt` puis `id` lui
 * gardent l'ordre stable qu'il avait.
 */
export const MESSAGE_ATTACHMENT_ORDER: Prisma.MessageAttachmentOrderByWithRelationInput[] = [
  { rank: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
];
