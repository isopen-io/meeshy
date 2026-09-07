/**
 * `/moods/:id` — UNE HUMEUR PARTAGÉE, lu intégralement dans la langue du lecteur
 * (issue #4929, `cible/moods.png`).
 *
 * GESTIONNAIRE DE ROUTE, PAS PAGE — et c'est un CHIFFRE, pas un goût. Une PAGE
 * d'App Router émet SIX requêtes avant le premier pixel là où `budgets.json`
 * gate cette adresse à TROIS ; le document porte sa table de jetons, sa
 * feuille et ses glyphes : UNE requête.
 *
 * TROIS ADRESSES, UN SEUL LECTEUR. Cette route ne porte aucune vue et aucune
 * logique : elle NOMME son genre et délègue à `partage-porte.ts`, comme
 * `/stories/:id`. C'est ce que #4929 demande en toutes lettres — « rendu par
 * le MÊME composant lecteur que post/story/reel » —, et ce que trois portes
 * recopiées auraient perdu au premier correctif appliqué à deux d'entre elles.
 *
 * AUCUNE GARDE DE PRÉCHARGEMENT sur le GET : il ne mute rien. Le POST, lui,
 * POSE une parole ou un aime : il regarde d'où il vient (`app/provenance.ts`).
 */

import { GENRE_HUMEUR } from '@/lib/contenu/partage';

import { lisLePartage, soumetsAuPartage } from '@/app/(public)/partage-porte';

export const GET = async (requete: Request, contexte: { params: Promise<{ id: string }> }): Promise<Response> =>
  lisLePartage({ genre: GENRE_HUMEUR, requete, id: (await contexte.params).id });

export const POST = async (requete: Request, contexte: { params: Promise<{ id: string }> }): Promise<Response> =>
  soumetsAuPartage({ genre: GENRE_HUMEUR, requete, id: (await contexte.params).id });
