import type { CanvasV3 } from '@meeshy/shared/types/canvas-v3';
import type { PostVisibility } from '@meeshy/shared/types/post';

import type { PublicationKind } from '@/lib/stories/publication-kind';
import { unclaimedStoryMediaIds } from '@/lib/stories/story-document';

import type { ConversationsDeps } from './conversations';
import { CANVAS_CAPS_HEADERS } from './feed-pages';
import type { ApiResult } from './http';

/**
 * LE PORT DE PUBLICATION D'UNE STORY (#6900, § 3.3 de la spécification) —
 * `POST /api/v1/posts` (`services/gateway/src/routes/posts/core.ts:370-462`),
 * `type: 'STORY'`. `CANVAS_CAPS_HEADERS` part comme sur les trois autres ports
 * de `lib/api/stories.ts`.
 *
 * **`visibility` PART UNIQUEMENT quand l'auteur l'a CHOISIE** (#7683, D-115) :
 * absente, la passerelle pose son propre défaut (`FRIENDS` pour une story,
 * `PUBLIC` sinon, `core.ts:421`) — un défaut recopié ici en littéral serait
 * exactement la faute qui avait laissé les stories web à `FRIENDS` pendant que
 * les posts naissaient publics. Le studio (`story-compose.tsx`) ne pose ce
 * champ que depuis `draft.visibility`, jamais un repli inventé.
 *
 * **La garde `MEDIA_NOT_CLAIMED` est rejouée AVANT tout envoi** (`core.ts:146-158`) :
 * un objet qui adresse un `postMediaId` absent de `mediaIds` pointerait dans
 * le vide, drapeau serveur armé ou non — le port refuse, aucun octet ne part.
 *
 * **`CanvasV3Schema` n'est PAS rejoué à l'exécution (revue-correction)** :
 * il est déclaré avec le `zod` COMPLET, et Rollup range tout `zod` sous UN
 * chunk — celui que la vingtaine d'écrans validant en `zod/mini` (profil,
 * communautés, liens, appels…) téléchargent. Mesuré : ce chunk passait de
 * 5,53 à 18,75 Ko gzip pour tous ces écrans ; séparer `zod/v4/classic` n'en
 * sortait que 4,49 (le noyau partagé grossit avec ce que le complet utilise).
 * Le document ne vient d'aucune saisie structurelle : il sort d'UN composeur
 * TYPÉ (`composeStoryCanvas`, `CanvasV3`) dont CHAQUE forme possible est
 * prouvée contre `CanvasV3Schema` par `story-document.test.ts`. La passerelle
 * reste juge (`CANVAS_INVALID`, `core.ts:118-129`), et son refus se dit.
 */
export type PublishStoryParams = ConversationsDeps & {
  /**
   * **LE FORMAT PUBLIÉ** (#7497) — le studio est le composer UNIQUE de la
   * story, du post et du réel : le même canevas part sous le `type` que
   * l'auteur publie. Absent ⇒ `STORY`. La passerelle pose la visibilité par
   * défaut du format (`FRIENDS` pour une story, `PUBLIC` sinon, `core.ts`).
   */
  readonly type?: PublicationKind;
  /**
   * **L'AUDIENCE CHOISIE PAR L'AUTEUR** (#7683) — absente tant que rien n'est
   * choisi (D-111, § « `visibility` n'est PAS envoyée » sans choix). Jamais
   * `visibilityUserIds` : le studio n'offre aucun mode nominatif choisissable
   * (`ONLY`/`EXCEPT` restent grisés, `publication-audience.ts`).
   */
  readonly visibility?: PostVisibility;
  /**
   * **LE CONTENU DE LA PUBLICATION** — `Post.content`, jamais « la légende »
   * (commentaire corrigé, #6944 : il DISAIT « LA LÉGENDE », et c'est
   * exactement la confusion que la directive porteur du 2026-09-17 a levée).
   * Le dépôt tient TROIS contenus distincts, même à chaînes égales :
   * `Post.content` (ci-dessous), `PostMedia.caption` ({@link mediaCaption}) et
   * `PostMedia.alt`.
   *
   * Une story n'en a pas : son texte vit dans `storyEffects`, et l'envoyer
   * ici le ferait rendre DEUX FOIS chez le lecteur (l'objet du canevas, puis
   * sa copie sous la carte) — miroir du `content: nil` iOS
   * (`StoryViewModel+PublicationUpload.swift:378-391`). Le champ reste absent
   * du corps, jamais une chaîne vide POSÉE quand même.
   */
  readonly content?: string;
  /**
   * **LA LÉGENDE DE CHAQUE MÉDIA** — `PostMedia.caption`, la carte
   * `{ postMediaId → texte }` que `POST /posts` attend
   * (`CreatePostSchema.mediaCaption`, `routes/posts/types.ts:282`, bornée à
   * 1000 caractères et IGNORÉE pour tout id absent de `mediaIds`).
   * `PostService.applyMediaCaption` l'écrit et déclenche sa traduction
   * (#6280) — c'est donc ELLE, et jamais `content`, qui porte « la légende de
   * l'image ou de la vidéo de fond ». Composée par
   * `storyMediaCaptionPayload` (`lib/stories/media-caption.ts`), jamais à la
   * main : la borne et le rejet des entrées vides y vivent une fois.
   */
  readonly mediaCaption?: Record<string, string>;
  readonly originalLanguage?: string;
  readonly storyEffects: CanvasV3;
  readonly mediaIds: readonly string[];
  readonly signal?: AbortSignal;
};

export type PublishStoryResult = { readonly id: string };

let fixturePublications = 0;

export async function publishStory(params: PublishStoryParams): Promise<ApiResult<PublishStoryResult>> {
  const unclaimed = unclaimedStoryMediaIds(params.storyEffects, params.mediaIds);
  if (unclaimed.length > 0) {
    return { ok: false, status: 0, error: 'Un média de la story n’a pas été référencé', code: 'MEDIA_NOT_CLAIMED' };
  }

  if (__FIXTURES__ && params.source === 'fixtures') {
    fixturePublications += 1;
    return { ok: true, data: { id: `fx-story-${fixturePublications}` } };
  }

  return params.transport.request<PublishStoryResult>({
    method: 'POST',
    path: '/api/v1/posts',
    headers: CANVAS_CAPS_HEADERS,
    body: {
      type: params.type ?? 'STORY',
      ...(params.visibility !== undefined ? { visibility: params.visibility } : {}),
      ...(params.content !== undefined && params.content !== '' ? { content: params.content } : {}),
      ...(params.originalLanguage !== undefined ? { originalLanguage: params.originalLanguage } : {}),
      ...(params.mediaCaption !== undefined ? { mediaCaption: params.mediaCaption } : {}),
      storyEffects: params.storyEffects,
      mediaIds: params.mediaIds,
    },
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}
