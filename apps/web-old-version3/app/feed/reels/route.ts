/**
 * `/feed/reels` — LE FIL DE RÉELS DU LECTEUR CONNECTÉ (#5032, matrice `reels`).
 *
 * GESTIONNAIRE DE ROUTE, PAS PAGE, comme les trente autres de la zone : le
 * document porte sa table de jetons, sa feuille et ses glyphes, et n'expédie
 * aucun octet de JavaScript.
 *
 * CETTE ROUTE NE PORTE NI VUE NI LOGIQUE : elle délègue à `reels-porte.ts`,
 * qui rend le MÊME lecteur que `/reels/:id`. C'est le critère de fin de la
 * matrice — « un SEUL composant lecteur sert la route publique et la route
 * connectée (aucune jumelle) ».
 *
 * LA PORTE EST ENVELOPPÉE, JAMAIS EXPORTÉE NUE. App Router appelle tout
 * gestionnaire avec `(requête, { params })` : une porte assignée nue recevrait
 * l'objet du framework dans son second paramètre — celui de la couture — et
 * l'appellerait comme un `fetch`. C'est la leçon 503, payée sur `/feed` puis
 * sur `/chats` ; `__tests__/routes-signature-app-router.test.ts` la garde.
 */

import { LIS_LE_FIL_DES_REELS } from '@/app/connecte/reels-porte';

export const GET = (requete: Request): Promise<Response> => LIS_LE_FIL_DES_REELS(requete);
