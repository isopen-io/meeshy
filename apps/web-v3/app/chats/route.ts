import { GESTE_SUR_UNE_LIGNE, LISTE_DES_CHATS } from '@/app/connecte/liste-porte';

/**
 * `/chats` — la liste des conversations du lecteur, et les trois gestes de
 * chaque ligne (§ 12.10.4). La porte vit dans `app/connecte/liste-porte.ts` ;
 * cette route ne fait que la JOINDRE.
 *
 * ENVELOPPÉE, PAS ASSIGNÉE DIRECTEMENT (même patron que `/feed` et `/links`,
 * et depuis le 2026-09-04 c'est un témoin qui l'impose :
 * `__tests__/routes-signature-app-router.test.ts`). App Router appelle un
 * gestionnaire avec DEUX arguments — `(requete, { params })` — même sur une
 * adresse sans segment dynamique. L'assignation nue était SÛRE tant que le
 * serviteur ne prenait qu'un argument ; `serviteurDe` accepte le récupérateur
 * de l'appelant depuis e62ef97e89, et l'objet `{ params }` de Next y
 * atterrissait puis se faisait APPELER comme un `fetch` — `TypeError: (c ?? …)
 * is not a function`, 500 sur CHAQUE lecture connectée de `/chats`, mesuré sur
 * staging (#5079), invisible en jsdom.
 */
export const GET = (requete: Request): Promise<Response> => LISTE_DES_CHATS(requete);
export const POST = (requete: Request): Promise<Response> => GESTE_SUR_UNE_LIGNE(requete);

export const dynamic = 'force-dynamic';
