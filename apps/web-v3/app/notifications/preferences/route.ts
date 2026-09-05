import { PREFERENCES } from '@/app/connecte/prefs-porte';

/** `/notifications/preferences` — les treize bascules. La porte vit dans
 *  `app/connecte/prefs-porte.ts` ; cette route ne fait que la JOINDRE, comme
 *  `app/notifications/route.ts` le fait pour la boîte. GET sert le document,
 *  POST bascule UNE clé et redirige (Post/Redirect/Get). */
export const GET = (requete: Request): Promise<Response> => PREFERENCES(requete);

export const POST = (requete: Request): Promise<Response> => PREFERENCES(requete);
