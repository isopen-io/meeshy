import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { isAuthorListedViewerType } from '../../config/viewer-activity-disclosure';

/*
 * Qui peut LIRE la liste des personnes qui ont vu ou réagi à un contenu — sorti de
 * `viewerEngagement.ts` (#14057) pour que la mention le consulte sans charger les
 * lecteurs de pages de spectateurs. `viewerEngagement` le réexporte.
 */

/**
 * Qui demande la liste : son identifiant, son rôle GLOBAL, et ce que la trace
 * d'audit retient de sa requête quand c'est son rôle qui lui ouvre la porte.
 */
export type InteractionsReader = {
  readonly id: string;
  readonly role?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
};

/**
 * Comment la liste s'ouvre à ce lecteur :
 *
 * - `'author'` — l'auteur d'une story ou d'un statut lit SES spectateurs, sans
 *   trace (la liste « Vu par » existait avant #9727) ;
 * - `'admin'` — ADMIN/BIGBOSS, pour tout contenu, PAR LEUR RÔLE : la lecture
 *   écrit sa ligne d'audit avant de rien lire. Un administrateur auteur d'un
 *   post y passe aussi — comme auteur, il n'y aurait pas droit ;
 * - `'denied'` — tout le reste : l'auteur d'un post ou d'un réel (il n'en voit
 *   que les nombres), MODERATOR, AUDIT, ANALYST, et tout autre lecteur.
 */
export type ViewerListAccess = 'author' | 'admin' | 'denied';

export function viewerListAccess(
  post: { readonly authorId: string; readonly type?: string | null },
  reader: InteractionsReader,
): ViewerListAccess {
  if (post.authorId === reader.id && isAuthorListedViewerType(post.type)) return 'author';
  if (typeof reader.role === 'string' && isGlobalAdmin(reader.role)) return 'admin';
  return 'denied';
}
