import type { ParticipantPermissions } from '../types/participant';

/**
 * **CE QU'UN PARTICIPANT A LE DROIT D'ENVOYER, RÉSOLU UNE SEULE FOIS** (#20292).
 *
 * Deux couches, et leur ordre est le sujet :
 *
 * - `Participant.permissions` est un INSTANTANÉ pris au join, recopié depuis le
 *   lien de partage emprunté. Il ne suit pas le lien : un hôte qui décoche
 *   `allowAnonymousFiles` après coup ne retire rien à qui est déjà entré.
 * - `anonymousSession.rights` est un DELTA posé par l'hôte sur CE participant.
 *   Un droit qu'il ne nomme pas n'est pas « faux », il est « non dit » : il suit
 *   l'instantané. C'est ce qui permet d'ouvrir un seul droit sans geler les
 *   autres à leur valeur du moment.
 *
 * `??` porte exactement cette sémantique — `false` est une réponse, `undefined`
 * une abstention. Ne jamais le remplacer par `||`, qui confondrait les deux et
 * rendrait tout droit FERMÉ par surcharge indistinguable d'un silence.
 *
 * ─── Pourquoi la loi vit ICI, et non dans la passerelle ──────────────────────
 *
 * Elle était dans `services/gateway/src/services/participantRights.ts`, qui en
 * était le seul porteur. **`serializeConversationParticipant` — la fabrique que
 * le dépôt impose à TOUTE surface servant un participant — vit dans ce paquet
 * et ne peut rien importer de la passerelle.** Elle servait donc les trois
 * droits d'émission APLATIS depuis l'instantané nu, sur cinq sites dont la
 * collection de SYNCHRONISATION, celle qui hydrate le cache hors-ligne des
 * clients : la valeur fausse y survivait à la fermeture de l'app.
 *
 * Même déménagement, même raison, que `participation-vivante` (#20111) : une loi
 * que deux paquets doivent appliquer ne peut pas vivre chez l'un des deux. La
 * passerelle la RÉ-EXPORTE sous les mêmes noms — ses importateurs sont
 * inchangés.
 *
 * ─── Le `??` du dépôt est ICI, et nulle part ailleurs ────────────────────────
 *
 * `resolvedSendRight` est l'unique site de la descente. La table complète
 * (`resolveParticipantRights`) en est une PROJECTION, droit par droit, au lieu
 * de retaper sept fois la même chaîne — c'est précisément la forme qui avait
 * laissé la fabrique diverger sans que rien ne rougisse.
 */

/**
 * Le delta que l'hôte pose sur un participant. Tout champ est facultatif.
 *
 * `null` y est admis autant qu'`undefined` : sur le connecteur MongoDB, un
 * `Boolean?` de type composite se relit `null`, jamais `undefined`. Les deux
 * disent la même chose — « non dit » — et `??` les traite identiquement.
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
 * La même question posée d'une ligne dont l'instantané est PARTIEL — ce que la
 * fabrique de participant reçoit, qui n'a pas toujours les sept droits.
 *
 * Elle est SÉPARÉE de `ParticipantRightsSource` plutôt que de l'élargir : la
 * passerelle exige la table entière pour appliquer la loi à l'envoi, et
 * l'assouplir là-bas ferait passer pour « non dit » un droit simplement non
 * PROJETÉ. Ici l'appelant sert une ligne de fil, où l'absence a bien ce sens.
 */
export type PartialParticipantRightsSource = {
  readonly permissions?: ParticipantRightsOverride | null;
  readonly anonymousSession?: { readonly rights?: ParticipantRightsOverride | null } | null;
};

/**
 * Le droit RÉSOLU d'un participant, pour UN nom — l'unique descente du dépôt.
 *
 * L'ordre est surcharge → instantané → `true`. Le repli terminal est `true`
 * parce qu'une ligne sans table de droits est un MEMBRE ORDINAIRE : fermer par
 * défaut retirerait le composeur à toute conversation dont le `select` ne
 * projette pas `permissions`, ce qui est le cas nominal d'un inscrit.
 */
export function resolvedSendRight(
  source: PartialParticipantRightsSource,
  name: keyof ParticipantPermissions,
): boolean {
  return source.anonymousSession?.rights?.[name] ?? source.permissions?.[name] ?? true;
}

/**
 * La table complète, telle que la passerelle l'exige pour autoriser un envoi.
 *
 * `canViewHistory` n'en fait PAS partie : c'est un fait de MODÉRATION (#4056),
 * pas un droit d'émission, et il a ses propres portes.
 */
export function resolveParticipantRights(
  participant: ParticipantRightsSource,
): ParticipantPermissions {
  // Le retour anticipé n'est pas une optimisation : SANS surcharge, la table
  // part telle quelle, `canViewHistory` COMPRIS quand la ligne le porte. La
  // forme énumérée ci-dessous ne rend que les sept droits d'émission, donc
  // l'écrire dans les deux cas DROPERAIT ce champ sur le chemin nominal. C'est
  // le comportement d'origine, préservé mot pour mot — `resolveEntryRights` le
  // recalcule de son côté, mais il n'est pas le seul lecteur de cette table.
  if (!participant.anonymousSession?.rights) return { ...participant.permissions };
  return {
    canSendMessages: resolvedSendRight(participant, 'canSendMessages'),
    canSendFiles: resolvedSendRight(participant, 'canSendFiles'),
    canSendImages: resolvedSendRight(participant, 'canSendImages'),
    canSendVideos: resolvedSendRight(participant, 'canSendVideos'),
    canSendAudios: resolvedSendRight(participant, 'canSendAudios'),
    canSendLocations: resolvedSendRight(participant, 'canSendLocations'),
    canSendLinks: resolvedSendRight(participant, 'canSendLinks'),
  };
}
