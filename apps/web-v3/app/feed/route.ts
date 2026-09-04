import { FIL_SOCIAL_SERVI, GESTE_SUR_UN_POST } from '@/app/connecte/social-porte';

/**
 * `/feed` — le fil social du lecteur connecté (#5031) : le rail de stories,
 * puis les posts et réels de son voisinage. La porte vit dans
 * `app/connecte/social-porte.ts` ; cette route ne fait que la JOINDRE.
 *
 * ENVELOPPÉE, PAS ASSIGNÉE DIRECTEMENT (même patron que `/contacts`,
 * `app/contacts/route.ts`) : App Router appelle un gestionnaire de route avec
 * DEUX arguments — `(requete, { params })` — même sur une adresse SANS segment
 * dynamique. `FIL_SOCIAL_SERVI`/`GESTE_SUR_UN_POST` prennent un second
 * paramètre `recuperer?` pour les témoins ; assignés tels quels à `GET`/`POST`,
 * l'objet `{ params }` de Next atterrissait dans ce paramètre et
 * `demande()` (`lib/api/publication.ts`) tentait de l'APPELER comme un
 * `fetch` — `TypeError: (c ?? …) is not a function`, mesuré en production
 * (`next start`), invisible en jsdom (`ts-jest` n'invoque jamais le
 * gestionnaire avec la signature réelle d'App Router).
 */
export const GET = (requete: Request): Promise<Response> => FIL_SOCIAL_SERVI(requete);
export const POST = (requete: Request): Promise<Response> => GESTE_SUR_UN_POST(requete);

export const dynamic = 'force-dynamic';
