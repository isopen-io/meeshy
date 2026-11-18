import { servedAttachmentTranslations } from '../services/attachments/servedAttachmentTranslations';

const stripDataUri = (value: string | null | undefined): string | null =>
  value?.startsWith('data:') ? null : value ?? null;

/**
 * Les champs que la passerelle ne SERT jamais tels que la base les garde,
 * appliqués à la LECTURE par le client Prisma du serveur (`server.ts`), donc à
 * chaque route et chaque diffusion socket, relations imbriquées comprises.
 *
 * - `avatar` / `banner` : une image en `data:` inline n'est pas servie.
 * - `PostMedia.translations` (#19750) : chaque piste TTS traduite sort sans son
 *   `path`, le chemin disque ABSOLU que l'écriture grave en base. Jumeau de
 *   `servedAttachmentTranslations` côté message (#19672) ; ici un site UNIQUE
 *   couvre posts, stories, statuts, commentaires, fil, administration et
 *   `post:*` / `comment:*`, qui lisent tous `mediaSelect` sans sérialiseur
 *   commun. Aucun lecteur serveur n'a besoin de ce `path` : les octets se
 *   réclament par l'`url` (`translationTrackKeys`). Une piste RELUE puis
 *   réécrite (`PostAudioService`, fusion par langue) perd donc son `path` en
 *   base, sans effet.
 */
export const PRISMA_SERVED_RESULTS = {
  user: {
    avatar: { needs: { avatar: true }, compute: (user: { avatar: string | null }) => stripDataUri(user.avatar) },
    banner: { needs: { banner: true }, compute: (user: { banner: string | null }) => stripDataUri(user.banner) },
  },
  postMedia: {
    translations: {
      needs: { translations: true },
      compute: (media: { translations: unknown }) => servedAttachmentTranslations(media.translations),
    },
  },
  conversation: {
    avatar: {
      needs: { avatar: true },
      compute: (conversation: { avatar: string | null }) => stripDataUri(conversation.avatar),
    },
  },
} as const;
