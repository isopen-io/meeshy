/**
 * `/stories/new` — PUBLIER UNE STORY (#5033, matrice `storyCreate`).
 *
 * GESTIONNAIRE DE ROUTE, PAS PAGE, comme les trente-trois autres.
 *
 * ELLE VIT HORS DU GROUPE `(public)`, où `/stories/[id]` habite, et ce n'est
 * pas un rangement : `/stories/:id` est une adresse PARTAGÉE — un lien reçu
 * l'ouvre —, tandis que publier est un geste de MEMBRE. Le segment statique
 * `new` l'emporte sur le segment dynamique `[id]` dans la résolution d'App
 * Router, donc aucune story ne peut être masquée par cet écran : `new` n'est
 * pas un identifiant de publication (24 caractères hexadécimaux).
 *
 * LES DEUX PORTES SONT ENVELOPPÉES, JAMAIS EXPORTÉES NUES (leçon 503).
 */

import { LIS_LA_STORY_NEUVE, PUBLIE_UNE_STORY } from '@/app/connecte/story-neuve-porte';

export const GET = (requete: Request): Promise<Response> => LIS_LA_STORY_NEUVE(requete);

export const POST = (requete: Request): Promise<Response> => PUBLIE_UNE_STORY(requete);
