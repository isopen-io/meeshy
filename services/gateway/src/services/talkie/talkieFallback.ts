/**
 * Où part la copie vocale d'un talkie qui ne passe pas (#17141, précision du porteur du
 * 2026-11-08) : dans la conversation la PLUS RÉCENTE que l'émetteur partage avec le
 * destinataire — pas forcément la directe.
 *
 * **« La plus récente » est le RANG, pas le dernier message** (#19834, tranché par
 * #19835 le 2026-11-19). Les TROIS clients qui replient cette décision quand le
 * serveur ne la nomme pas la lisaient DÉJÀ ainsi — `listRankAt ?? lastMessageAt ??
 * updatedAt` sur le web (`apps/web/src/lib/talkie/talkie-voice-copy.ts`), sur iOS
 * (`apps/ios/Meeshy/Features/Talkie/TalkieVoiceCopy.swift`) et sur Android
 * (`TalkieVoiceCopySender.kt`) — et #9026 (directive porteur du 2026-10-01) définit
 * « récent » comme max(`lastMessageAt`, `lastActivityAt`) pour toute la liste. Des
 * quatre sites, le serveur était le SEUL à trier sur le dernier message : sur les
 * MÊMES données, la copie n'atterrissait pas au même endroit selon le chemin
 * emprunté. Les quatre disent désormais la même chose, et c'est le serveur qui a
 * bougé. C'est le CLIENT émetteur qui crée cette copie,
 * avec l'audio qu'il a enregistré : le serveur ne garde rien d'une voix refusée. Il lui
 * dit seulement où l'envoyer (`TalkieStartAck.conversationId`). L'émetteur est membre
 * actif de la conversation rendue : rien ne lui est appris qu'il ne voie déjà. Seuls les
 * échanges privés (direct, groupe) que le serveur lit sont candidats : une copie n'atterrit
 * ni dans une communauté, ni dans une conversation chiffrée où le clair serait refusé.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_READABLE_REGIME_FILTER } from '../conversations/encryptionRegime';
import { RANK_SELECT, highestRankedConversation } from '../conversations/highestRanked';
import { unsetOrNull } from '../../utils/prisma-unset';

/** Une copie privée ne part que dans un échange privé : jamais une communauté, une diffusion ou un fil public. */
const PRIVATE_TYPES = ['direct', 'group'];

/**
 * Les rangs d'écriture qu'un MEMBRE ordinaire satisfait (`WRITE_ROLE_RANK`,
 * `conversationWriteAdmission.ts`). Au-dessus — `moderator`, `admin`,
 * `creator` — l'envoi serait refusé, donc la destination ne se nomme pas.
 * Une colonne ABSENTE vaut `everyone` (`defaultWriteRole ?? 'everyone'` au site
 * d'admission), donc elle PASSE.
 */
const MEMBER_WRITABLE_ROLES = ['everyone', 'member'];

export async function mostRecentSharedConversation(
  prisma: Pick<PrismaClient, 'participant' | 'conversation'>,
  fromUserId: string,
  toUserId: string,
): Promise<string | null> {
  // #19910 — une conversation que l'ÉMETTEUR a masquée chez lui n'est pas une
  // destination : elle ne figure pas dans la liste où son client puiserait
  // (`core-list.ts` l'exclut par la même paire de branches), donc la nommer
  // enverrait la copie là où il ne la cherchera pas. Le `deletedForMe` du
  // DESTINATAIRE, lui, ne se filtre pas : la conversation lui réapparaît à
  // l'arrivée du message, et son client ne l'a jamais consultée pour ce choix.
  const mine = await prisma.participant.findMany({
    where: { userId: fromUserId, isActive: true, ...unsetOrNull('deletedForMe') },
    select: { conversationId: true },
  });
  if (mine.length === 0) return null;
  const shared = await prisma.participant.findMany({
    where: { userId: toUserId, isActive: true, conversationId: { in: mine.map((p) => p.conversationId) } },
    select: { conversationId: true },
  });
  if (shared.length === 0) return null;

  // #19910 — LE SERVEUR DÉCIDE, DONC IL APPLIQUE LA RÈGLE D'ADMISSION ENTIÈRE.
  //
  // Tant que ce filtre n'appariait rien (#19803), le serveur ne nommait aucune
  // destination et le client choisissait seul, en appliquant `mayCarryTheCopy`.
  // Le réparer ne « rallume » donc pas un chemin : il TRANSFÈRE la décision —
  // et les trois clients font confiance à l'id servi (iOS et Android le
  // prennent tel quel, le web ne revérifie que le registre E2EE). Ce `where`
  // est donc le seul endroit où la règle s'applique encore.
  //
  // Chaque prédicat PASSE sur une colonne ABSENTE, parce que c'est ainsi que le
  // client les lit (`!== true`, `== null`) et parce qu'un document d'avant
  // l'ajout d'une colonne ne porte pas sa valeur par défaut. D'où les quatre
  // helpers à branche `OR`, composés par `AND` : deux `OR` ne peuvent pas
  // cohabiter dans un même objet, et un second spread écraserait le premier en
  // silence — le filtre redeviendrait mort sans qu'un témoin tombe.
  const base = { id: { in: shared.map((p) => p.conversationId) }, isActive: true, type: { in: PRIVATE_TYPES } };
  const admission = [
    // Le régime se dit en POSITIF (#12966), comme la jumelle `directPair.ts:65`
    // le fait déjà pour cette question : `NOT: SERVER_BLIND_REGIME_FILTER` nie
    // une condition COMPOSÉE, forme pour laquelle le double de test n'a jamais
    // été mesuré (#19907) et dont dépendait la vivacité de tout le chemin pour
    // les conversations créées avant la directive « régime à la création ».
    SERVER_READABLE_REGIME_FILTER,
    unsetOrNull('deletedAt'),
    // « une copie n'atterrit ni dans une communauté » — ce que le doc-comment
    // ci-dessus DÉCLARE depuis toujours et que le `where` n'appliquait pas.
    // `type: 'group'` ne l'exclut pas : `communities/core.ts` rattache une
    // conversation existante à une communauté sans toucher son `type`.
    unsetOrNull('communityId'),
    // Miroir de `mayCarryTheCopy` : `candidate.isAnnouncementChannel !== true`.
    //
    // Ces DEUX colonnes-ci se disent sans branche d'absence, et ce n'est pas un
    // oubli : elles sont REQUISES au schéma (`Boolean @default(false)`,
    // `String @default("everyone")`), donc Prisma les écrit à chaque création
    // et son type n'offre même pas `isSet` dessus — le compilateur refuse la
    // forme permissive. C'est le discriminant à retenir pour toute cette
    // famille : **la branche d'absence ne vaut que pour une colonne
    // OPTIONNELLE** (`deletedAt`, `communityId`, `deletedForMe` ci-dessus le
    // sont ; ces deux-là ne le sont pas).
    //
    // Reste le cas d'un document ANTÉRIEUR à l'ajout de la colonne, que ce
    // conteneur ne peut pas mesurer : il ne serait pas apparié, donc pas
    // nommé, donc le client choisirait seul — exactement ce qu'il fait
    // aujourd'hui. L'erreur penche du côté sûr, et c'est pour cela qu'on
    // l'assume ici plutôt que de l'écrire en permissif.
    { isAnnouncementChannel: { not: true } },
    { defaultWriteRole: { in: MEMBER_WRITABLE_ROLES } },
  ];
  const latest = await highestRankedConversation((stream) =>
    prisma.conversation.findFirst({
      // `stream.where` entre dans le `AND` plutôt que d'être répandu à côté :
      // le jour où un flux portera sa propre clé `OR`, elle ne remplacera pas
      // celles d'ici. La sûreté du spread était accidentelle.
      where: { ...base, AND: [...admission, stream.where] },
      orderBy: stream.orderBy,
      select: RANK_SELECT,
    }),
  );
  return latest?.id ?? null;
}
