import { lisLaStory, soumetsALaStory } from './porte';

/**
 * `/stories/:id` — UNE STORY PARTAGÉE, lue intégralement dans la langue du
 * lecteur (issue #4895, `cible/story.png`).
 *
 * GESTIONNAIRE DE ROUTE, PAS PAGE — et c'est un CHIFFRE, pas un goût. Le § 3.3
 * dessinait `stories/[id]/page.tsx` ; une PAGE d'App Router émet SIX requêtes
 * avant le premier pixel (le document, la feuille de coquille et les quatre
 * chunks du runtime) là où `budgets.json` gate cette adresse à TROIS, et
 * aucune option de Next 15.5 ne les retire (question ouverte
 * « plancher-next-au-dessus-du-gate-de-requetes »). Le § 12.6 a tranché la
 * seconde branche de l'arbitrage — « sortir les écrans du rôle premier de
 * l'hydratation d'App Router » — pour `/l/:token`, `/l/:token/expired`,
 * `/chat/:lien` et `/chats/…` ; cet écran la prend à son tour. Le document
 * porte sa table de jetons, sa feuille et ses glyphes : UNE requête.
 *
 * AUCUNE GARDE DE PRÉCHARGEMENT sur le GET : il ne mute rien — pas d'accusé de
 * lecture, pas de `POST /posts/:postId/view`. Un `Sec-Purpose: prefetch` ne
 * peut, sur cette adresse, que réchauffer un cache. Le POST, lui, POSE une
 * parole ou un aime : il regarde d'où il vient (`app/provenance.ts`).
 *
 * L'ÉTAT VIT DANS LA PORTE (`porte.ts`), pas ici : ce fichier ne fait que
 * nommer les deux méthodes, comme les autres gestionnaires de la zone.
 */

export const GET = async (requete: Request, contexte: { params: Promise<{ id: string }> }): Promise<Response> =>
  lisLaStory({ requete, id: (await contexte.params).id });

export const POST = async (requete: Request, contexte: { params: Promise<{ id: string }> }): Promise<Response> =>
  soumetsALaStory({ requete, id: (await contexte.params).id });
