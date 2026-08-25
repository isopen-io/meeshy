import type { PostMedia, PostType, PostVisibility } from '@meeshy/shared/types/post';
import type { PostReferenceInput } from '@meeshy/shared/types/post-reference';

/**
 * La CHARGE d'une publication document (post/réel), déclarée UNE fois.
 *
 * Ce module n'existe que pour cette unicité. Jusqu'au retrait du composer
 * hérité (`components/v2/PostComposer`, Task W9), la surface neuve
 * (`ComposerDocumentSurface`) ET lui rendaient la même charge au même
 * appelant (`PostsFeedScreen.handlePublish`) : tant qu'elle était déclarée des
 * deux côtés, deux formes structurellement identiques mais indépendantes
 * pouvaient DÉRIVER — un champ ajouté d'un seul côté part de la surface,
 * n'est jamais lu par la mutation, et la perte est silencieuse. Une propriété
 * excédentaire sur un objet non-littéral ne fait pas d'erreur, et aucun gate
 * de ce dépôt ne type-vérifie `apps/web` (jest passe par SWC, `next.config.js`
 * porte `ignoreBuildErrors: true`) : la divergence n'aurait donc rougi nulle
 * part.
 *
 * Le composer hérité est retiré depuis la Task W9, mais le module reste sous
 * `components/composer/` plutôt que dans `ComposerDocumentSurface` : il porte
 * aussi `ComposerRepostPayload`, consommée par `ComposerRepostSurface.tsx` ET
 * `MeeshyComposer.tsx` — le loger dans un composant referait la même faute
 * d'échelle qu'il corrigeait pour la charge document.
 *
 * Ce qui est ici est CLIENT : `optimisticMedia` ne part jamais sur le fil.
 *
 * ### Aucune langue d'origine n'y figure, et c'est mesuré
 *
 * `Post.originalLanguage` décrit la langue de `content`. Le seul signal
 * linguistique qu'une surface de composition web pourrait offrir vient du
 * reconnaisseur vocal, dont `recognition.lang` est réglé depuis la préférence
 * de l'auteur : une hypothèse SERVIE au reconnaisseur, jamais une mesure de ce
 * qui a été dit — et de toute façon muette sur la légende tapée.
 *
 * La règle F7d (`docs/superpowers/plans/2026-08-20-meeshy-composer-lot-f.md`)
 * se tient donc par l'ABSENCE de la clé : `PostService.createPost` (gateway)
 * fait gagner la revendication du client et n'appelle `detectLanguage(content)`
 * QUE si elle manque. La poser supprimerait la détection qui la justifiait.
 *
 * Le jour où une langue réellement MESURÉE existera (détection sur le texte,
 * transcription serveur), elle entrera par un champ qui dit d'où elle vient —
 * pas en réutilisant celui-ci.
 */
export interface ComposerDocumentPayload {
  content: string;
  type: PostType;
  visibility: PostVisibility;
  visibilityUserIds?: string[];
  mediaIds?: string[];
  /**
   * Écho CLIENT des médias déjà téléversés (id/mimeType/fileUrl sont connus
   * avant que le post existe côté serveur). Consommé par la mutation de
   * création pour semer le post optimiste — jamais envoyé au fil.
   */
  optimisticMedia?: readonly PostMedia[];
  /** Références DÉCLARÉES, non-INLINE. Absente (jamais `[]`) si personne n'est référencé. */
  mentions?: readonly PostReferenceInput[];
  /**
   * Texte alternatif par média (`PostMedia.alt`) — la clé est l'un des ids de
   * `mediaIds`. Absent (jamais `{}`) tant qu'aucun n'a été saisi.
   */
  mediaAlt?: Record<string, string>;
  /**
   * Opt-in de l'auteur pour le post ENTIER (`Post.allowSoundExtraction`) — pas
   * un champ par média. Absent (jamais `false`) tant que la bascule n'a pas été
   * touchée, pour qu'une mise à jour partielle n'écrase pas une valeur serveur
   * différente par un défaut jamais choisi.
   */
  allowSoundExtraction?: boolean;
}

/**
 * Le PUT d'une édition — W8. `data` est déjà le résultat de
 * `webUpdatePayload` (`lib/composer-door.ts`) : un champ absent ici veut dire
 * « inchangé », jamais « effacé ». Comme `ComposerDocumentPayload` ci-dessus,
 * cette forme est déclarée UNE fois, sous `components/composer/`, pour que la
 * surface neuve et ses deux appelants (`PostsFeedScreen`,
 * `app/feeds/post/[postId]/page.tsx`) ne recopient pas indépendamment la même
 * charge.
 */
export interface ComposerDocumentEditPayload {
  readonly postId: string;
  readonly data: Partial<{
    content: string;
    type: PostType;
    visibility: PostVisibility;
    visibilityUserIds: string[];
    mediaIds: string[];
    removeMediaIds: string[];
    mediaAlt: Record<string, string>;
  }>;
}

/**
 * Ce qu'un repost émet — W8. `targetId` n'y figure PAS : c'est l'appelant qui
 * le tient (`repostTargetId()`, `packages/shared/utils/repost-target.ts`,
 * l'UNIQUE résolveur de cible), et `ComposerRepostSurface` reste agnostique de
 * la façon dont sa cible a été trouvée — exactement comme elle est agnostique
 * du réseau. `targetType` est le format choisi dans l'éventail au moment
 * d'envoyer (loi 5 — l'ANCRAGE), jamais recalculé ailleurs.
 */
export interface ComposerRepostPayload {
  readonly targetType: PostType;
  readonly isQuote: boolean;
  readonly content?: string;
}
