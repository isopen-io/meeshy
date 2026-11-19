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
 *
 * **Les deux clauses de soft-state se disent POSITIVEMENT** (#19905). Elles
 * exigeaient toutes deux la clé PRÉSENTE, et sous MongoDB cela ne retire pas un
 * cas limite mais la POPULATION :
 *
 * - `deletedAt: null` est une ÉGALITÉ. Or **aucun chemin de création n'écrit
 *   `Conversation.deletedAt`** — son unique écrivain du dépôt est
 *   `obsoleteConversation.ts`, qui pose une DATE à la mise au rebut, jamais
 *   `null`. Une conversation vivante n'a donc pas la clé, et la clause écartait
 *   TOUT LE MONDE : l'émetteur enregistrait sa voix pour rien, sans erreur ni
 *   trace. `unsetOrNull('deletedAt')` apparie les deux états de « pas encore ».
 * - `NOT: SERVER_BLIND_REGIME_FILTER` était une NÉGATION, et toute négation
 *   exige la clé présente (#8309). Ce site était le SEUL du dépôt à NIER ce
 *   filtre, qui est écrit pour être lu positivement — son doc-comment le dit.
 *   `SERVER_READABLE_REGIME_FILTER`, déclaré dans le même fichier comme son
 *   complément, dit l'absence par `isSet: false`.
 *
 * **La substitution n'est PAS neutre, et c'est tout l'intérêt.** Sur la VALEUR
 * du mode les deux formes s'accordent — `null`, `''`, `server`, `hybrid`,
 * `e2ee` en toute casse, un mode inconnu : même verdict. Elles divergent sur un
 * seul cas, la clé ABSENTE, que la négation écarte et que la forme positive
 * retient — c'est-à-dire sur la POPULATION. Dire « ça ne change rien » ici
 * serait se contredire deux paragraphes plus haut. Ce que la substitution
 * retire, c'est la DÉPENDANCE à la sémantique du `NOT` : une forme positive n'a
 * pas de sémantique de négation à connaître, et cela vaut mieux que de la
 * mesurer. L'élargissement admet les documents sans mode — « pas de mode » veut
 * dire « en clair », ce que `regimeIsActive` et `encryptionStatusView` disent
 * déjà partout ailleurs.
 *
 * ─── Et la promesse de la COMMUNAUTÉ, que rien ne tenait (#19919) ───────────
 *
 * Le § ci-dessus promet qu'« une copie n'atterrit ni dans une communauté, ni
 * dans une conversation chiffrée ». La seconde moitié est tenue par le filtre de
 * régime ; la PREMIÈRE ne l'était par RIEN. Un salon de communauté est une
 * `Conversation` de type `group` portant un `communityId`, dont les membres ont
 * des lignes `Participant` actives : deux membres d'une même communauté le
 * PARTAGENT au sens de cette fonction.
 *
 * Le défaut était INERTE tant que le `where` ci-dessus ne rendait rien à
 * personne. **Réparer la population l'ARMAIT** — c'est « une PANNE peut tenir la
 * porte, et la réparer l'ouvre » (`CLAUDE.md` du gateway, cycle 84), et la règle
 * qui en découle est que le lot qui débouche un chemin décide, dans le MÊME lot,
 * de ce qui a le droit d'y passer. Ce qu'il en coûtait est entier : les trois
 * clients ne rejouent PAS leur propre loi quand le serveur NOMME une destination
 * (le web court-circuite `mayCarryTheCopy`, iOS ne contrôle rien), donc le
 * message vocal privé d'Alice à Bob aurait été publié dans le salon, lisible par
 * TOUS les membres de la communauté.
 *
 * Chacun des trois prédicats rend une clé `OR` : ils vivent sous `AND`, jamais
 * en frères du même objet, où le second écraserait le premier en silence
 * (leçon 318).
 *
 * **Ce que ce `where` ne rejoue toujours PAS de la loi cliente** : le canal
 * d'annonces et l'admission d'écriture (`defaultWriteRole`, mode lent). Les deux
 * font PERDRE la voix — l'envoi est refusé — sans rien exposer : une annonce et
 * un mode lent restreignent qui ÉCRIT, pas qui LIT, et l'audience reste celle de
 * la conversation. C'est #19920, et c'est une question d'admission d'écriture,
 * pas de destination.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SERVER_READABLE_REGIME_FILTER } from '../conversations/encryptionRegime';
import { unsetOrNull } from '../../utils/prisma-unset';
import { RANK_SELECT, highestRankedConversation } from '../conversations/highestRanked';

/** Une copie privée ne part que dans un échange privé : jamais une communauté, une diffusion ou un fil public. */
const PRIVATE_TYPES = ['direct', 'group'];

export async function mostRecentSharedConversation(
  prisma: Pick<PrismaClient, 'participant' | 'conversation'>,
  fromUserId: string,
  toUserId: string,
): Promise<string | null> {
  const mine = await prisma.participant.findMany({ where: { userId: fromUserId, isActive: true }, select: { conversationId: true } });
  if (mine.length === 0) return null;
  const shared = await prisma.participant.findMany({
    where: { userId: toUserId, isActive: true, conversationId: { in: mine.map((p) => p.conversationId) } },
    select: { conversationId: true },
  });
  if (shared.length === 0) return null;
  // #19905, #19919 — les TROIS prédicats se disent POSITIVEMENT, et chacun rend
  // une clé `OR` : ils vivent sous `AND`, jamais en frères du même objet (deux
  // `OR` frères s'écrasent en silence — leçon 318).
  const where = {
    id: { in: shared.map((p) => p.conversationId) },
    isActive: true,
    type: { in: PRIVATE_TYPES },
    AND: [unsetOrNull('deletedAt'), unsetOrNull('communityId'), SERVER_READABLE_REGIME_FILTER],
  };
  const latest = await highestRankedConversation((stream) =>
    prisma.conversation.findFirst({ where: { ...where, ...stream.where }, orderBy: stream.orderBy, select: RANK_SELECT }),
  );
  return latest?.id ?? null;
}
