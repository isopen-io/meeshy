/**
 * Ce qu'un participant a le droit de faire, résolu une seule fois.
 *
 * Deux couches, et leur ordre est le sujet :
 *
 * - `Participant.permissions` est un INSTANTANÉ pris au join, recopié depuis le
 *   lien de partage emprunté (`routes/anonymous.ts`). Il ne suit pas le lien :
 *   un hôte qui décoche `allowAnonymousFiles` après coup ne retire rien à qui
 *   est déjà entré.
 * - `anonymousSession.rights` est un DELTA posé par l'hôte sur CE participant.
 *   Un droit qu'il ne nomme pas n'est pas « faux », il est « non dit » : il
 *   suit l'instantané. C'est ce qui permet d'ouvrir un seul droit sans geler
 *   les six autres à leur valeur du moment.
 *
 * `??` porte exactement cette sémantique — `false` est une réponse, `undefined`
 * une abstention. Ne jamais le remplacer par `||`, qui confondrait les deux et
 * rendrait tout droit fermé par surcharge impossible à distinguer d'un silence.
 *
 * Extrait de `middleware/auth.ts`, qui en était le seul porteur. La fiche de
 * participant et le plancher d'historique posent la même question : trois
 * lecteurs de la même règle divergeraient.
 */

import type { ParticipantPermissions } from '@meeshy/shared/types/participant';

/**
 * Le delta que l'hôte pose sur un participant. Tout champ est facultatif.
 *
 * `null` y est admis autant qu'`undefined` : sur le connecteur MongoDB, un
 * `Boolean?` de type composite se relit `null`, jamais `undefined`. Les deux
 * disent la même chose — « non dit » — et `??` les traite identiquement. Écrire
 * `Partial<ParticipantPermissions>` ici ferait mentir la signature sur ce que
 * Prisma rend réellement.
 */
export type ParticipantRightsOverride = {
  readonly [K in keyof ParticipantPermissions]?: boolean | null;
};

/** Ce qu'il faut d'une ligne `Participant` pour répondre à la question. */
export type ParticipantRightsSource = {
  readonly permissions: ParticipantPermissions;
  readonly anonymousSession?: { readonly rights?: ParticipantRightsOverride | null } | null;
};

/**
 * Les droits qu'un hôte peut piloter, énumérés.
 *
 * Sert de FILTRE au corps de `PATCH …/rights` : ce qui n'y figure pas n'atteint
 * jamais `anonymousSession.rights`, où Prisma l'écrirait sans broncher — un type
 * composite Mongo n'a pas de colonne à violer.
 *
 * `canViewHistory` en fait partie : c'est précisément le levier rendu à l'hôte
 * en échange du figeage au join.
 */
export const PARTICIPANT_RIGHT_NAMES = [
  'canSendMessages',
  'canSendFiles',
  'canSendImages',
  'canSendVideos',
  'canSendAudios',
  'canSendLocations',
  'canSendLinks',
  'canViewHistory',
] as const;

export type ParticipantRightName = (typeof PARTICIPANT_RIGHT_NAMES)[number];

/**
 * Ce qu'un NOUVEAU MEMBRE reçoit, quelle que soit la porte qui l'ajoute.
 *
 * Deux portes écrivaient deux tables (#4174) : `POST …/invite`
 * (`routes/conversations/sharing.ts`) posait `canSendVideos: false,
 * canSendAudios: false`, `POST …/participants`
 * (`routes/conversations/participants-writes.ts`) posait les deux à `true`.
 * **Le même utilisateur, ajouté au même groupe, recevait des droits
 * différents selon le bouton employé** — et rien dans le produit ne
 * distinguait les deux gestes : les deux passent par le même résolveur
 * d'admission, produisent la même ligne de rôle `member`, et sont déclenchées
 * par le même écran.
 *
 * ## Pourquoi la table PERMISSIVE l'emporte
 *
 * Ce n'est pas « la plus généreuse gagne ». La variante restrictive
 * **ne restreignait rien** : elle fermait `canSendVideos` et `canSendAudios`
 * en laissant `canSendFiles` ouvert. Or un fichier peut être une vidéo ou un
 * enregistrement — la même personne envoyait la même vidéo, par l'autre
 * bouton, sans qu'aucune garde ne la retienne. Une restriction qu'un geste
 * voisin contourne n'est pas une politique de sécurité : c'est une gêne pour
 * l'utilisateur honnête et un faux témoignage pour le lecteur du code.
 *
 * `canSendLocations` et `canSendLinks` restent FERMÉS, et les deux portes en
 * convenaient déjà : ils n'ouvrent pas un média de plus, ils exposent une
 * position et une destination — deux choses qu'un arrivant n'a pas de raison
 * d'émettre avant d'avoir été admis par un geste explicite.
 *
 * `canViewHistory: false` est également commun aux deux : un membre ajouté
 * après coup lit depuis son arrivée, et un administrateur lui ouvre l'avant
 * par date (`historyVisibleFrom`).
 *
 * ## Ce que cette constante n'est PAS
 *
 * Elle ne gouverne que l'ADMISSION D'UN MEMBRE NOMMÉ par un modérateur. Les
 * entrées par LIEN de partage (`routes/links/utils/share-link-mint.ts`,
 * `routes/conversations/link-admission.ts`) recopient les droits du LIEN, qui
 * sont le sujet de leur propre décision — les aligner ici les ouvrirait pour
 * des visiteurs que personne n'a nommés.
 *
 * Elle n'est pas RÉTROACTIVE : les lignes `Participant` déjà écrites gardent
 * leur table. Un membre entré par `invite` avant #4174 conserve donc
 * `canSendVideos: false` jusqu'à ce qu'un hôte le lui ouvre par
 * `PATCH …/rights` — ou jusqu'à ce que le rattrapage de #6080
 * (`services/conversations/namedMemberRightsBackfill.ts`) le reconnaisse à la
 * SIGNATURE de sa table et le rouvre.
 *
 * `Object.freeze` n'est pas décoratif : les deux appelants étalent cet objet
 * dans un `data` Prisma, et un appelant qui muterait le littéral partagé
 * changerait les droits du membre SUIVANT.
 */
export const NEW_MEMBER_PERMISSIONS: Readonly<ParticipantPermissions> = Object.freeze({
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: true,
  canSendAudios: true,
  canSendLocations: false,
  canSendLinks: false,
  canViewHistory: false,
});

/**
 * Les droits d'un membre FONDATEUR — celui qui naît AVEC la conversation.
 *
 * Trois portes en écrivent : l'acceptation d'une demande d'ami (la conversation
 * directe des deux amis), `POST /conversations`, et la création d'une
 * conversation NEUVE par un lien de partage. Les trois posaient leur propre
 * littéral, fermé sur `canSendVideos`/`canSendAudios` — et depuis #5151 un
 * droit de type explicitement `false` REFUSE la pièce jointe correspondante
 * (`attachmentSendRightForMimeType`). Une vidéo, un vocal et un document
 * étaient donc refusés dans toute conversation directe ou créée dans l'app
 * (#6080).
 *
 * ## Pourquoi une constante PLUTÔT que `NEW_MEMBER_PERMISSIONS` tel quel
 *
 * Sur les SEPT droits d'émission, la table est la même — c'est tout le sujet
 * de #6080, et la raison pour laquelle celle-ci est DÉRIVÉE de celle-là plutôt
 * que recopiée : un huitième droit d'émission ajouté là-haut arrive ici sans
 * que personne n'ait à y penser.
 *
 * Le seul champ qui diffère est `canViewHistory`, et il diffère parce que la
 * QUESTION diffère. `NEW_MEMBER_PERMISSIONS` répond pour un membre AJOUTÉ à une
 * conversation qui existait avant lui : il lit depuis son arrivée, et un hôte
 * lui ouvre l'avant par `historyVisibleFrom`. Un FONDATEUR n'a pas d'avant —
 * la conversation et sa participation sont écrites par le même `create`. Les
 * trois portes n'écrivaient d'ailleurs pas ce champ du tout, laissant le défaut
 * de schéma (`ParticipantPermissions.canViewHistory @default(true)`) s'appliquer,
 * ce dont `historyFloorFor` tire un plancher `null`. Le poser à `false` ici
 * ferait passer ce plancher à `joinedAt` et ferait dire à la fiche de
 * participant (`resolveEntryRights`) un fait de modération FAUX, sans qu'aucun
 * besoin produit ne le demande. La valeur d'origine du site est donc préservée,
 * et elle est écrite EXPLICITEMENT : un défaut de schéma n'est pas une décision
 * lisible.
 */
export const FOUNDING_MEMBER_PERMISSIONS: Readonly<ParticipantPermissions> = Object.freeze({
  ...NEW_MEMBER_PERMISSIONS,
  canViewHistory: true,
});

/**
 * Les droits qui gouvernent ce qu'on ÉMET, par opposition à `canViewHistory`
 * qui gouverne ce qu'on LIT. Dérivés de l'énumération, jamais recopiés : un
 * droit d'émission ajouté à `PARTICIPANT_RIGHT_NAMES` entre ici tout seul.
 */
export const PARTICIPANT_SEND_RIGHT_NAMES = PARTICIPANT_RIGHT_NAMES.filter(
  (name): name is Exclude<ParticipantRightName, 'canViewHistory'> => name !== 'canViewHistory',
);

/**
 * La SIGNATURE de la table héritée — celle que les trois portes de création
 * écrivaient avant #6080, et qu'un rattrapage doit reconnaître pour rouvrir les
 * lignes déjà écrites.
 *
 * Elle est énoncée EN ENTIER, et le rattrapage l'exige champ par champ, parce
 * que c'est la seule façon de distinguer « né fermé » d'« explicitement
 * restreint ». Un hôte qui aurait retiré `canSendImages` à quelqu'un aurait
 * produit une table qui ressemble à celle-ci sur six champs sur sept : rouvrir
 * sur une correspondance PARTIELLE effacerait sa décision.
 *
 * `canViewHistory` n'en fait pas partie : les trois portes ne l'écrivaient pas,
 * si bien que la valeur persistée dépend du défaut de schéma et non du geste —
 * l'exiger ferait rater des lignes que ce rattrapage vise, sans rien distinguer
 * de plus.
 */
export const INHERITED_CLOSED_MEMBER_PERMISSIONS: Readonly<
  Record<Exclude<ParticipantRightName, 'canViewHistory'>, boolean>
> = Object.freeze({
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: false,
});

/** Ce qu'il faut d'une ligne `Participant` pour répondre à la question du rattrapage. */
export type ClosedBirthCandidate = {
  readonly permissions?: ParticipantRightsOverride | null;
  /** Présente ⇒ le participant est un visiteur ANONYME ; ses droits viennent du lien. */
  readonly anonymousSession?: unknown;
  /** Posé ⇒ le participant est entré PAR un lien ; sa table est la décision du lien. */
  readonly shareLinkId?: string | null;
};

/**
 * **Cette ligne est-elle née de la table fermée des trois portes de création ?**
 *
 * Prédicat PUR — le rattrapage de #6080 ne réécrit que ce qu'il rend `true`.
 * Trois conditions, et les deux premières comptent autant que la troisième :
 *
 * 1. **Aucune session anonyme.** Un visiteur anonyme tient ses droits du lien
 *    qu'il a suivi (`routes/conversations/link-admission.ts`) : sa restriction
 *    est la décision d'un hôte, pas un accident de naissance. Et c'est AUSSI
 *    là que `PATCH …/rights` écrit le delta d'un hôte — cette route n'écrit
 *    jamais `permissions`, y compris pour un membre inscrit
 *    (`routes/conversations/participant-rights-core.ts`). Cette seule condition
 *    met donc toute restriction d'hôte hors d'atteinte du rattrapage ; le prix
 *    assumé est qu'un membre né fermé à qui un hôte a posé n'importe quelle
 *    surcharge n'est pas rouvert par le script.
 * 2. **Aucun `shareLinkId`.** Un INSCRIT entré par un lien porte lui aussi la
 *    table du lien, sans session anonyme pour le signaler — le seul discriminant
 *    est le lien qu'il a emprunté. Sans cette condition, le rattrapage rouvrirait
 *    des membres que le porteur du lien a délibérément bornés.
 * 3. **La signature EXACTE**, champ par champ, y compris les droits à `true` :
 *    une correspondance partielle effacerait une restriction posée par un hôte
 *    (`PATCH …/rights` écrit dans `anonymousSession.rights`, mais un hôte peut
 *    aussi avoir été servi par une porte qui écrit `permissions`).
 */
export function wasBornWithClosedMemberTable(participant: ClosedBirthCandidate): boolean {
  if (participant.anonymousSession !== null && participant.anonymousSession !== undefined) return false;
  if (participant.shareLinkId) return false;

  const permissions = participant.permissions;
  if (!permissions) return false;

  return PARTICIPANT_SEND_RIGHT_NAMES.every(
    (name) => permissions[name] === INHERITED_CLOSED_MEMBER_PERMISSIONS[name],
  );
}

/**
 * Les droits d'entrée résolus, `canViewHistory` compris, tels qu'une fiche ou un
 * événement doivent les énoncer.
 *
 * `historyFallback` porte ce qui s'applique quand RIEN n'est figé — le champ a
 * été ajouté après coup, donc toute participation antérieure l'a ABSENT, et sur
 * le connecteur MongoDB un champ absent ne se distingue pas d'un `false` par une
 * requête. Le lire comme un refus annoncerait « ne voit pas l'historique » à
 * propos de visiteurs qui le voient parfaitement.
 *
 * L'appelant passe alors ce que le LIEN autorise, exactement comme le fait
 * `historyFloorFor` pour la lecture : sans quoi la fiche annoncerait un droit
 * que la lecture ne respecte pas. Défaut `true` — un lien introuvable ne borne
 * rien, posture unique du dépôt.
 */
export function resolveEntryRights(
  participant: ParticipantRightsSource,
  overrideRights?: ParticipantRightsOverride | null,
  historyFallback: boolean = true,
): Record<ParticipantRightName, boolean> {
  const source: ParticipantRightsSource = overrideRights
    ? { ...participant, anonymousSession: { rights: overrideRights } }
    : participant;

  const resolved = resolveParticipantRights(source);
  const frozenHistory = source.anonymousSession?.rights?.canViewHistory
    ?? (participant.permissions as { canViewHistory?: boolean | null }).canViewHistory;

  return {
    ...resolved,
    canViewHistory: typeof frozenHistory === 'boolean' ? frozenHistory : historyFallback,
  };
}

/**
 * **Ce qu'une fiche ou un événement a le droit de DIRE des droits d'entrée, selon
 * qui regarde** (#4056).
 *
 * Le porteur a tranché le 2026-08-27 : « qui a le droit de voir l'historique »
 * est un fait de MODÉRATION, au même titre que `historyVisibleFrom` que #3898
 * avait déjà retiré du même payload. #4009 l'a appliqué au push — l'événement
 * `participant:rights-updated` diffusé à la room ne porte plus `canViewHistory`.
 *
 * **Le pull, lui, le servait toujours à tout le monde.** `GET …/participants/:id/profile`
 * rendait `entryCapabilities` sans condition, à côté d'un `historyVisibleFrom`
 * déjà gardé. Tant qu'une route REST sert le fait, le retrait côté socket ne
 * protège rien : n'importe quel membre ouvre la fiche et le lit. C'est la forme
 * « le correctif n'atteint aucun lecteur » que le `CLAUDE.md` documente au cycle
 * 122 du Prisme, appliquée à une garde de confidentialité.
 *
 * Cette fonction est la loi UNIQUE des deux chemins. Les deux omissions écrites
 * à la main auraient divergé au premier droit ajouté — et la divergence se serait
 * faite du côté BAVARD, puisque c'est celui qui ne rougit jamais.
 *
 * **La clé est ABSENTE, jamais `false`.** Un `false` dirait « ce visiteur ne voit
 * pas l'historique », ce qui est une affirmation sur la modération — exactement
 * ce qu'on refuse de divulguer. Le contrat de fil est prêt depuis #4009 : les
 * trois clients acceptent le champ manquant.
 */
export type DisclosableEntryRights =
  Omit<Record<ParticipantRightName, boolean>, 'canViewHistory'>
  & { canViewHistory?: boolean };

export function disclosableEntryRights(
  rights: Record<ParticipantRightName, boolean>,
  viewerHostsTheRoom: boolean,
): DisclosableEntryRights {
  if (viewerHostsTheRoom) return { ...rights };
  const { canViewHistory: _reservedToHosts, ...disclosable } = rights;
  return disclosable;
}

export function resolveParticipantRights(
  participant: ParticipantRightsSource,
): ParticipantPermissions {
  const { permissions } = participant;
  const rights = participant.anonymousSession?.rights;
  if (!rights) return { ...permissions };

  return {
    canSendMessages: rights.canSendMessages ?? permissions.canSendMessages,
    canSendFiles: rights.canSendFiles ?? permissions.canSendFiles,
    canSendImages: rights.canSendImages ?? permissions.canSendImages,
    canSendVideos: rights.canSendVideos ?? permissions.canSendVideos,
    canSendAudios: rights.canSendAudios ?? permissions.canSendAudios,
    canSendLocations: rights.canSendLocations ?? permissions.canSendLocations,
    canSendLinks: rights.canSendLinks ?? permissions.canSendLinks,
  };
}

/**
 * Le droit de PIÈCE JOINTE qui gouverne un type MIME donné (#5151).
 *
 * `canSendFiles`/`canSendImages`/`canSendVideos`/`canSendAudios` partagent la
 * même table de droits mais gouvernent des CONTENUS différents — contrairement
 * à `canSendMessages`, qui est un gate binaire unique, trancher lequel
 * s'applique exige de connaître le type de la pièce. `canSendFiles` est le
 * repli générique : tout ce qui n'est ni image, ni vidéo, ni audio (document,
 * type absent ou non reconnu) — jamais un laissez-passer implicite pour les
 * trois autres, qui restent gouvernés par leur propre droit même quand
 * `canSendFiles` est ouvert.
 */
export function attachmentSendRightForMimeType(mimeType?: string | null): ParticipantRightName {
  if (mimeType?.startsWith('image/')) return 'canSendImages';
  if (mimeType?.startsWith('video/')) return 'canSendVideos';
  if (mimeType?.startsWith('audio/')) return 'canSendAudios';
  return 'canSendFiles';
}
