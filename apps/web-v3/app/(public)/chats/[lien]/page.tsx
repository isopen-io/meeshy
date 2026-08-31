import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import {
  apercuDadhesion,
  revalideLaPlace,
  type LienDadhesion,
  type Revalidation,
} from '@/lib/api/adhesion';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { langueDemandee } from '@/lib/a11y/langues-demandees';
import { identiteDuVisiteur, type IdentiteDuVisiteur } from '@/lib/api/passerelle';
import { lisLeRefusServi } from '@/lib/api/refus-servi-cookie';
import { filEstOuvert, lisLaPlaceServie, type PlaceServie } from '@/lib/api/session-invitee-cookie';

import { entrerDansLeFil } from './entrer';
import { EcranDuFil } from './fil-serveur';

import {
  ENTRER_DANS_LE_FIL,
  INDISPONIBLE,
  PLACE_FERMEE,
  SORTIE_DE_LA_PLACE,
  avisDuLienMort,
  droitsDeLaPlace,
  etatDeRefus,
  etatDuVerdictServi,
  pointsDuLien,
  pseudoARemplir,
  type AvisDeLaPlace,
  type PointDuLien,
} from './etats';
import { languesProposees } from './langues';
import { quitterLaPlace } from './quitter';
import { rejoindre } from './rejoindre';
import { VueDeJonction, VueDeRefus, VueDesDroits } from './vue';

/**
 * `/chats/:lien` — UNE route, DEUX états (conception § 6.3 A puis B).
 *
 * Sans place : l'aperçu du lien et le formulaire d'entrée. Avec une place :
 * ce que cette place ouvre. C'est la même adresse parce que c'est la même chose
 * vue à deux moments — en fabriquer une seconde aurait donné deux URL pour un
 * seul lieu, et cassé le retour arrière du navigateur.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA PLACE D'ABORD, LE LIEN ENSUITE — ET CE N'EST PAS UN ORDRE D'APPELS
 * ────────────────────────────────────────────────────────────────────────────
 *
 * C'est une question d'AUTORITÉ. Une place et un lien sont deux objets qui ne
 * meurent pas ensemble : la seule condition de validité d'un jeton est
 * `Participant.isActive` (§ 6.1 point 1), tandis que l'aperçu du lien refuse
 * 410 `LINK_MAX_USES` dès que `currentUses >= maxUses` — et c'est le JOIN qui
 * incrémente ce compteur (`claimLinkUse`,
 * `services/gateway/src/routes/conversations/link-admission.ts`).
 *
 * Cette page interrogeait l'aperçu AVANT de regarder la place, et rendait le
 * refus dès que l'aperçu n'était pas « ouvert ». Sur un lien `maxUses: 1` —
 * l'invitation nominale à UNE personne — la redirection du join atterrissait
 * donc sur un 410 : le visiteur qui venait d'entrer avec succès lisait « ce lien
 * a atteint sa limite », et l'écran des droits n'était JAMAIS rendu sur ce lien.
 * Le même mécanisme éjectait tous les invités déjà entrés dès qu'un lien
 * expirait, était désactivé — ou, pire, dès que la passerelle ne répondait pas,
 * la place disparaissant alors de l'écran parce que le RÉSEAU avait toussé.
 * C'est le contraire exact des états B (« rend d'abord le CACHE »), F (le 401
 * s'arbitre par un refresh de contrôle) et G (« ce qui est déjà lu reste lu ;
 * AUCUNE redirection automatique »).
 *
 * L'ordre est donc : la place (cookie, zéro appel), puis SA porte
 * (`POST /anonymous/refresh`, qui prend le jeton et rend les droits à jour).
 * L'aperçu du lien n'est appelé que sur le chemin `join` — c'est-à-dire quand il
 * n'y a pas de place.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TOUT EST RÉSOLU SUR LE SERVEUR, ET CE N'EST PAS UN GOÛT D'ARCHITECTURE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * L'aperçu se lit SERVEUR-À-SERVEUR (§ 5.1) : la charge de
 * `GET /anonymous/link/:identifier` porte l'identité complète du créateur, et
 * la filtrer dans le navigateur ne corrigerait rien — elle aurait déjà traversé
 * le réseau, le cache HTTP et la charge Flight sérialisée du RSC, donc le HTML.
 * `lib/api/adhesion.ts` la projette avant que quoi que ce soit n'en sorte.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE LA PAGE NE FAIT PAS CONFIANCE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Ni au segment d'URL — `:lien` vaut indifféremment `linkId`, `identifier` ou
 * l'ObjectId (§ 6.1 point 2 bis), donc il n'indexe RIEN par lui-même : il ne
 * devient une clé que si une entrée écrite par ce serveur existe déjà sous ce
 * nom (`cleAttestee`, `lib/api/guest-session.ts`).
 *
 * Ni au COOKIE de la place pour ce qu'il affirme. Il n'est pas signé et reste
 * lisible par la page (§ « pourquoi pas `httpOnly` ») : les quatre droits qu'il
 * porte sont un CACHE, servi avant la réponse et gardé quand elle ne vient pas.
 * Ce qui fait autorité est le `refresh`, à chaque rendu — un droit retiré par
 * l'hôte disparaît de l'écran au rechargement suivant, et un droit qu'un script
 * se serait accordé dans le cookie ne survit pas à la première réponse.
 *
 * Ni aux paramètres de requête, et l'URL n'en porte plus qu'UN : `?pseudo=`, une
 * valeur de champ que le visiteur a sous les yeux. Le VERDICT d'un POST n'y
 * voyage plus — il était borné à une union fermée, donc inattaquable par
 * injection, et restait indistinguable d'un `?refus=` écrit par un tiers, alors
 * que l'écran RETIRE son formulaire sur un refus définitif : un lien vivant
 * pouvait être donné pour mort d'un paramètre ajouté à l'adresse partagée. Il
 * arrive désormais par un cookie que seul ce serveur peut écrire
 * (`lib/api/refus-servi-cookie.ts`), suggestion de pseudo comprise.
 */

/**
 * Aucun aperçu par contenu, et `noindex` — deux décisions, une seule raison.
 *
 * Le titre d'une invitation NOMME une conversation privée : le poser dans
 * `<title>` le grave dans l'historique du navigateur, dans les listes d'onglets
 * partagés et dans tout index qui passe. La carte que les robots lisent est
 * déjà composée par `/l/:token`, qui est le lien réellement partagé ; celle-ci
 * n'ajouterait rien et exposerait la même chose deux fois.
 *
 * Le § 8.3 y gagne au passage : `generateMetadata` aurait relu l'aperçu, donc
 * doublé l'appel de passerelle sur le chemin critique — `cache: 'no-store'`
 * interdit la mutualisation, et à raison (un lien fermé ne peut pas continuer
 * d'ouvrir).
 */
export const metadata: Metadata = {
  title: 'Rejoindre une conversation — Meeshy',
  description: 'Entrez dans la conversation qu’on a partagée avec vous, sans créer de compte.',
  robots: { index: false, follow: false },
};

type Parametres = {
  readonly params: Promise<{ readonly lien: string }>;
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
};

const valeur = (
  requete: Record<string, string | readonly string[] | undefined>,
  nom: string,
): string | null => {
  const brut = requete[nom];
  return typeof brut === 'string' && brut.trim() !== '' ? brut : null;
};

/**
 * L'AVIS que la relecture laisse à l'écran — et le silence qu'elle laisse quand
 * il n'y a rien à dire.
 *
 * `indisponible` ne peint RIEN : « erreur réseau ≠ 401 » (§ 7), et une bannière
 * d'incident au-dessus d'un écran parfaitement lisible ne dit au visiteur rien
 * qu'il puisse faire. C'est aussi ce qui rend vraie la première loi du § 6.3 B —
 * jamais de spinner, ni d'alerte, sur un cache non vide.
 */
const avisDe = (relecture: Revalidation): AvisDeLaPlace | null => {
  if (relecture.etat === 'close') return PLACE_FERMEE;
  if (relecture.etat === 'lien-mort') return avisDuLienMort(relecture.cause);
  return null;
};

/**
 * L'aperçu du lien, réduit au cas où il RESTE utile après le refresh : une place
 * dont personne — ni le cookie, ni la passerelle — n'a dit les droits. L'écran
 * retombe alors sur ce que le LIEN déclare, la seule chose qu'il sache. Un refus
 * ou un silence de cette porte ne retire rien : il rend `null`, et l'écran se
 * peint sans liste plutôt que de disparaître.
 */
const lienDeclare = async (
  segment: string,
  identite: IdentiteDuVisiteur,
): Promise<LienDadhesion | null> => {
  const apercu = await apercuDadhesion({ identifiant: segment, identite });
  return apercu.etat === 'ouvert' ? apercu.lien : null;
};

/**
 * LE TROISIÈME ÉTAT DE LA ROUTE — et pourquoi c'est un cookie qui le décide.
 *
 * `/chats/:lien` est UNE route dans TROIS états : `join` sans place, `rights`
 * avec une place fraîche, le FIL une fois qu'on y est entré. Le § 6.3 B interdit
 * d'en fabriquer une seconde adresse (« cassé le retour arrière du navigateur »),
 * et un paramètre de requête serait réinscriptible par quiconque a le lien
 * partagé — le défaut que le verdict de refus a déjà payé.
 *
 * Le marqueur vit donc avec la place (`lib/api/session-invitee-cookie.ts`), et
 * il meurt avec elle. Le fil exige de surcroît une ADRESSE : sans
 * `conversationId`, aucune porte de messages n'est appelable, et l'écran des
 * droits est alors la réponse juste — il dit ce que la place ouvre sans
 * prétendre ouvrir un fil qu'il ne sait pas joindre.
 */
const filDemande = async (place: PlaceServie): Promise<boolean> =>
  place.session.conversationId !== null && (await filEstOuvert(place.cle));

const EcranDesDroits = async ({
  segment,
  place,
  identite,
  lien,
}: {
  readonly segment: string;
  readonly place: PlaceServie;
  readonly identite: IdentiteDuVisiteur;
  /** Déjà en main quand l'arrivée a demandé l'aperçu — jamais redemandé pour rien. */
  readonly lien: LienDadhesion | null;
}) => {
  const relecture = await revalideLaPlace({ jeton: place.session.jeton, identite });
  const relue = relecture.etat === 'valide' ? relecture.place : null;

  /**
   * Ce que la passerelle vient de dire PRIME ; ce que la place portait SUIT. Un
   * champ manquant dans la réponse ne retire donc rien à l'écran, et un champ
   * servi corrige le cache sans qu'aucun autre site n'ait à le savoir.
   */
  const droits = relue?.droits ?? place.session.droits;
  const langue = relue?.langue ?? place.session.langue;
  const nom = relue?.nom ?? place.session.nom ?? lien?.nom ?? null;

  const declare =
    droits === null && lien === null ? await lienDeclare(segment, identite) : lien;

  /**
   * L'état F ne peint AUCUNE ligne : les quatre droits sont exactement ce qui
   * vient de devenir faux, et les afficher sous « votre place a été fermée »
   * serait la contradiction que cet écran a pour rôle d'éviter. L'état G les
   * garde — la place tient, c'est le lien qui est mort (§ 6.3 G).
   */
  const points: readonly PointDuLien[] | null =
    relecture.etat === 'close'
      ? null
      : droits !== null
        ? droitsDeLaPlace(droits, langue)
        : declare !== null
          ? pointsDuLien(declare)
          : null;

  /**
   * Le bouton porte le libellé de l'avis quand cet avis en propose un — c'est-à-
   * dire à l'état F, le seul où il y ait quelque chose à REPRENDRE. Sinon, le
   * geste nominal. Aucune des deux chaînes n'est écrite ici : elles vivent avec
   * le reste de la copie, et c'est l'avis qui décide laquelle s'applique.
   */
  const avis = avisDe(relecture);
  const reprise = avis?.reprise ?? null;

  /**
   * LE CTA de la cible, servi seulement quand il OUVRE quelque chose.
   *
   * Deux conditions, et chacune évite un contrôle inerte (loi 4) : la place doit
   * tenir — une place fermée n'ouvre aucun fil, et l'écran propose alors sa
   * reprise —, et la conversation doit avoir été NOMMÉE. Sans `conversationId`,
   * aucune porte de messages n'est appelable : le bouton mènerait à un écran qui
   * ne saurait rien demander.
   *
   * Un lien MORT (état G) le garde : « ce qui est déjà lu reste lu », et c'est
   * précisément le fil qu'on veut pouvoir rouvrir.
   */
  const conversationId = relue?.conversationId ?? place.session.conversationId;
  const entree =
    relecture.etat === 'close' || conversationId === null
      ? null
      : { libelle: ENTRER_DANS_LE_FIL, action: entrerDansLeFil.bind(null, segment) };

  return (
    <VueDesDroits
      ecran={{
        pseudo: place.session.pseudo,
        nom,
        points,
        avis,
        entree,
        sortie: {
          libelle: reprise ?? SORTIE_DE_LA_PLACE,
          primaire: reprise !== null,
          action: quitterLaPlace.bind(null, segment, reprise === null ? null : place.session.pseudo),
        },
      }}
    />
  );
};

export default async function PageDeJonction({ params, searchParams }: Parametres) {
  const { lien: segment } = await params;
  const requete = await searchParams;
  const entetes = await headers();
  const identite = identiteDuVisiteur(entetes);

  /** Zéro appel : une place se retrouve dans les cookies, jamais dans le réseau. */
  const place = await lisLaPlaceServie(segment);
  if (place !== null) {
    return (await filDemande(place)) ? (
      <EcranDuFil
        segment={segment}
        place={place}
        identite={identite}
        langueDuDocument={DOCUMENT_LANGUAGE}
        localeDeLAppareil={langueDemandee(entetes.get('accept-language')).code}
      />
    ) : (
      <EcranDesDroits segment={segment} place={place} identite={identite} lien={null} />
    );
  }

  const apercu = await apercuDadhesion({ identifiant: segment, identite });

  /**
   * L'inconnu, le supprimé et l'invisible rendent le MÊME 404 (§ 5.1, patron
   * `resolveConsumptionTarget`) : un état distinct pour « ce lien existait »
   * serait un oracle offert à qui balaie l'espace des jetons.
   */
  if (apercu.etat === 'introuvable') notFound();

  if (apercu.etat !== 'ouvert') {
    return (
      <VueDeRefus
        etat={apercu.etat === 'refus' ? etatDeRefus(apercu.refus.cause) : INDISPONIBLE}
        retour={`/chats/${encodeURIComponent(segment)}`}
      />
    );
  }

  const { lien } = apercu;

  /**
   * L'arrivée par une forme que le cookie ne nommait pas — un lien PARTAGÉ dont
   * le segment n'est ni la clé canonique ni un alias connu. L'aperçu vient de
   * normaliser les trois formes ; la place se retrouve sous son vrai nom.
   */
  const placeCanonique = await lisLaPlaceServie(lien.cle);
  if (placeCanonique !== null) {
    return (
      <EcranDesDroits segment={lien.cle} place={placeCanonique} identite={identite} lien={lien} />
    );
  }

  /**
   * Le verdict est indexé par le SEGMENT — c'est ce que le POST avait sous la
   * main —, jamais par la clé canonique : au moment d'un refus, il n'y a
   * précisément pas de place, donc pas de clé.
   */
  const verdict = await lisLeRefusServi(segment);
  const proposition = languesProposees({ lien, acceptLanguage: entetes.get('accept-language') });

  return (
    <VueDeJonction
      ecran={{
        lien,
        proposition,
        prerempli: {
          pseudo: pseudoARemplir({
            suggestion: verdict?.suggestion ?? null,
            tape: valeur(requete, 'pseudo'),
          }),
          langue: proposition.choisie,
        },
        refus: etatDuVerdictServi(verdict),
        action: rejoindre.bind(null, segment),
        retour: `/chats/${encodeURIComponent(lien.cle)}`,
      }}
    />
  );
}
