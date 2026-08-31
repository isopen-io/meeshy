import {
  cleDeLien,
  type CleDeLien,
  type DroitsDeLaPlace,
  type SessionInvitee,
} from './guest-session';
import {
  baseDeLaPasserelle,
  champ,
  cheminDeLaPasserelle,
  codeDeRefus,
  donneeDe,
  enTetesDuVisiteur,
  entier,
  instant,
  listeDeTextes,
  lisLaCharge,
  objet,
  recupere,
  texte,
  type IdentiteDuVisiteur,
  type Recuperateur,
} from './passerelle';

/**
 * L'ENTRÉE par un lien de partage — ce que la passerelle dit d'un lien avant
 * qu'on y entre, et ce qu'elle répond quand on y entre (conception § 5.1,
 * § 6.3 A).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUELLE PORTE, ET POURQUOI CELLE-LÀ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * **L'APERÇU passe par `GET /anonymous/link/:identifier`.** L'autre candidat,
 * `GET /links/:identifier`, sert quatre champs que celui-ci ne sert pas — les
 * droits (`allowViewHistory`, `allowAnonymousMessages`, `allowAnonymousFiles`,
 * `allowAnonymousImages`), ceux-là mêmes que la planche dessine dans
 * l'accordéon de `join`. Il est pourtant INUTILISABLE ici, et le fait est
 * mesuré : pour un appelant sans compte, il pose `canPreview = isActive &&
 * allowViewHistory` puis rend **403** si `canPreview` est faux
 * (`services/gateway/src/routes/links/retrieval.ts`). Un lien parfaitement
 * valide dont l'hôte a simplement masqué l'historique — le cas NOMINAL d'une
 * invitation — rendrait donc l'écran de jonction inatteignable. Il charge de
 * surcroît les messages et la liste des participants, c'est-à-dire des
 * identités, pour en projeter quatre booléens.
 *
 * **Conséquence à dire à voix haute plutôt qu'à masquer** : les quatre droits de
 * la planche ne sont servis par AUCUNE porte d'aperçu aujourd'hui. Ils sont
 * servis par le 201 du join — c'est-à-dire APRÈS l'entrée, ce qui est exactement
 * l'écran `rights` de la planche (« Bienvenue Tolu ! · Voilà ce que ce lien vous
 * ouvre »). L'accordéon d'AVANT l'entrée porte donc ce que la porte d'aperçu
 * sait vraiment : ce que le lien EXIGE, son échéance, ses places. Même
 * disposition, même hiérarchie, mêmes gestes ; une copie qui ne ment pas.
 * Régime 3 du § 5.2 — la capacité manquante n'est pas exposée, et l'écart est
 * déclaré.
 *
 * **Combien de droits, et sous quel nom : mesuré, pas repris.** Le § 6.3 A du
 * document de conception annonce un 201 `{ sessionToken, participant, id }` et
 * la note de l'écran parlait de « huit droits (`entry.rights`) ». Les deux
 * décrivent des portes différentes : `entry.rights` est la forme de la porte
 * CANONIQUE `POST /links/:key/members` (huit droits, `resolveEntryRights`),
 * quand l'ALIAS que ce module appelle sert `participantConversationPayload` —
 * QUATRE booléens, `participant.canSendMessages` / `canSendFiles` /
 * `canSendImages` et `conversation.allowViewHistory`. Ce sont exactement les
 * quatre que la matrice nomme, et ce sont ceux que `droitsDepuis` lit.
 *
 * **LE JOIN passe par `POST /anonymous/join/:linkId`**, comme le § 5.1 le
 * prescrit — jamais `POST /conversations/join/:linkId`, qui ignore `maxUses`,
 * `maxConcurrentUsers`, `allowedIpRanges` et `requireAccount`. Deux faits que le
 * document de conception ne pouvait pas connaître et qu'il faut écrire ici :
 *
 *   1. cette porte est désormais un ALIAS DÉPRÉCIÉ (`depuis: 2026-08-30`) de
 *      `POST /links/:key/members`, la porte canonique de #4167 ; les deux
 *      délèguent à `performLinkJoin`, donc à la MÊME loi d'admission
 *      (`admitLinkEntry`) — le § 5.1 reste juste sur ce qui compte ;
 *   2. la porte canonique ne sert PAS `linkId` dans son 201 (elle rend
 *      `conversationId` / `participantId` / `entry`), là où l'alias le sert. Or
 *      `CleDeLien` — le nom canonique d'une place, § 6.1 point 2 bis — n'a que
 *      deux producteurs, et c'est l'un des deux. La migration n'est donc pas le
 *      « diff d'une ligne » du régime 1 : elle demande que le canonique serve la
 *      clé, ou que l'appelant la relise. Issue compagnon à ouvrir.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE JOIN POSTE SUR LE SEGMENT D'URL, ET LIT LA CLÉ SUR SON 201
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le segment d'URL `/chats/:lien` n'est PAS une clé de lien : la passerelle
 * accepte indifféremment `linkId`, `identifier` et l'ObjectId pour le même lien
 * physique (`resolveShareLinkId`, `routes/anonymous.ts` et
 * `routes/conversations/link-admission.ts`). Deux arrivées par deux formes
 * rangeraient DEUX entrées pour UNE place, `lireSession` rendrait `null`,
 * l'écran referait un `join`, et le § 6.1 point 3 se paierait en entier —
 * identité neuve, pseudo suffixé, trois compteurs incrémentés. La clé canonique
 * vient donc d'une RÉPONSE du serveur, toujours ; c'est ce que le type marqué
 * `CleDeLien` rend impossible à contourner.
 *
 * **Cette réponse est le 201 du join lui-même**, et pas un aperçu tiré avant
 * lui. `POST /anonymous/join/:linkId` sert `linkId: result.shareLink.linkId`
 * dans sa charge (`routes/anonymous.ts`) — c'est l'un des deux producteurs que
 * le doc-comment de `cleDeLien` nomme. Poster sur le SEGMENT et nommer la place
 * avec ce que le 201 rend tient donc la même propriété pour un aller-retour de
 * moins : la passerelle normalise les trois formes d'elle-même, et rien n'a
 * jamais eu besoin d'être normalisé côté client pour POSTER.
 *
 * Ce que l'aller-retour retiré coûtait, sur le chemin le plus chaud du rôle
 * premier : le passage nominal complet payait QUATRE appels de passerelle pour
 * une jonction (GET de la page = 1 aperçu · POST = 1 aperçu + 1 join · GET
 * redirigé = 1 aperçu), tous en `cache: 'no-store'` et chacun avec un délai de
 * 2 500 ms — jusqu'à cinq secondes avant qu'un refus réseau ne s'affiche. Il
 * n'achetait rien : le seul cas qu'un aperçu pré-vol couvrait — un lien clos —
 * est de toute façon refusé par le POST, avec le même état peint. « Un
 * aller-retour dont la réponse est connue avant de partir est une seconde de 3G
 * prise au visiteur » vaut aussi pour celui-là.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI N'ENTRE PAS DANS CE QUE LE MODULE REND
 * ────────────────────────────────────────────────────────────────────────────
 *
 * L'identité du créateur. `GET /anonymous/link/:identifier` sert `creator`
 * ENTIER — id, pseudo, nom, prénom, avatar — et la planche le DESSINE
 * (« Ibrahim Bello · vous a envoyé ce lien »). Le § 5.1 le classe en fuite et
 * tranche : « l'identité n'est ni affichée ni transportée ». La projection se
 * fait donc ICI, avant que quoi que ce soit n'entre dans le HTML ou dans la
 * charge Flight sérialisée du RSC — filtrer chez le consommateur ne corrigerait
 * rien, la charge ayant déjà traversé le réseau et le cache.
 */

export const CHEMIN_APERCU = (identifiant: string): string =>
  cheminDeLaPasserelle(`/anonymous/link/${encodeURIComponent(identifiant)}`);

const CHEMIN_JOIN = (identifiant: string): string =>
  cheminDeLaPasserelle(`/anonymous/join/${encodeURIComponent(identifiant)}`);

/** La porte de la PLACE — celle qui répond au JETON, jamais au lien (§ 6.3 B, F, G). */
const CHEMIN_REFRESH = cheminDeLaPasserelle('/anonymous/refresh');

/** Le départ VOLONTAIRE, et lui seul : `endGuestSession` est idempotent (#4167). */
const CHEMIN_LEAVE = cheminDeLaPasserelle('/anonymous/leave');

/**
 * Ce que l'écran rend d'un lien avant qu'on y entre — et rien de plus.
 *
 * Chaque champ répond à une question que l'écran pose vraiment. Aucun n'est là
 * « au cas où » : un champ inutilisé est une identité qui voyage.
 */
export type LienDadhesion = {
  /** Le nom CANONIQUE de la place — ce qui indexe la session, jamais le segment d'URL. */
  readonly cle: CleDeLien;
  readonly nom: string;
  /** Le mot de l'hôte, tel qu'il l'a écrit. `null` quand il n'en a pas laissé. */
  readonly invitation: string | null;
  readonly exigePseudo: boolean;
  readonly exigeEmail: boolean;
  readonly exigeNaissance: boolean;
  /** `requireAccount` : le lien refuse les visiteurs sans compte (403 à l'entrée). */
  readonly exigeCompte: boolean;
  readonly echeance: number | null;
  /** `maxUses − currentUses`, jamais négatif — `null` quand le lien ne plafonne rien. */
  readonly placesRestantes: number | null;
  /** `allowedLanguages` : vide = toutes. */
  readonly languesDuLien: readonly string[];
  /** Les langues déjà parlées dans la conversation — ce que le visiteur va lire traduit. */
  readonly languesParlees: readonly string[];
};

/**
 * POURQUOI un visiteur n'entre pas — l'union EXHAUSTIVE des états que l'écran
 * doit savoir peindre.
 *
 * Elle est écrite en VOCABULAIRE D'ÉCRAN, pas en codes de passerelle, et c'est
 * délibéré : la passerelle en a deux jeux vivants pour la même chose
 * (`LINK_INACTIVE` à l'aperçu / `LINK_DEACTIVATED` au refresh, `LINK_MAX_USES`
 * à l'aperçu / `LINK_EXHAUSTED` à l'admission depuis #4167, `REQUIRES_ACCOUNT` /
 * `ACCOUNT_REQUIRED`, `COUNTRY_NOT_ALLOWED` / `REGION_NOT_ALLOWED`). La
 * traduction se fait ICI, au point d'entrée — jamais dans la copie, qui
 * porterait alors deux libellés pour un seul état.
 */
export type CauseDeRefus =
  | 'compte-requis'
  | 'zone-refusee'
  | 'langue-refusee'
  | 'banni'
  | 'lien-desactive'
  | 'lien-expire'
  | 'conversation-terminee'
  | 'lien-epuise'
  | 'champ-requis'
  | 'pseudo-pris'
  | 'introuvable'
  | 'indetermine';

/** L'ordre est celui de l'écran : ce qui se corrige d'abord, ce qui ne se corrige pas ensuite. */
export const CAUSES_DE_REFUS: readonly CauseDeRefus[] = [
  'champ-requis',
  'pseudo-pris',
  'langue-refusee',
  'compte-requis',
  'zone-refusee',
  'banni',
  'lien-epuise',
  'lien-expire',
  'lien-desactive',
  'conversation-terminee',
  'introuvable',
  'indetermine',
];

export type Refus = {
  readonly cause: CauseDeRefus;
  /** Le pseudo de rechange que la passerelle propose sur un 409 — jamais fabriqué ici. */
  readonly suggestion: string | null;
};

export type ApercuDuLien =
  | { readonly etat: 'ouvert'; readonly lien: LienDadhesion }
  | { readonly etat: 'refus'; readonly refus: Refus }
  | { readonly etat: 'introuvable' }
  | { readonly etat: 'indisponible' };

export type Demande = {
  readonly pseudo: string;
  readonly langue: string;
  readonly email: string;
  readonly naissance: string;
};

export type Adhesion =
  | { readonly etat: 'admis'; readonly cle: CleDeLien; readonly session: SessionInvitee }
  | { readonly etat: 'refus'; readonly refus: Refus }
  | { readonly etat: 'introuvable' }
  | { readonly etat: 'indisponible' }
  | { readonly etat: 'indetermine' };

/**
 * Les deux vocabulaires de la passerelle, joints à l'état que l'écran peint.
 *
 * `REQUIRES_ACCOUNT` et `LINK_MAX_USES` sont ceux que le critère de fin nomme ;
 * `ACCOUNT_REQUIRED` et `LINK_EXHAUSTED` sont ceux que `admitLinkEntry` sert
 * depuis #4167. Les deux sont ici parce que les deux sont vrais : la porte
 * d'aperçu parle encore le premier, la porte d'admission parle le second, et un
 * écran qui n'en connaîtrait qu'un se tairait la moitié du temps.
 */
const CAUSE_PAR_CODE: Readonly<Record<string, CauseDeRefus>> = {
  REQUIRES_ACCOUNT: 'compte-requis',
  ACCOUNT_REQUIRED: 'compte-requis',
  COUNTRY_NOT_ALLOWED: 'zone-refusee',
  REGION_NOT_ALLOWED: 'zone-refusee',
  IP_NOT_ALLOWED: 'zone-refusee',
  LANGUAGE_NOT_ALLOWED: 'langue-refusee',
  BANNED: 'banni',
  LINK_INACTIVE: 'lien-desactive',
  LINK_DEACTIVATED: 'lien-desactive',
  LINK_EXPIRED: 'lien-expire',
  CONVERSATION_CLOSED: 'conversation-terminee',
  LINK_MAX_USES: 'lien-epuise',
  LINK_EXHAUSTED: 'lien-epuise',
  MAX_CONCURRENT_USERS: 'lien-epuise',
  USERNAME_TAKEN_IN_CONVERSATION: 'pseudo-pris',
};

/**
 * Le repli par STATUT, quand la passerelle refuse sans nommer son code.
 *
 * Il ne devine rien : un 400 est un champ, un 429 est une capacité, un 403 sans
 * code n'est qu'un refus. Sans lui, une réponse mal formée sortirait en
 * `indetermine` — et l'écran dirait « quelque chose s'est mal passé » là où le
 * statut HTTP portait déjà la moitié de la réponse.
 */
const CAUSE_PAR_STATUT: Readonly<Record<number, CauseDeRefus>> = {
  400: 'champ-requis',
  404: 'introuvable',
  429: 'lien-epuise',
};

const refusDe = (statut: number, corps: object | null): Refus => {
  const code = corps === null ? null : codeDeRefus(corps);
  const nomme = code === null ? undefined : CAUSE_PAR_CODE[code];

  return {
    cause: nomme ?? CAUSE_PAR_STATUT[statut] ?? 'indetermine',
    suggestion: corps === null ? null : texte(champ(corps, 'suggestedNickname')),
  };
};

/**
 * La CAUSE seule, offerte aux autres portes de la place (`lib/api/messagerie.ts`,
 * `lib/realtime/sync/delta-client.ts`).
 *
 * Le 410 se produit sur TOUTES ces portes — l'aperçu, le refresh, la lecture du
 * fil, l'envoi — et il porte à chaque fois le même vocabulaire de codes. Les
 * laisser retraduire chez chaque appelant ferait autant de tables que de
 * portes, et un code ajouté côté passerelle n'en corrigerait qu'une.
 */
export const causeDuRefus = (statut: number, corps: object | null): CauseDeRefus =>
  refusDe(statut, corps).cause;

const placesRestantes = (donnee: object): number | null => {
  const plafond = entier(champ(donnee, 'maxUses'));
  if (plafond === null) return null;
  return Math.max(0, plafond - (entier(champ(donnee, 'currentUses')) ?? 0));
};

const lienDepuis = (donnee: object): LienDadhesion | null => {
  const cle = cleDeLien({ linkId: champ(donnee, 'linkId') });
  if (cle === null) return null;

  const conversation = objet(champ(donnee, 'conversation'));
  const nom =
    texte(champ(donnee, 'name')) ?? (conversation === null ? null : texte(champ(conversation, 'title')));
  if (nom === null) return null;

  const stats = objet(champ(donnee, 'stats'));

  return {
    cle,
    nom,
    invitation:
      texte(champ(donnee, 'description')) ??
      (conversation === null ? null : texte(champ(conversation, 'description'))),
    exigePseudo: champ(donnee, 'requireNickname') === true,
    exigeEmail: champ(donnee, 'requireEmail') === true,
    exigeNaissance: champ(donnee, 'requireBirthday') === true,
    exigeCompte: champ(donnee, 'requireAccount') === true,
    echeance: instant(champ(donnee, 'expiresAt')),
    placesRestantes: placesRestantes(donnee),
    languesDuLien: listeDeTextes(champ(donnee, 'allowedLanguages')),
    languesParlees: stats === null ? [] : listeDeTextes(champ(stats, 'spokenLanguages')),
  };
};

export const apercuDadhesion = async ({
  identifiant,
  identite,
  base,
  recuperer,
}: {
  readonly identifiant: string;
  /** L'identité RÉSEAU du visiteur — voir `IdentiteDuVisiteur` (`passerelle.ts`). */
  readonly identite?: IdentiteDuVisiteur;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<ApercuDuLien> => {
  const reponse = await recupere(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_APERCU(identifiant)}`,
    { headers: { accept: 'application/json', ...enTetesDuVisiteur(identite) } },
    recuperer,
  ).catch(() => null);

  if (reponse === null) return { etat: 'indisponible' };
  if (reponse.status === 404) return { etat: 'introuvable' };

  if (!reponse.ok) {
    if (reponse.status >= 500) return { etat: 'indisponible' };
    return { etat: 'refus', refus: refusDe(reponse.status, await lisLaCharge(reponse)) };
  }

  const donnee = await donneeDe(reponse);
  const lien = donnee === null ? null : lienDepuis(donnee);

  return lien === null ? { etat: 'indisponible' } : { etat: 'ouvert', lien };
};

/**
 * Ce qui part au serveur — et ce qui n'y part PAS.
 *
 * Un champ vide n'est pas envoyé vide : `joinAnonymousSchema` accepte `''` pour
 * `email` et `birthday`, mais rien n'oblige la porte suivante à le faire, et une
 * chaîne vide stockée est une donnée fausse (« cette personne a donné une date
 * de naissance ») là où l'absence dit la vérité.
 *
 * `firstName` et `lastName` sont EXIGÉS par le schéma de cette porte
 * (`min(1)`), alors que l'écran ne demande qu'UN pseudo — c'est le seul endroit
 * où l'alias déprécié coûte quelque chose de visible, la porte canonique
 * (`POST /links/:key/members`) ne prenant qu'un `nickname`. Le pseudo est donc
 * servi aux trois champs plutôt qu'inventer un patronyme : `username` est celui
 * que la passerelle retient (`requestedUsername`), et `displayName` en dérive.
 */
const corpsDeLaDemande = (demande: Demande): Readonly<Record<string, string>> => {
  const pseudo = demande.pseudo.trim();
  const email = demande.email.trim();
  const naissance = demande.naissance.trim();

  return {
    firstName: pseudo,
    lastName: pseudo,
    username: pseudo,
    language: demande.langue.trim().toLowerCase(),
    ...(email === '' ? {} : { email }),
    ...(naissance === '' ? {} : { birthday: new Date(naissance).toISOString() }),
  };
};

/**
 * CE QUE LA PLACE OUVRE — les quatre droits, lus sur la réponse qui les sert.
 *
 * Le doc-tête de ce module dit que les quatre droits de la planche ne sont
 * servis par AUCUNE porte d'APERÇU : c'est toujours vrai, et c'est pourquoi ils
 * arrivent ICI, sur la réponse d'ADMISSION. `participantConversationPayload`
 * (`services/gateway/src/routes/conversations/link-admission.ts`) les pose
 * exactement à ces quatre places, et il sert les DEUX réponses que l'écran lira
 * — le 201 du join et le 200 de `POST /anonymous/refresh` (§ 6.3 B : « les
 * droits sont RE-LUS de la réponse : l'hôte a pu les changer »). Cette fonction
 * est donc écrite pour la CHARGE, pas pour l'appel : le battement la réutilisera
 * telle quelle plutôt que d'en écrire une jumelle.
 *
 * Elle rend `null` dès qu'UN des quatre manque, et la nuance est le sujet :
 * `false` dit « ce lien ne l'ouvre pas », `null` dit « la porte ne l'a pas
 * dit ». Compléter une réponse partielle par `false` refuserait à l'écran des
 * droits que le visiteur a réellement — un mensonge dans le sens restrictif
 * reste un mensonge. Le cas n'est pas théorique : la porte CANONIQUE
 * (`POST /links/:key/members`) sert ses droits sous `entry.rights`, une AUTRE
 * forme, et le jour où l'appel y migrera c'est ici — et nulle part ailleurs —
 * que la lecture s'élargira.
 */
export const droitsDepuis = (donnee: object): DroitsDeLaPlace | null => {
  const participant = objet(champ(donnee, 'participant'));
  const conversation = objet(champ(donnee, 'conversation'));
  if (participant === null || conversation === null) return null;

  const booleen = (source: object, nom: string): boolean | null => {
    const valeur = champ(source, nom);
    return typeof valeur === 'boolean' ? valeur : null;
  };

  const ecrire = booleen(participant, 'canSendMessages');
  const fichiers = booleen(participant, 'canSendFiles');
  const images = booleen(participant, 'canSendImages');
  const historique = booleen(conversation, 'allowViewHistory');

  return ecrire === null || fichiers === null || images === null || historique === null
    ? null
    : { ecrire, fichiers, images, historique };
};

/**
 * CE QUE LA PLACE SAIT D'ELLE-MÊME — relu de la charge, pas de l'appel.
 *
 * `participantConversationPayload` sert les MÊMES champs au 201 du join et au
 * 200 du refresh ; cette projection est donc écrite pour la CHARGE, comme
 * `droitsDepuis`, et les deux portes la partagent. Ce qu'elle ajoute aux quatre
 * droits, ce sont les deux valeurs que le parseur JETAIT :
 *
 *   • `participant.language` — la langue que le visiteur vient de DÉCLARER au
 *     formulaire, normalisée et persistée par la passerelle. C'est le rang 1 du
 *     Prisme d'un lecteur anonyme, et il n'existait nulle part côté client après
 *     l'entrée : l'écran qui confirme l'entrée est aussi celui qui parle de
 *     traduction, et il ne pouvait rien en dire ;
 *   • `conversation.title` — le nom de la conversation. Sans lui, l'écran des
 *     droits dépend de l'APERÇU DU LIEN pour se peindre, c'est-à-dire du réseau,
 *     sur le chemin même où le réseau peut manquer.
 *
 * Chaque champ rend `null` quand la charge ne le porte pas — jamais une chaîne
 * vide, qui se peindrait comme un nom.
 */
export type PlaceRelue = {
  readonly droits: DroitsDeLaPlace | null;
  readonly langue: string | null;
  readonly nom: string | null;
  /**
   * L'identifiant de la CONVERSATION — sans lui, le fil n'a pas d'adresse.
   *
   * Il n'est PAS déductible de la clé du lien : `GET /conversations/:id/messages`
   * prend l'identifiant de la conversation, que seule la réponse de la place
   * nomme (`conversation.id`). Le déduire du segment d'URL ferait appeler la
   * porte du fil avec une clé de LIEN — un 404 sur un fil parfaitement vivant.
   */
  readonly conversationId: string | null;
};

export const placeRelue = (donnee: object): PlaceRelue => {
  const participant = objet(champ(donnee, 'participant'));
  const conversation = objet(champ(donnee, 'conversation'));

  return {
    droits: droitsDepuis(donnee),
    langue: participant === null ? null : texte(champ(participant, 'language')),
    nom: conversation === null ? null : texte(champ(conversation, 'title')),
    conversationId: conversation === null ? null : texte(champ(conversation, 'id')),
  };
};

const sessionDepuis = (donnee: object, pseudo: string): SessionInvitee | null => {
  const jeton = texte(champ(donnee, 'sessionToken'));
  const participant = objet(champ(donnee, 'participant'));
  const participantId = participant === null ? null : texte(champ(participant, 'id'));
  const relue = placeRelue(donnee);

  return jeton === null || participantId === null
    ? null
    : {
        jeton,
        participantId,
        pseudo,
        langue: relue.langue,
        nom: relue.nom,
        droits: relue.droits,
        conversationId: relue.conversationId,
      };
};

/**
 * L'ÉTAT D'UNE PLACE, DEMANDÉ À LA PORTE QUI LA CONNAÎT (§ 6.3 B, F, G).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS L'APERÇU DU LIEN QUI RÉPOND
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Une place et un lien sont deux objets, et ils ne meurent pas ensemble. La
 * seule condition de validité d'un jeton est `Participant.isActive`
 * (§ 6.1 point 1) ; l'aperçu du lien, lui, refuse 410 `LINK_MAX_USES` dès que
 * `currentUses >= maxUses` (`routes/anonymous.ts`) — et c'est le JOIN qui
 * incrémente ce compteur (`claimLinkUse`, `routes/conversations/link-admission.ts`).
 * Sur un lien à UNE place, l'aperçu refuse donc EXACTEMENT à partir du moment
 * où la place a été prise avec succès : conditionner l'écran d'un invité entré à
 * la réponse de cette porte-là revient à l'éjecter à cause de sa propre entrée.
 * `POST /anonymous/refresh` est la porte de la PLACE : elle prend le jeton, et
 * elle rend `participantConversationPayload` — les quatre droits, la langue, le
 * titre.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TROIS RÉPONSES, TROIS ÉTATS, ET LE QUATRIÈME QUI N'EN EST PAS UN
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   • 200 ⇒ `valide`, et les droits sont RE-LUS (§ 6.3 B : « l'hôte a pu les
 *     changer ») ;
 *   • 401 ⇒ `close` — l'état F, la SEULE cause réelle de perte de place. Cet
 *     appel EST le refresh de contrôle que le § 6.3 F prescrit : il n'y a pas
 *     lieu d'en faire un second pour arbitrer le 401 d'un appel qui est déjà
 *     celui-là ;
 *   • 410 ⇒ `lien-mort` — l'état G. La place n'est pas perdue : ce qui est lu
 *     reste lu, et l'écran nomme la raison sans rediriger ;
 *   • TOUT LE RESTE ⇒ `indisponible`. Un statut qu'on ne sait pas lire, un 500,
 *     un tunnel coupé : « erreur réseau ≠ 401 » (§ 7). On ne ferme JAMAIS une
 *     place sur un silence — c'est le chemin par lequel une coupure effacerait
 *     une session valide.
 */
export type Revalidation =
  | { readonly etat: 'valide'; readonly place: PlaceRelue }
  | { readonly etat: 'close' }
  | { readonly etat: 'lien-mort'; readonly cause: CauseDeRefus }
  | { readonly etat: 'indisponible' };

export const revalideLaPlace = async ({
  jeton,
  identite,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly identite?: IdentiteDuVisiteur;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Revalidation> => {
  const reponse = await recupere(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_REFRESH}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...enTetesDuVisiteur(identite),
      },
      body: JSON.stringify({ sessionToken: jeton }),
    },
    recuperer,
  ).catch(() => null);

  if (reponse === null) return { etat: 'indisponible' };
  if (reponse.status === 401) return { etat: 'close' };

  if (reponse.status === 410) {
    return { etat: 'lien-mort', cause: refusDe(reponse.status, await lisLaCharge(reponse)).cause };
  }

  if (!reponse.ok) return { etat: 'indisponible' };

  const donnee = await donneeDe(reponse);
  return donnee === null ? { etat: 'indisponible' } : { etat: 'valide', place: placeRelue(donnee) };
};

/**
 * LE DÉPART VOLONTAIRE — le seul appel mutant qu'un invité déclenche lui-même.
 *
 * Il ne rend RIEN, et c'est délibéré : l'écran a déjà décidé de fermer cette
 * place quand il l'appelle, et le refus de la passerelle (404 sur une session
 * déjà close) ne doit pas retenir le cookie du visiteur — sinon un jeton mort
 * deviendrait ineffaçable côté client. Le § 6.3 H interdit d'appeler cette porte
 * à la fermeture d'un onglet ; ce n'est pas ce qui se passe ici : c'est un
 * BOUTON, et un bouton est un geste.
 */
export const quitteLaPlace = async ({
  jeton,
  identite,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly identite?: IdentiteDuVisiteur;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<void> => {
  await recupere(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_LEAVE}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...enTetesDuVisiteur(identite),
      },
      body: JSON.stringify({ sessionToken: jeton }),
    },
    recuperer,
  ).catch(() => null);
};

/**
 * L'entrée. Deux refus ne coûtent RIEN au réseau — pseudo vide, date illisible
 * — et c'est voulu : un aller-retour dont la réponse est connue avant de partir
 * est une seconde de 3G prise au visiteur.
 *
 * Un 201 qui ne NOMME pas la place sort en `indetermine` plutôt qu'en `admis` :
 * sans `linkId`, le cookie de la place n'a pas de nom canonique (§ 6.1 point
 * 2 bis) et la poser sous le segment d'URL est exactement la double entrée que
 * `CleDeLien` interdit. Le participant existe alors côté serveur sans que le
 * client sache le retrouver — l'écran le dit (« la conversation n'a pas dit
 * pourquoi ») au lieu d'ouvrir une place qu'il perdrait au rechargement.
 */
export const rejoindreLeLien = async ({
  identifiant,
  demande,
  identite,
  base,
  recuperer,
}: {
  readonly identifiant: string;
  readonly demande: Demande;
  /** L'identité RÉSEAU du visiteur — voir `IdentiteDuVisiteur` (`passerelle.ts`). */
  readonly identite?: IdentiteDuVisiteur;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Adhesion> => {
  const pseudo = demande.pseudo.trim();
  if (pseudo === '') return { etat: 'refus', refus: { cause: 'champ-requis', suggestion: null } };

  const naissance = demande.naissance.trim();
  if (naissance !== '' && Number.isNaN(Date.parse(naissance))) {
    return { etat: 'refus', refus: { cause: 'champ-requis', suggestion: null } };
  }

  const reponse = await recupere(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_JOIN(identifiant)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...enTetesDuVisiteur(identite),
      },
      body: JSON.stringify(corpsDeLaDemande({ ...demande, pseudo })),
    },
    recuperer,
  ).catch(() => null);

  if (reponse === null) return { etat: 'indisponible' };
  if (reponse.status === 404) return { etat: 'introuvable' };

  if (!reponse.ok) {
    if (reponse.status >= 500) return { etat: 'indisponible' };
    return { etat: 'refus', refus: refusDe(reponse.status, await lisLaCharge(reponse)) };
  }

  const donnee = await donneeDe(reponse);
  const cle = donnee === null ? null : cleDeLien({ linkId: champ(donnee, 'linkId') });
  const session = donnee === null ? null : sessionDepuis(donnee, pseudo);

  return cle === null || session === null
    ? { etat: 'indetermine' }
    : { etat: 'admis', cle, session };
};
