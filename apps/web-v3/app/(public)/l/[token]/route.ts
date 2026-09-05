import { after } from 'next/server';

import { apercuDuLien, enregistreClic, resoudreLien, type CibleDuLien } from '@/lib/api/links';

import { cheminDuLienClos, destinationDe, estUnJetonServable } from './destination';
import { documentDeLEcran, rendDocument, type LigneDuDocument, type MetaDuDocument } from './document';
import { INCONNU, lisLeVisiteur, type Visiteur } from './visiteur';

/**
 * `/l/:token` — le RÔLE PREMIER, en un aller-retour et zéro octet de
 * JavaScript.
 *
 * Ce que remplace ce fichier, mesuré : `apps/web/app/l/[token]/page.tsx` fait
 * 550 lignes `'use client'`, et il enchaîne — charger le framework, hydrater,
 * POSTer le clic, PUIS GETter la résolution, PUIS rediriger. Un lien reçu dans
 * WhatsApp paie donc le plancher de la stack, deux allers-retours dont un
 * inutile, et une carte d'aperçu VIDE (`layout.tsx` : `title:''`,
 * `description:''`, `images:[]`).
 *
 * L'ORDRE, ici, est la moitié du livrable :
 *
 *   1. la RÉSOLUTION seule bloque la réponse — c'est le seul fait dont la
 *      redirection dépend ;
 *   2. la 302 part ;
 *   3. le CLIC part ensuite, remis à `after()`. Le critère de fin le demande
 *      « observé APRÈS la redirection », et c'est aussi ce qui est juste : la
 *      télémétrie n'a jamais à retarder un lecteur. Un appel lancé « en
 *      parallèle » puis non attendu partirait, lui, AVANT la réponse — ce
 *      serait plus rapide qu'aujourd'hui et faux au regard du critère.
 *
 * QUI REÇOIT QUOI. Un humain reçoit la 302 ; un robot d'aperçu reçoit le
 * document de repli et ses OG. La distinction n'est pas cosmétique : un robot
 * ne compose pas de carte à partir d'une 302 vide, et un humain n'a rien à
 * faire d'un document qu'il quitte dans la milliseconde. Le doute profite à
 * l'humain (§ `visiteur.ts`).
 *
 * ET ELLE GOUVERNE AUSSI LE CLIC : UN APERÇU N'EST PAS UN CLIC.
 *
 * `estUnRobot` change la RÉPONSE et la TÉLÉMÉTRIE. La v2 obtenait cela sans y
 * penser — elle enregistrait le clic depuis un composant `'use client'`, donc un
 * crawler, qui n'exécute pas de JavaScript, n'en produisait jamais. Compter le
 * clic ici, avant de savoir qui demande, serait une RÉGRESSION sur cette
 * propriété : un lien collé dans dix groupes WhatsApp afficherait dix clics et
 * zéro lecteur, et `SOURCE_PAR_AGENT` les ATTRIBUERAIT en prime à la plateforme
 * (le même agent `whatsapp` est reconnu robot ET rangé sous « WhatsApp »).
 * Deuxième raison, celle de la dimension 1 : la table de clics n'a aucune raison
 * de garder l'IP et l'agent des infrastructures de Facebook, Google ou Yandex.
 *
 * LE CLIC D'UN LIEN CLOS, LUI, SE COMPTE — et c'est une décision, pas l'ordre
 * des lignes : un jeton expiré ou désactivé qu'on essaie encore d'ouvrir est
 * une information que son auteur a demandée en traçant le lien, et c'est la
 * parité avec la v2, qui poste le clic avant de résoudre. Le clic d'une
 * PASSERELLE TOMBÉE se compte pour la même raison : le lecteur, lui, a bien
 * cliqué.
 *
 * CE QUI NE SE DISTINGUE PAS. Un jeton inconnu, un lien désactivé, un lien
 * expiré et une cible inouvrable mènent tous à la MÊME adresse close. Servir
 * un 404 au premier serait un oracle d'énumération sur l'espace des jetons —
 * le patron `resolveConsumptionTarget` du § 5.1, appliqué ici.
 *
 * CE QUI, LUI, SE DISTINGUE. Une passerelle injoignable n'est pas un lien
 * fermé (§ 7). Elle rend 503 et l'écran dessiné, jamais « ce lien a expiré » :
 * un lecteur ne peut pas contredire un message qui lui ment.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** La copie de l'écran, telle que la planche la nomme. */
const TITRE = 'Ouverture du lien';
const ENTETE = { titre: TITRE, sous: 'Redirection' } as const;
const PASTILLE = { glyphe: 'ph-arrows-clockwise', ton: 'primaire' } as const;

/**
 * Une adresse de redirection n'a rien à faire dans un index ; l'aperçu, lui,
 * n'est pas de l'indexation et reste servi (§ 5.4).
 */
const NOINDEX = 'noindex';

const CORPS_ATTENTE = 'Nous vérifions le lien et préparons la conversation. Cela prend une seconde.';
const CORPS_INDISPONIBLE =
  "Le lien n'a pas pu être vérifié : le service n'a pas répondu. Réessayez dans un instant — le lien, lui, n'a pas changé.";

/**
 * LES DEUX CONTRÔLES DE L'ÉCRAN DISENT SON ÉTAT — le gabarit, lui, est commun.
 *
 * Le doc-comment de ce fichier grave l'invariant : « une passerelle injoignable
 * n'est pas un lien fermé ; elle rend 503, jamais “ce lien a expiré” ». Un écran
 * 503 dont le geste secondaire mène à `cheminDuLienClos()` le contredit en un
 * tap : le lecteur atteint l'état CLOS, terminal, et abandonne un lien qui est
 * parfaitement valide. Le libellé ne rachète rien — c'est la DESTINATION qui
 * ment. Aucun de ces deux écrans ne pointe donc l'état clos : on n'y arrive que
 * par la REDIRECTION que sert un lien réellement fermé.
 *
 * Et le principal se nomme par ce qu'il FAIT. « Continuer » promet la suite du
 * voyage : juste sur l'écran d'attente, dont le principal EST la destination ;
 * faux sur l'écran de panne, dont le principal est un rappel de la même adresse
 * alors que la passerelle est toujours à terre — un lecteur qui tape et retombe
 * sur le même écran doit comprendre qu'il a réessayé.
 */
const CONTINUER = 'Continuer';
const REESSAYER = 'Réessayer';
const RETOUR_ACCUEIL = "Revenir à l'accueil";

/**
 * L'aperçu servi quand le CONTENU n'est pas lisible sans compte.
 *
 * `GET /posts/:postId` est `requiredAuth` (§ 5.1, blocage `gw:optionalAuth-post`) :
 * tant qu'il ne bascule pas en `optionalAuth`, aucun titre de story, de réel ou
 * de post ne peut être lu ici — pas même côté serveur. Ce que la carte annonce
 * est donc ce que la v3 SAIT : la nature du contenu partagé. C'est déjà tout
 * autre chose qu'une carte vide, et le jour où L3 ouvre les deux routes, c'est
 * ce seul tableau qui disparaît.
 */
const APERCU_PAR_TYPE: Readonly<Record<CibleDuLien['typeDeCible'], string>> = {
  STORY: 'Une story partagée sur Meeshy',
  REEL: 'Un réel partagé sur Meeshy',
  POST: 'Une publication partagée sur Meeshy',
  STATUS: 'Une humeur partagée sur Meeshy',
  CONVERSATION: 'Une conversation partagée sur Meeshy',
  PROFILE: 'Un profil Meeshy',
  EXTERNAL: 'Un lien partagé sur Meeshy',
  INCONNU: 'Un lien partagé sur Meeshy',
};

const DESCRIPTION_PAR_DEFAUT =
  'Ouvrez le contenu partagé avec vous, dans votre langue, sans créer de compte.';

/**
 * L'URL CANONIQUE de ce lien — celle que les plateformes mettent en cache.
 *
 * Elle ne se déduit pas de l'en-tête `Host` : derrière Traefik, l'hôte interne
 * n'est pas l'origine publique, et une carte d'aperçu servie sous deux origines
 * est mise en cache deux fois. Elle ne garde pas non plus la chaîne de requête :
 * deux partages du même lien avec deux jeux d'UTM sont le MÊME contenu.
 */
const urlCanonique = (url: URL, token: string): string => {
  const base = (process.env.NEXT_PUBLIC_FRONTEND_URL ?? process.env.FRONTEND_URL ?? url.origin).replace(
    /\/+$/,
    '',
  );
  return `${base}/l/${encodeURIComponent(token)}`;
};

/** « Inconnu · Inconnu » n'apprend rien : un agent qui ne se décrit pas le dit UNE fois. */
const appareilLisible = ({ os, navigateur }: Visiteur['appareil']): string => {
  const dits = [os, navigateur].filter((part) => part !== INCONNU);
  return dits.length === 0 ? INCONNU : dits.join(' · ');
};

const lignesDuContexte = (token: string, visiteur: Visiteur): readonly LigneDuDocument[] => [
  { cle: 'Jeton', valeur: `l/${token}` },
  { cle: 'Origine', valeur: visiteur.source },
  { cle: 'Appareil', valeur: appareilLisible(visiteur.appareil) },
  {
    cle: 'Langue détectée',
    valeur:
      visiteur.langue.drapeau === null
        ? visiteur.langue.libelle
        : `${visiteur.langue.drapeau} ${visiteur.langue.libelle}`,
  },
];

const redirige = (destination: string): Response =>
  new Response(null, {
    status: 302,
    headers: { location: destination, 'cache-control': 'no-store' },
  });

const clicDuVisiteur = (visiteur: Visiteur) => ({
  ipAddress: visiteur.ip ?? undefined,
  userAgent: visiteur.userAgent ?? undefined,
  browser: visiteur.appareil.navigateur,
  os: visiteur.appareil.os,
  device: visiteur.appareil.type,
  language: visiteur.langue.etiquette,
  languages: visiteur.langue.liste ?? undefined,
  referrer: visiteur.referrer ?? undefined,
  socialSource: visiteur.source,
  ...visiteur.utm,
});

const ouvertureDe = async ({
  cible,
  token,
  url,
}: {
  readonly cible: CibleDuLien;
  readonly token: string;
  readonly url: URL;
}): Promise<MetaDuDocument> => {
  const apercu =
    cible.typeDeCible === 'CONVERSATION' ? await apercuDuLien({ identifiant: token }) : null;

  return {
    titre: apercu?.nom ?? APERCU_PAR_TYPE[cible.typeDeCible],
    description: apercu?.description ?? DESCRIPTION_PAR_DEFAUT,
    robots: NOINDEX,
    carte: { url: urlCanonique(url, token) },
  };
};

export async function GET(
  requete: Request,
  contexte: { readonly params: Promise<{ readonly token: string }> },
): Promise<Response> {
  const { token } = await contexte.params;
  const url = new URL(requete.url);

  if (!estUnJetonServable(token)) return redirige(cheminDuLienClos(token));

  const visiteur = lisLeVisiteur({ entetes: requete.headers, url });

  if (!visiteur.estUnRobot) {
    after(async () => {
      await enregistreClic({ token, clic: clicDuVisiteur(visiteur) });
    });
  }

  const resolution = await resoudreLien({ token });

  if (resolution.etat === 'clos') return redirige(cheminDuLienClos(token));

  if (resolution.etat === 'indisponible') {
    return rendDocument(
      documentDeLEcran({
        meta: {
          titre: APERCU_PAR_TYPE.INCONNU,
          description: DESCRIPTION_PAR_DEFAUT,
          robots: NOINDEX,
          carte: { url: urlCanonique(url, token) },
        },
        entete: ENTETE,
        pastille: PASTILLE,
        titre: TITRE,
        corps: CORPS_INDISPONIBLE,
        lignes: lignesDuContexte(token, visiteur),
        principal: { libelle: REESSAYER, href: url.pathname + url.search },
        secondaire: { libelle: RETOUR_ACCUEIL, href: '/' },
      }),
      503,
    );
  }

  const destination = destinationDe({ token, cible: resolution.cible });

  if (!visiteur.estUnRobot) return redirige(destination);

  return rendDocument(
    documentDeLEcran({
      meta: await ouvertureDe({ cible: resolution.cible, token, url }),
      entete: ENTETE,
      pastille: PASTILLE,
      titre: TITRE,
      corps: CORPS_ATTENTE,
      lignes: lignesDuContexte(token, visiteur),
      principal: { libelle: CONTINUER, href: destination },
      secondaire: { libelle: RETOUR_ACCUEIL, href: '/' },
    }),
    200,
  );
}
