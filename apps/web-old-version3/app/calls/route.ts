import { HISTORIQUE } from '@/app/connecte/appels-porte';

/** `/calls` — l'historique des appels. La porte vit dans
 *  `app/connecte/appels-porte.ts` ; cette route ne fait que la JOINDRE.
 *  Écran de CONSULTATION pure : aucun `POST` (passer un appel est hors
 *  périmètre de la v3). */
export const GET = (requete: Request): Promise<Response> => HISTORIQUE(requete);

export const dynamic = 'force-dynamic';
