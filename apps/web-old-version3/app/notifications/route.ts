import { BOITE, TOUT_LIRE } from '@/app/connecte/notifs-porte';

/** `/notifications` — la boîte du lecteur. La porte vit dans
 *  `app/connecte/notifs-porte.ts` ; cette route ne fait que la JOINDRE.
 *  Le POST est « Tout lire », traité en Post/Redirect/Get. */
export const GET = (requete: Request): Promise<Response> => BOITE(requete);

export const POST = (requete: Request): Promise<Response> => TOUT_LIRE(requete);
