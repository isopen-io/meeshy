import type { CauseDeCloture } from '@/lib/api/links';

/**
 * Ce que l'écran d'un lien clos DIT, et les deux suites qu'il propose.
 *
 * QUATRE RAISONS, JAMAIS UN MESSAGE UNIQUE. « Ce lien n'est plus valable »
 * répond à la question que personne ne pose. Un lecteur veut savoir s'il doit
 * redemander un lien (expiré, fermé, épuisé), ou s'il n'y a plus rien à ouvrir
 * (conversation terminée) — et ces deux réponses n'ont pas la même SUITE.
 *
 * LA SUITE FAIT PARTIE DE LA RAISON. « Demander un nouveau lien » sur une
 * conversation CLOSE est un contrôle sans effet : le lien n'y est pour rien, et
 * un nouveau lien ouvrirait la même conversation terminée. C'est la loi 4 (« un
 * contrôle existe s'il a un effet ») appliquée au geste secondaire, et c'est
 * pourquoi la table porte la suite à côté de la copie plutôt qu'un bouton
 * constant sous les six états.
 *
 * ET ELLE S'APPLIQUE D'ABORD À `reessayer`, QUI EST LA SUITE LA PLUS FACILE À
 * RENDRE INERTE
 *
 * « Réessayer ce lien » pointe `/l/:token` — la porte d'où l'on VIENT. Tant que
 * cette suite était celle de `indeterminee`, elle était inerte dans TOUS les
 * chemins qui produisent cet état : un jeton hors forme, un lien que la
 * résolution dit clos, un refus non répertorié y renvoient tous vers une porte
 * qui redirige aussitôt ICI. Deux allers-retours et un appel passerelle, sur le
 * téléphone en 3G qui est la cible du rôle premier, pour réafficher le MÊME
 * écran mot pour mot — la loi 4 retournée contre l'écran qui la cite, dans
 * l'état qui allait devenir le plus fréquent.
 *
 * D'où la SIXIÈME cause, `verification-impossible` : elle sépare « le lien est
 * fini, on ne sait pas de quoi » (`indeterminee` ⇒ demander un nouveau lien, un
 * effet réel quel que soit le motif) de « on n'a pas pu le vérifier »
 * (⇒ réessayer, la seule situation où le geste mène à un autre écran). Un
 * booléen posé à côté de la cause aurait dit la même chose en la rendant
 * représentable partout ; une cause de plus la rend vraie par construction.
 *
 * POURQUOI LE GESTE SECONDAIRE EST UN `mailto:` — ET CE QUE ÇA DÉCLARE
 *
 * Mesuré : la passerelle n'expose AUCUNE porte de « demande d'accès »
 * (`grep -rn "request-access\|joinRequest" services/gateway/src` = 0). Le seul
 * chemin réel vers un nouveau lien est donc de le demander à la personne qui a
 * partagé celui-ci — que la v3 ne connaît pas, et n'a pas à révéler (§ 5.1, la
 * fuite d'identité du créateur). Un `mailto:` sans destinataire ouvre le
 * courrier du lecteur avec le jeton déjà écrit : c'est un effet RÉEL, sans une
 * ligne de JavaScript, sur le téléphone qui est la cible du rôle premier. Le
 * jour où une porte de demande existe côté passerelle, c'est cette seule ligne
 * qui change.
 *
 * CE QUI N'ENTRE PAS DANS CETTE TABLE. Rien du réseau, le jeton excepté : ni le
 * nom de la conversation, ni sa description, ni son créateur — que
 * `GET /anonymous/link/:identifier` sert pourtant en entier. La planche dessine
 * une ligne « Conversation » ; la v3 ne la sert pas, et c'est un écart ASSUMÉ,
 * pris sur l'exigence de l'issue #4496 : « aucune information révélant
 * l'existence ou non de la conversation derrière le lien ».
 */

export type ActionDeLienClos = {
  readonly libelle: string;
  readonly href: string;
};

export type EtatDeLienClos = {
  readonly cause: CauseDeCloture;
  /** Le titre du chrome : ce qui s'est passé, en deux mots. */
  readonly entete: string;
  readonly titre: string;
  readonly corps: string;
  /** La valeur de la ligne « Statut » de la carte de contexte. */
  readonly statut: string;
  readonly principal: ActionDeLienClos;
  readonly secondaire: ActionDeLienClos;
};

type CopieDeLEtat = {
  readonly entete: string;
  readonly titre: string;
  readonly corps: string;
  readonly statut: string;
  readonly suite: 'nouveau-lien' | 'accueil' | 'reessayer';
};

const DEMANDE_OU_CONNEXION =
  'Demandez-en un nouveau à la personne qui vous l’a partagé, ou connectez-vous si vous êtes déjà membre.';

const COPIE: Readonly<Record<CauseDeCloture, CopieDeLEtat>> = {
  expiration: {
    entete: 'Lien expiré',
    titre: 'Ce lien a expiré',
    corps: `La date de validité fixée par son auteur est passée. ${DEMANDE_OU_CONNEXION}`,
    statut: 'Expiré',
    suite: 'nouveau-lien',
  },
  desactivation: {
    entete: 'Lien fermé',
    titre: 'Ce lien a été fermé',
    corps: `Son auteur l’a désactivé. ${DEMANDE_OU_CONNEXION}`,
    statut: 'Fermé par son auteur',
    suite: 'nouveau-lien',
  },
  epuisement: {
    entete: 'Lien épuisé',
    titre: 'Ce lien a atteint sa limite',
    corps: `Il a servi le nombre de fois prévu par son auteur. ${DEMANDE_OU_CONNEXION}`,
    statut: 'Épuisé',
    suite: 'nouveau-lien',
  },
  'conversation-terminee': {
    entete: 'Conversation terminée',
    titre: 'Cette conversation est terminée',
    corps:
      'Le lien fonctionne toujours, mais la conversation qu’il ouvrait a été close : un nouveau lien n’y changerait rien. Connectez-vous si vous en étiez membre.',
    statut: 'Conversation close',
    suite: 'accueil',
  },
  /**
   * La passerelle N'A PAS dit ce lien fermé — elle est muette, ou elle le sert
   * encore. C'est la seule situation où « Réessayer ce lien » mène AILLEURS :
   * `/l/:token` y rend soit la redirection vers la cible, soit l'écran 503 de
   * la passerelle tombée. Deux écrans différents de celui-ci, donc un contrôle
   * qui a un effet.
   */
  'verification-impossible': {
    entete: 'Lien non vérifié',
    titre: 'Nous n’avons pas pu vérifier ce lien',
    corps:
      'Le service n’a pas répondu — le lien, lui, n’a pas changé. Réessayez dans un instant, ou connectez-vous si vous êtes déjà membre.',
    statut: 'Non vérifié',
    suite: 'reessayer',
  },
  indeterminee: {
    entete: 'Lien indisponible',
    titre: 'Ce lien n’a pas pu être ouvert',
    corps: `Il a peut-être expiré, été fermé par son auteur, ou atteint sa limite d’utilisation. ${DEMANDE_OU_CONNEXION}`,
    statut: 'Indéterminé',
    suite: 'nouveau-lien',
  },
};

const OBJET_DU_COURRIEL = 'Un nouveau lien Meeshy, s’il vous plaît';

const corpsDuCourriel = (token: string): string =>
  `Bonjour,\n\nLe lien Meeshy que vous m’avez partagé (l/${token}) ne s’ouvre plus. Pourriez-vous m’en envoyer un nouveau ?\n\nMerci !`;

const demandeDeNouveauLien = (token: string): ActionDeLienClos => ({
  libelle: 'Demander un nouveau lien',
  href: `mailto:?subject=${encodeURIComponent(OBJET_DU_COURRIEL)}&body=${encodeURIComponent(
    corpsDuCourriel(token),
  )}`,
});

const SUITES: Readonly<Record<CopieDeLEtat['suite'], (token: string) => ActionDeLienClos>> = {
  'nouveau-lien': demandeDeNouveauLien,
  accueil: () => ({ libelle: 'Revenir à l’accueil', href: '/' }),
  reessayer: (token) => ({
    libelle: 'Réessayer ce lien',
    href: `/l/${encodeURIComponent(token)}`,
  }),
};

/**
 * Le geste PRINCIPAL est le même partout, et c'est une décision : quelle que
 * soit la cause, la seule chose que le lecteur puisse faire MAINTENANT et qui
 * rende le contenu, c'est se connecter s'il est déjà membre. `?next=` garde le
 * lien de côté — l'écran `login` le restaure (§ 10.1).
 */
const connexion = (token: string): ActionDeLienClos => ({
  libelle: 'Se connecter',
  href: `/login?next=${encodeURIComponent(`/l/${token}`)}`,
});

export const etatDeCloture = ({
  cause,
  token,
}: {
  readonly cause: CauseDeCloture;
  readonly token: string;
}): EtatDeLienClos => {
  const { entete, titre, corps, statut, suite } = COPIE[cause];

  return {
    cause,
    entete,
    titre,
    corps,
    statut,
    principal: connexion(token),
    secondaire: SUITES[suite](token),
  };
};
