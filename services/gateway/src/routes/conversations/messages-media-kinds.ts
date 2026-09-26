/**
 * Les GENRES de l'index d'une conversation — `view=media&kinds=` (#8098).
 *
 * `view=media` (#8095) ne servait que le visuel. L'index doit couvrir TOUT ce
 * qui s'est échangé dans la conversation : ce module traduit chaque genre en
 * une clause Prisma, que `resolveCollectionView` pose comme `predicate` — donc
 * à l'identique sur la page ET sur le COUNT, sous les mêmes gardes que le fil.
 *
 * | genre | ce qui le fait entrer |
 * |---|---|
 * | `visual` | une pièce `image/*` ou `video/*` |
 * | `audio` | une pièce `audio/*` |
 * | `contact` | une pièce `text/vcard` ou `text/x-vcard` — le dépôt n'a AUCUNE autre représentation d'un contact partagé (pas de `messageType`, pas de `metadata` ; iOS colle le contact en TEXTE dans le composeur) |
 * | `document` | une pièce de tout AUTRE type (pdf, texte, archive…) — les genres de pièce sont DISJOINTS |
 * | `link` | un contenu qui porte `http://` ou `https://` |
 * | `conversation` | un contenu qui porte une adresse de conversation Meeshy (voir `FORMES_DE_CONVERSATION`) |
 * | `location` | un message de type `location` |
 *
 * La vue unique est exclue aux DEUX niveaux qui la déclarent : le message (pour
 * tous les genres) et la pièce (pour les genres de pièce). `NOT: { isViewOnce:
 * true }` et jamais `isViewOnce: false` — un document écrit AVANT le champ ne
 * le porte pas, et un champ absent ne matche pas `false` (voir `messages-list-views.ts`).
 *
 * Les recherches de sous-chaîne (`contains`) sont traduites par Prisma en une
 * expression Mongo ÉCHAPPÉE : aucun motif fourni par l'appelant n'est
 * interprété comme une expression, et le coût reste borné par le `where` de
 * la route, qui fixe toujours la conversation.
 */

import type { Prisma } from '@meeshy/shared/prisma/client';

export const GENRES_DE_MEDIA = ['visual', 'audio', 'document', 'link', 'contact', 'conversation', 'location'] as const;

export type GenreDeMedia = (typeof GENRES_DE_MEDIA)[number];

/** Le genre servi quand `kinds` est absent — celui de #8095, que le client iOS appelle sans `kinds`. */
const GENRE_PAR_DEFAUT: readonly GenreDeMedia[] = ['visual'];

const NON_VUE_UNIQUE = { NOT: { isViewOnce: true } } satisfies Prisma.MessageAttachmentWhereInput;

const MIMES_VISUELS = ['image/', 'video/'] as const;
const MIMES_AUDIO = ['audio/'] as const;
const MIMES_CONTACT = ['text/vcard', 'text/x-vcard'] as const;

/**
 * Les adresses de conversation que le dépôt PRODUIT ou OUVRE réellement :
 *
 * - `/chat/<lien>` — l'URL d'invitation canonique (`routes/conversations/sharing.ts`,
 *   `${FRONTEND_URL}/chat/<linkId>` ; web `route-table.tsx` `chatJoin`) ;
 * - `/join/<lien>` — l'ancienne forme, servie en 308 et ouverte par iOS ;
 * - `/c/<id>` — le lien direct d'une conversation (web `thread`, iOS) ;
 * - `/conversation/<id>` — son alias, ouvert par iOS (`DeepLinkRouter.swift`) ;
 * - `meeshy://…` — les mêmes, sous le schéma de l'application.
 *
 * `meeshy.me/<forme>` couvre aussi `www.`, `app.` et `staging.` : l'hôte en
 * est un suffixe. `/l/<jeton>` n'y est PAS : c'est un lien de SUIVI (post,
 * réel, story), résolu par son `targetType`, jamais présumé être une conversation.
 */
const FORMES_DE_CONVERSATION = ['chat/', 'join/', 'c/', 'conversation/'].flatMap((forme) => [
  `meeshy.me/${forme}`,
  `meeshy://${forme}`,
]);

const contient = (fragment: string): Prisma.MessageWhereInput => ({
  content: { contains: fragment, mode: 'insensitive' },
});

const pieceDontLeTypeCommencePar = (prefixes: readonly string[]): Prisma.MessageWhereInput => ({
  attachments: {
    some: { ...NON_VUE_UNIQUE, OR: prefixes.map((prefixe) => ({ mimeType: { startsWith: prefixe } })) },
  },
});

const CLAUSES: Readonly<Record<GenreDeMedia, Prisma.MessageWhereInput>> = {
  visual: pieceDontLeTypeCommencePar(MIMES_VISUELS),
  audio: pieceDontLeTypeCommencePar(MIMES_AUDIO),
  contact: pieceDontLeTypeCommencePar(MIMES_CONTACT),
  document: {
    attachments: {
      some: {
        AND: [
          NON_VUE_UNIQUE,
          {
            NOT: {
              OR: [...MIMES_VISUELS, ...MIMES_AUDIO, ...MIMES_CONTACT].map((prefixe) => ({
                mimeType: { startsWith: prefixe },
              })),
            },
          },
        ],
      },
    },
  },
  link: { OR: [contient('http://'), contient('https://')] },
  conversation: { OR: FORMES_DE_CONVERSATION.map(contient) },
  location: { messageType: 'location' },
};

/** Un refus de validation, que la route sert en 400 `INVALID_VIEW`. */
type Refus = { readonly genre: 'refus'; readonly message: string };

/**
 * Lit `?kinds=` : liste séparée par des virgules, blancs et doublons ignorés.
 * Absente ou vide ⇒ le visuel seul. Un genre inconnu se REFUSE : le servir
 * comme le visuel rendrait une sous-collection que le client n'a pas demandée.
 */
export function lireGenres(kinds: string | undefined): readonly GenreDeMedia[] | Refus {
  const demandes = [...new Set((kinds ?? '').split(',').map((k) => k.trim()).filter((k) => k.length > 0))];
  if (demandes.length === 0) return GENRE_PAR_DEFAUT;
  const inconnus = demandes.filter((k) => !(GENRES_DE_MEDIA as readonly string[]).includes(k));
  if (inconnus.length > 0) {
    return {
      genre: 'refus',
      message: `Unknown kinds "${inconnus.join(', ')}". Expected any of: ${GENRES_DE_MEDIA.join(', ')}`,
    };
  }
  return demandes as GenreDeMedia[];
}

/**
 * Le prédicat de l'index : le message n'est pas à vue unique, il appartient à
 * AU MOINS un des genres demandés, et — si `terme` est donné — ce terme figure
 * dans son contenu ou dans le nom d'origine d'une de ses pièces lisibles.
 */
export function predicatDeMedia(
  genres: readonly GenreDeMedia[],
  terme: string | undefined
): Prisma.MessageWhereInput {
  const recherche: Prisma.MessageWhereInput[] = terme
    ? [
        {
          OR: [
            { content: { contains: terme, mode: 'insensitive' } },
            {
              attachments: {
                some: { ...NON_VUE_UNIQUE, originalName: { contains: terme, mode: 'insensitive' } },
              },
            },
          ],
        },
      ]
    : [];
  return {
    NOT: { isViewOnce: true },
    AND: [{ OR: genres.map((genre) => CLAUSES[genre]) }, ...recherche],
  };
}
