import { DOCUMENT_MEDIAS } from '@/app/connecte/reglages-details-porte';

/**
 * `/settings/media/document` — « Téléchargement automatique » (§ 1.2 point 2
 * de la spécification) : la SEULE bascule de médias qui CHANGE un comportement
 * observable. Son lecteur est NOMMÉ, et il existe :
 * `lib/api/preferences.ts` › `apercusAutomatiques`, appelé par
 * `app/chats/[cle]/medias/route.ts` à chaque chargement de la galerie —
 * à `false` (le défaut du schéma) la grille ne demande aucun octet de média,
 * à `true` chaque tuile d'image ou de vidéo rend sa vignette.
 */
export const GET = (requete: Request): Promise<Response> => DOCUMENT_MEDIAS(requete);

export const POST = (requete: Request): Promise<Response> => DOCUMENT_MEDIAS(requete);

export const dynamic = 'force-dynamic';
