import { DOCUMENT_MEDIAS } from '@/app/connecte/reglages-details-porte';

/**
 * `/settings/media/document` — « Téléchargement automatique » (§ 1.2 point 2
 * de la spécification) : la SEULE bascule de médias qui CHANGE un comportement
 * observable, `document.autoDownloadEnabled`, relu par `/chats/:cle/medias`.
 */
export const GET = (requete: Request): Promise<Response> => DOCUMENT_MEDIAS(requete);

export const POST = (requete: Request): Promise<Response> => DOCUMENT_MEDIAS(requete);

export const dynamic = 'force-dynamic';
