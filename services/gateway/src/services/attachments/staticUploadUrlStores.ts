import type { PrismaClient } from '@meeshy/shared/prisma/client';

import type { StaticUploadUrlRow, StaticUploadUrlStore } from './staticUploadUrlCount';

/**
 * LES REQUÊTES DU COMPTE `static.<domaine>/uploads` (#11256), écrites sous
 * `src/` pour que `tsc` les juge (même raison que `mediaUrlStores.ts`).
 *
 * TOUTE colonne qui peut graver une adresse de média est balayée, pas
 * seulement les pièces jointes : fermer `/uploads` sur le domaine statique
 * casse un avatar ou une bannière qui y pointerait aussi sûrement qu'une
 * photo de message. Un compte limité aux pièces jointes pourrait rendre 0
 * pendant que des profils cassent au déploiement.
 *
 * Chaque requête annonce son type de ligne : un `select` qui omet une colonne
 * déclarée ne compile pas (le type de retour exige la colonne).
 */
export const STATIC_UPLOAD_URL_COLUMNS = {
  MessageAttachment: ['fileUrl', 'thumbnailUrl'],
  PostMedia: ['fileUrl', 'thumbnailUrl'],
  Post: ['audioUrl'],
  User: ['avatar', 'banner'],
  Conversation: ['avatar', 'banner'],
  Participant: ['avatar'],
  Community: ['avatar', 'banner'],
  Sound: ['fileUrl', 'coverUrl'],
} as const;

type Collection = keyof typeof STATIC_UPLOAD_URL_COLUMNS;
type ColumnOf<C extends Collection> = (typeof STATIC_UPLOAD_URL_COLUMNS)[C][number];
type TypedRow<C extends Collection> = { readonly id: string } & { readonly [K in ColumnOf<C>]: string | null };

const PAGE = 500;

/** Curseur sur l'id, jamais un `skip` numérique (même raison que `mediaUrlStores.ts`). */
function pageArgs(cursor: string | null) {
  const base = { orderBy: { id: 'asc' as const }, take: PAGE };
  return cursor === null ? base : { ...base, cursor: { id: cursor }, skip: 1 };
}

function store<C extends Collection>(
  name: C,
  list: (cursor: string | null) => Promise<readonly TypedRow<C>[]>,
): StaticUploadUrlStore {
  const fields: readonly ColumnOf<C>[] = STATIC_UPLOAD_URL_COLUMNS[name];
  return {
    name,
    fields,
    list: async (cursor): Promise<readonly StaticUploadUrlRow[]> =>
      (await list(cursor)).map((row) => ({
        id: row.id,
        values: Object.fromEntries(fields.map((field) => [field, row[field]])),
      })),
  };
}

export function staticUploadUrlStores(prisma: PrismaClient): readonly StaticUploadUrlStore[] {
  return [
    store('MessageAttachment', (c) =>
      prisma.messageAttachment.findMany({ select: { id: true, fileUrl: true, thumbnailUrl: true }, ...pageArgs(c) }),
    ),
    store('PostMedia', (c) =>
      prisma.postMedia.findMany({ select: { id: true, fileUrl: true, thumbnailUrl: true }, ...pageArgs(c) }),
    ),
    store('Post', (c) => prisma.post.findMany({ select: { id: true, audioUrl: true }, ...pageArgs(c) })),
    store('User', (c) => prisma.user.findMany({ select: { id: true, avatar: true, banner: true }, ...pageArgs(c) })),
    store('Conversation', (c) =>
      prisma.conversation.findMany({ select: { id: true, avatar: true, banner: true }, ...pageArgs(c) }),
    ),
    store('Participant', (c) => prisma.participant.findMany({ select: { id: true, avatar: true }, ...pageArgs(c) })),
    store('Community', (c) =>
      prisma.community.findMany({ select: { id: true, avatar: true, banner: true }, ...pageArgs(c) }),
    ),
    store('Sound', (c) => prisma.sound.findMany({ select: { id: true, fileUrl: true, coverUrl: true }, ...pageArgs(c) })),
  ];
}
