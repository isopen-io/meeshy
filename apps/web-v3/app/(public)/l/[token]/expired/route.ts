import { causeDeCloture, type CauseDeCloture } from '@/lib/api/links';

import { estUnJetonServable } from '../destination';
import { rendDocument } from '../document';
import { documentDuLienClos } from './vue';

/**
 * `/l/:token/expired` — un lien mort DIT pourquoi, et propose une suite.
 *
 * C'est souvent le premier contact d'un visiteur avec Meeshy : autant de gens
 * ouvrent un lien périmé qu'un lien vif. La raison est donc dans les octets de
 * la PREMIÈRE réponse, pas découverte par un client après hydratation, ni
 * annoncée par un spinner qui finirait en page blanche sur un téléphone en 3G.
 *
 * POURQUOI UN GESTIONNAIRE DE ROUTE, ET PAS UNE PAGE
 *
 * Le § 8.3 gate cet écran à DEUX requêtes avant le premier pixel — « HTML +
 * CSS ». Une PAGE d'App Router en émet SIX, mesuré, même sans un seul composant
 * client : le document, la feuille de la coquille, et les quatre chunks du
 * runtime que Next pose dans le `<head>` de toute page rendue (webpack, le
 * chunk React, le chunk partagé, main-app). Aucune option de Next 15.5.23 ne
 * les retire, et cet écran a d'abord été écrit en page — donc en franchissement
 * DÉCLARÉ, renvoyé à un arbitrage d'architecture.
 *
 * C'était le mauvais verdict pour CET écran. Le contournement était déjà écrit
 * dans le même lot, un dossier plus haut : `../route.ts` compose son document à
 * la main et atteint UNE requête. Un gestionnaire de route ne traverse pas le
 * pipeline de rendu de Next — il rend un `Response(html)` —, donc il ne porte
 * aucun chunk framework ; le manifeste de build le montre à l'envers :
 * `/healthz/route` liste ces quatre chunks dans son entrée sans jamais les
 * servir, parce qu'il répond en JSON sans balisage. L'arbitrage reste ouvert
 * pour la lecture partagée (`/stories/:id`, `/posts/:id`, `/reels/:id`,
 * `/moods/:id`), qui a besoin d'une PAGE ; il ne l'était pas ici.
 *
 * Le gabarit, lui, ne change pas d'un pixel : `../document.ts` et
 * `../feuille.ts` sont partagés avec l'écran jumeau — c'est ce partage, et non
 * une seconde feuille, qui interdit aux deux surfaces de diverger.
 *
 * D'OÙ VIENT LA RAISON, ET POURQUOI PAS DE L'URL
 *
 * La redirection mène ses refus à la MÊME adresse (§ 5.1 : un état distinct par
 * jeton inconnu serait un oracle d'énumération), donc l'adresse ne porte aucun
 * code — et un code porté en query serait de toute façon dicté par le lecteur,
 * pas par la passerelle. La cause est relue ici, à la source, par
 * `causeDeCloture`, qui la descend de la porte répondant aux DEUX familles de
 * jetons (§ `lib/api/links.ts`).
 *
 * CE QUE CET ÉCRAN NE REND PAS. Rien de la conversation derrière le lien — ni
 * son nom, ni sa description, ni son créateur, que la passerelle sert pourtant
 * en entier. La planche dessine une ligne « Conversation » ; c'est l'écart
 * assumé, et il est pris sur l'exigence de sécurité de l'issue.
 *
 * LE STATUT SUIT LA CAUSE, PAS UN 200 CONSTANT (#4933, critère de fin de
 * `links`). Un lien fermé n'a PLUS RIEN à servir — le HTTP le dit lui-même :
 * `verification-impossible` (§ 7, « erreur réseau ≠ refus ») est la SEULE
 * cause qui ne rende pas un lien mort, donc la SEULE en 503 ; les cinq autres
 * — quatre refus nommés et l'inconnu qui rejoue la même page par prudence
 * anti-oracle (§ 5.1) — rendent 410, l'exacte sémantique du refus.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const statutDeLaCause = (cause: CauseDeCloture): number => (cause === 'verification-impossible' ? 503 : 410);

export async function GET(
  _requete: Request,
  contexte: { readonly params: Promise<{ readonly token: string }> },
): Promise<Response> {
  const { token } = await contexte.params;
  const cause = estUnJetonServable(token) ? await causeDeCloture({ token }) : 'indeterminee';

  return rendDocument(documentDuLienClos({ cause, token }), statutDeLaCause(cause));
}
