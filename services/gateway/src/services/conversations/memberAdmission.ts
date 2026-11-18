import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NoticeActor } from '@meeshy/shared/utils/conversation-notice';
import { decideDirectOpening, requestRecipientFields } from '../messaging/messageRequests';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { announceMembershipAdmission } from '../../routes/conversations/membershipAdmissionFanOut';
import { postJoinSystemMessage } from './joinSystemMessage';
import { NEW_MEMBER_PERMISSIONS } from '../participantRights';
import { newMemberRefusal } from './newMemberAdmission';
import { resolveConversationEntry, REJOIN_PARTICIPANT_STATE } from './conversationEntryAdmission';
import { recipientLanguage } from '../../utils/recipient-language';
import { announceConversationLanguageChange } from '../message-translation/conversationLanguageChanges';
import { CerclesAchievements } from '../achievements/CerclesAchievements';
import type { EngagementService } from '../engagement/EngagementService';
import type { NotificationService } from '../notifications/NotificationService';
import { applyCommunityAdmission, planSalonEntry, type SalonCommunity } from './communityMembershipSync';
import { communityMemberAnnouncerOverIO } from '../community-member-broadcast';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ConversationMemberAdmission' });

/** Ce qui est arrivé à UN identifiant du lot. */
export type ParticipantAdmissionVerdict = {
  readonly userId: string;
  /**
   * `community-forbidden` (#16695) : le salon appartient à une communauté
   * PRIVÉE dont la personne n'est pas membre, et l'appelant n'y fait entrer
   * personne (ni créateur, ni administrateur, ni modérateur de la communauté).
   */
  readonly outcome: 'new' | 'rejoin' | 'already-member' | 'banned' | 'not-found' | 'community-forbidden';
  readonly participantId?: string;
};

/** Ce que l'admission demande au moteur d'engagement (#8959) — un double en test. */
export type ParticipantInviteEngagement = Pick<EngagementService, 'recordActivity'>;

export type MemberAdmissionPorts = {
  readonly prisma: PrismaClient;
  readonly io: Parameters<typeof announceMembershipAdmission>[0]['io'];
  /** `MeeshySocketIOManager.joinUserToConversationRoom` — absent : aucune socket à joindre. */
  readonly joinRoom: ((userId: string, conversationId: string) => Promise<void>) | null;
  /** `MeeshySocketIOManager.broadcastMessage` — l'avis d'arrivée. Absent : il reste persisté. */
  readonly broadcastMessage?: (message: unknown, conversationId: string) => Promise<void>;
  readonly notificationService: Pick<NotificationService, 'createAddedToConversationNotification' | 'createMemberJoinedNotificationsBatch'> | null | undefined;
  readonly engagement: ParticipantInviteEngagement;
};

export type MemberAdmissionOptions = {
  readonly conversationId: string;
  readonly conversation: {
    readonly isActive: boolean | null;
    readonly closedAt: Date | null;
    readonly type: string | null;
    readonly encryptionMode: string | null;
  } | null;
  readonly userId: string;
  readonly currentUserId: string | undefined;
  /** Le membre qui ajoute — l'avis se lit « Demo a ajouté X » (#7593). */
  readonly addedBy: NoticeActor;
  /** La communauté PRIVÉE qui héberge le salon, lue une fois pour le lot (#16695). */
  readonly community: SalonCommunity | null;
  /** `false` : l'arrivant n'est pas notifié de son ajout (l'appel le fait sonner). Défaut `true`. */
  readonly notifyInvitee?: boolean;
};

/**
 * L'ADMISSION D'UNE PERSONNE DANS UNE CONVERSATION — tout ce que la porte
 * d'ajout (`POST /conversations/:id/participants`) fait pour UN identifiant :
 * écriture (création ou rejoin), avis d'arrivée dans le fil, `conversation:joined`
 * en salle, effectif absolu aux rooms personnelles, auto-join des sockets,
 * `conversation:new` à l'arrivant, et les deux notifications.
 *
 * Extraite de `routes/conversations/participants-writes.ts` (#19650) pour que
 * l'invitation dans un appel de groupe fasse entrer l'invité par la MÊME porte,
 * sans Fastify. `notifyInvitee: false` sert l'appel : la sonnerie est la
 * notification de l'invité.
 *
 * Elle rend un VERDICT plutôt que d'écrire une réponse : c'est ce qui permet
 * à un refus de ne pas emporter le lot.
 */
export async function admitConversationMember(
  ports: MemberAdmissionPorts,
  options: MemberAdmissionOptions
): Promise<ParticipantAdmissionVerdict> {
  const { prisma, engagement } = ports;
  const { conversationId, conversation, userId, currentUserId, addedBy, community } = options;
  const notifyInvitee = options.notifyInvitee ?? true;

  // #17117, #16188 — la loi unique, à la porte même : la route la consulte
  // déjà pour le lot entier, l'appel aussi, et aucun transport futur ne
  // pourra l'oublier.
  if (conversation && newMemberRefusal(conversation)) return { userId, outcome: 'not-found' };

  const userToAdd = await prisma.user.findFirst({ where: { id: userId } });
  if (!userToAdd) return { userId, outcome: 'not-found' };
  // #14107 (MSG-03, RG-22) — un groupe ne débloque rien : un membre ajouté par
  // quelqu'un qui n'est pas au moins sa Connaissance entre par sa boîte de demandes.
  const opening = currentUserId ? await decideDirectOpening(prisma, { senderId: currentUserId, recipientId: userId }) : { kind: 'direct' as const };

  // Le `findFirst({ isActive: true })` qui précédait ne pouvait PAS voir la
  // ligne d'un banni (bannir écrit `isActive: false`) : le `create` lui
  // fabriquait une ligne neuve et active, ce qui défaisait le bannissement
  // sans passer par `POST …/unban` — laquelle exige le rang `admin` là où
  // cette route s'ouvre aussi aux `moderator`, et écrit une trace. Voir
  // `services/conversations/conversationEntryAdmission.ts`.
  const entry = await resolveConversationEntry({ prisma, conversationId, userId, conversation });

  if (entry.outcome === 'closed') return { userId, outcome: 'not-found' };
  if (entry.outcome === 'banned') return { userId, outcome: 'banned' };
  if (entry.outcome === 'already-member') return { userId, outcome: 'already-member' };

  // #16695 — entrer dans un salon d'une communauté privée, c'est y être admis.
  const communityAdmission = await planSalonEntry(prisma, community, { kind: 'registered', userId });
  if (communityAdmission.kind === 'refused') {
    return { userId, outcome: communityAdmission.reason === 'invite-forbidden' ? 'community-forbidden' : 'not-found' };
  }

  // #4174 — la table de droits vient du site UNIQUE
  // (`services/participantRights.ts`), partagé avec `POST …/invite`.
  // C'est la table de CE handler qui a été retenue : la variante de
  // l'autre porte fermait `canSendVideos`/`canSendAudios` en laissant
  // `canSendFiles` ouvert, donc ne fermait rien — un fichier peut être
  // une vidéo.
  const addedMemberFields = {
    type: 'user',
    displayName: userToAdd.displayName ?? userToAdd.username ?? `${userToAdd.firstName ?? ''} ${userToAdd.lastName ?? ''}`.trim(),
    avatar: userToAdd.avatar,
    role: 'member',
    // #4662 — `Participant.language` est la colonne que ses lecteurs prennent
    // pour la langue du membre quand aucun prisme `User` ne se résout
    // (`resolveParticipantLanguage`, `offlineParticipantQueue`). La poser
    // depuis `systemLanguage` NU y inscrivait le repli du site pour tout
    // compte dont la langue vit au rang 2, 3 ou 4 — le cas NOMINAL dès que la
    // locale appareil (rang 4) diffère de la langue applicative. Le repli
    // reste un PARAMÈTRE du site : `'en'` est celui de cette porte, et
    // trancher « quelle langue pour un compte sans AUCUNE préférence ? » est
    // un arbitrage produit, pas un correctif de Prisme.
    language: recipientLanguage(userToAdd, 'en'),
    permissions: { ...NEW_MEMBER_PERMISSIONS },
    ...requestRecipientFields(opening, new Date(), currentUserId ?? '')
  };

  // Partagé par l'écriture et l'emit, comme `leftAt` sur le chemin du
  // départ : les deux doivent s'accorder. Un rejoin conserve son `joinedAt`
  // d'origine en base — l'événement, lui, date l'ADHÉSION qu'il annonce,
  // c'est-à-dire maintenant.
  const joinedAt = new Date();

  let joinedParticipantId: string;
  if (entry.outcome === 'rejoin' && entry.participantId) {
    const rejoined = await prisma.participant.update({
      where: { id: entry.participantId },
      data: { ...REJOIN_PARTICIPANT_STATE, ...addedMemberFields }
    });
    joinedParticipantId = rejoined.id;
    invalidateParticipantLookup(entry.participantId, conversationId);
  } else {
    const created = await prisma.participant.create({
      data: {
        conversationId: conversationId,
        userId: userId,
        ...addedMemberFields,
        joinedAt
      }
    });
    joinedParticipantId = created.id;

    // Le succès revient à celui qui REJOINT, pas à celui qui l'ajoute :
    // c'est lui qui entre dans le cercle (#5759).
    void new CerclesAchievements(prisma).recordEvent({
      kind: 'conversation.join',
      userId,
      conversationId,
    }).catch(() => undefined);
  }

  if (community) await applyCommunityAdmission(prisma, community.communityId, communityAdmission, communityMemberAnnouncerOverIO(prisma, ports.io));
  announceConversationLanguageChange({ kind: 'arrival', conversationId, language: addedMemberFields.language, readerUserId: userId });


  // L'admission dans la ROOM d'abord — « l'une sert l'arrivant, l'autre parle
  // de lui aux autres, et c'est la première qui décide s'il recevra quoi que
  // ce soit du fil » (`performLinkJoin`). #18384 : « d'abord » veut dire avant
  // le MESSAGE D'ARRIVÉE aussi, pas seulement avant les trois diffusions
  // d'adhésion. Il part sur `conversation:<id>` ; tant que la socket de
  // l'arrivant n'y est pas, il ne reçoit pas son propre message d'arrivée, et
  // la file hors ligne ne le rattrape pas — il figure déjà dans
  // `connectedUsers` et ne porte aucun marqueur d'injoignabilité.
  //
  // ATTENDUE, et fail-OPEN : l'adhésion est déjà persistée, donc un
  // adaptateur en panne ne doit pas la retenir.
  if (ports.joinRoom) {
    await ports.joinRoom(userId, conversationId).catch(
      (err: unknown) => logger.error('Failed to auto-join added user to conversation room', err as Error)
    );
  }

  // Annoncer l'arrivée — quatrième et dernière porte, même loi. Une entrée
  // qui ne se voit pas dans le fil est une entrée que les présents
  // découvrent au premier message de l'arrivant.
  await postJoinSystemMessage(
    {
      prisma,
      broadcast: ports.broadcastMessage
    },
    {
      conversationId,
      participantId: joinedParticipantId,
      displayName: addedMemberFields.displayName,
      isAnonymous: false,
      viaShareLink: false,
      addedBy
    }
  );

  // Les TROIS diffusions d'adhésion, par leur site UNIQUE (#17032). Cette
  // porte était la seule à les émettre toutes ; sa jumelle l'invitation n'en
  // émettait qu'une, et la règle retapée à chaque porte est celle qu'une
  // porte finit par ne pas avoir.
  await announceMembershipAdmission({
    prisma,
    io: ports.io,
    conversationId,
    arrival: { userId, displayName: addedMemberFields.displayName, joinedAt },
    actorUserId: currentUserId,
    onError: (error) => logger.warn('membership admission fan-out failed', { userId, conversationId, err: error }),
  });

  // #14107 (E2, audit 3 F-b) — la personne en demande n'est pas prévenue ; les membres présents, si.
  const notificationService = ports.notificationService;
  if (notificationService) {
    if (notifyInvitee && opening.kind === 'direct') notificationService.createAddedToConversationNotification({
      recipientUserId: userId,
      addedByUserId: currentUserId,
      conversationId,
    }).catch((err: unknown) => logger.error('Notification error added', err as Error));

    const existingMembers = await prisma.participant.findMany({
      where: { conversationId, isActive: true, type: 'user', userId: { notIn: [userId, currentUserId!] } },
      select: { userId: true },
    });
    // Une seule diffusion pour toute l'audience : le profil du nouveau
    // membre, la conversation et l'effectif sont les mêmes pour chacun, et
    // le mute se demande en une requête. La boucle d'appels unitaires qui
    // précédait les relisait par destinataire.
    const recipientUserIds = existingMembers
      .map((member) => member.userId)
      .filter((id): id is string => !!id);
    if (recipientUserIds.length > 0) {
      notificationService.createMemberJoinedNotificationsBatch(recipientUserIds, {
        newMemberUserId: userId,
        conversationId,
        joinMethod: 'invited' as const,
      }).catch((err: unknown) => logger.error('Notification error joined', err as Error));
    }
  }

  // `social.conversation_invite` (#8959) : faire entrer quelqu'un rapporte à
  // celui qui l'a fait entrer, une fois par personne et par conversation —
  // la cible `conversation:personne` porte cette unicité dans le moteur.
  if (currentUserId && currentUserId !== userId) {
    engagement
      .recordActivity(currentUserId, 'social.conversation_invite', { targetId: `${conversationId}:${userId}` })
      .catch((err: unknown) => logger.warn('engagement social.conversation_invite failed', { err }));
  }

  return { userId, outcome: entry.outcome === 'rejoin' ? 'rejoin' : 'new', participantId: joinedParticipantId };
}
