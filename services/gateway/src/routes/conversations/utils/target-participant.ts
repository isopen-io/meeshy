import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * La CIBLE d'un geste de gestion, désignée par un segment d'URL qui peut être un
 * `User.id` **ou** un `Participant.id`.
 *
 * Les routes de gestion nomment leur paramètre `:userId` et filtraient sur la
 * seule colonne `userId`. Or un visiteur venu par un lien partagé n'a AUCUNE
 * ligne `User` : son `Participant.userId` est `null`, et sa seule identité est
 * son `Participant.id`. Aucune de ces routes ne pouvait donc l'atteindre — et
 * l'expulsion, qui écrivait par `updateMany`, ne trouvait rien SANS échouer :
 * elle répondait **200** en n'ayant rien fait, l'interface retirait la personne,
 * et le chargement suivant la ramenait.
 *
 * `services/gateway/CLAUDE.md` porte déjà la règle pour l'APPELANT — « une
 * requête `Participant` sur cette clé doit choisir sa COLONNE ». Ceci est son
 * pendant pour la CIBLE, et la même remarque s'applique : le symptôme d'une
 * mauvaise colonne n'est pas une erreur, c'est une absence.
 *
 * **Les deux identifiants ne sont jamais ambigus** : ce sont deux ObjectId de
 * COLLECTIONS différentes. Un `User.id` ne peut pas désigner un participant, et
 * réciproquement. On cherche `userId` d'abord — le cas courant, et celui où un
 * même `User` n'a qu'une ligne par conversation.
 *
 * Ne filtre PAS sur `isActive` : bannir quelqu'un déjà parti est un geste
 * légitime (c'est ce qui l'empêche de revenir par un lien), et c'est l'appelant
 * qui décide ce qu'il exige de l'état. Cf. `conversationBanState.ts`.
 */
export interface TargetParticipantRow {
  readonly id: string;
  readonly userId: string | null;
  readonly role: string;
  readonly isActive: boolean;
  readonly leftAt: Date | null;
  readonly bannedAt: Date | null;
  readonly displayName: string | null;
  readonly shareLinkId: string | null;
}

const TARGET_SELECT = {
  id: true,
  userId: true,
  role: true,
  isActive: true,
  leftAt: true,
  bannedAt: true,
  displayName: true,
  // Le lien d'ENTRÉE. Bannir le ferme — sortir la personne sans fermer la porte
  // par laquelle elle est passée ne protège de rien.
  shareLinkId: true,
} as const;

export async function resolveTargetParticipant(
  prisma: PrismaClient,
  conversationId: string,
  key: string,
): Promise<TargetParticipantRow | null> {
  const byUserId = await prisma.participant.findFirst({
    where: { conversationId, userId: key },
    select: TARGET_SELECT,
  });
  if (byUserId) return byUserId as TargetParticipantRow;

  const byParticipantId = await prisma.participant.findFirst({
    where: { conversationId, id: key },
    select: TARGET_SELECT,
  });
  return (byParticipantId as TargetParticipantRow | null) ?? null;
}

/**
 * Comment NOMMER cette cible dans un payload d'événement.
 *
 * `userId` déclare un `User.id` : il vaut `null` pour un visiteur sans compte,
 * jamais son `Participant.id` — recopier l'un dans l'autre est ce que le
 * CLAUDE.md du gateway interdit explicitement. `participantId` est donc le seul
 * champ TOUJOURS présent, et le seul sur lequel un client peut retirer la bonne
 * ligne.
 */
export const identifyTarget = (target: TargetParticipantRow) => ({
  participantId: target.id,
  // `?? null` et non la valeur brute : `undefined` DISPARAÎT du payload — que ce
  // soit par `fast-json-stringify` sur une réponse REST ou par `JSON.stringify`
  // sur le fil Socket.IO. Un client verrait alors « clé absente » là où le
  // serveur voulait dire « cette personne n'a pas de compte », et les deux ne se
  // lisent pas pareil.
  userId: target.userId ?? null,
});
