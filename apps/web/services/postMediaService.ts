/**
 * Service de gestion des médias de POST côté frontend.
 *
 * Le pendant de `AttachmentService` pour les `PostMedia` — deux tables
 * distinctes côté gateway (`routes/uploads/tus-handler.ts`), donc deux
 * services distincts côté web. `AttachmentService.deleteAttachment` ne
 * connaît que `MessageAttachment` ; appelé sur un id de `PostMedia`, il rend
 * 404 sans rien supprimer.
 */

import { createAuthHeaders } from '@/utils/token-utils';
import { buildApiUrl } from '@/lib/config';
import { API_ENDPOINTS } from '@meeshy/shared/api/endpoints';

export class PostMediaService {
  /**
   * Supprime un `PostMedia` encore EN ATTENTE (jamais rattaché à un post ni
   * un commentaire) — le geste « retirer une vignette avant de publier ».
   * Un média déjà rattaché n'est pas concerné par cette route (404 côté
   * gateway) : il se retire par l'édition du post qui le porte.
   */
  static async deletePendingMedia(mediaId: string, token?: string): Promise<void> {
    const authHeaders = createAuthHeaders(token);

    const response = await fetch(buildApiUrl(API_ENDPOINTS.posts.mediaByMediaId(mediaId)), {
      method: 'DELETE',
      headers: authHeaders,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to delete media');
    }
  }
}
