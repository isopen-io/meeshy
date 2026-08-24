import type { PostMedia, PostType, PostVisibility } from '@meeshy/shared/types/post';
import type { PostReferenceInput } from '@meeshy/shared/types/post-reference';

/**
 * La CHARGE d'une publication document (post/réel), déclarée UNE fois.
 *
 * Ce module n'existe que pour cette unicité. La surface neuve
 * (`ComposerDocumentSurface`) et le composer hérité (`components/v2/PostComposer`)
 * rendent la même charge au même appelant (`PostsFeedScreen.handlePublish`) :
 * tant qu'elle était déclarée des deux côtés, deux formes structurellement
 * identiques mais indépendantes pouvaient DÉRIVER — un champ ajouté d'un seul
 * côté part de la surface, n'est jamais lu par la mutation, et la perte est
 * silencieuse. Une propriété excédentaire sur un objet non-littéral ne fait pas
 * d'erreur, et aucun gate de ce dépôt ne type-vérifie `apps/web` (jest passe par
 * SWC, `next.config.js` porte `ignoreBuildErrors: true`) : la divergence
 * n'aurait donc rougi nulle part.
 *
 * Il vit sous `components/composer/` — pas dans l'un des deux consommateurs —
 * pour que la suppression du composer hérité, programmée par le plan, n'emporte
 * pas la déclaration avec elle.
 *
 * Ce qui est ici est CLIENT : `optimisticMedia` ne part jamais sur le fil.
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
