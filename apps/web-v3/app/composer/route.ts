/**
 * `/composer` — CE QU'ON PUBLIE, ET POUR QUI (#4966, matrice `composer`).
 *
 * GESTIONNAIRE DE ROUTE, PAS PAGE : le document porte sa table de jetons, sa
 * feuille et ses glyphes, et n'expédie aucun octet de JavaScript.
 *
 * LES DEUX PORTES SONT ENVELOPPÉES, JAMAIS EXPORTÉES NUES. App Router appelle
 * tout gestionnaire avec `(requête, { params })` : une porte assignée nue
 * recevrait l'objet du framework dans son second paramètre — celui de la
 * couture — et l'appellerait comme un `fetch`. C'est la leçon 503, payée sur
 * `/feed` puis sur `/chats` ; `__tests__/routes-signature-app-router.test.ts`
 * la garde.
 */

import { LIS_LE_COMPOSER, PUBLIE_DEPUIS_LE_COMPOSER } from '@/app/connecte/composer-porte';

export const GET = (requete: Request): Promise<Response> => LIS_LE_COMPOSER(requete);

export const POST = (requete: Request): Promise<Response> => PUBLIE_DEPUIS_LE_COMPOSER(requete);
