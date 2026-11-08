import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ParticipantPermissions } from '@meeshy/shared/types/participant';
import { automaticNicknameBase, numberedAnonymousUsername } from '../../utils/anonymous-nickname';
import { generateSessionToken, hashSessionToken } from '../../utils/session-token';
import { SecuritySanitizer } from '../../utils/sanitize';
import { findFreeAnonymousUsername } from '../../services/conversations/anonymousUsername';
import { describeGuestClient } from '../../services/conversations/guestClient';
import { postJoinSystemMessage } from '../../services/conversations/joinSystemMessage';
import { resolveEntryRights } from '../../services/participantRights';
import { announceConversationLanguageChange } from '../../services/message-translation/conversationLanguageChanges';
import { claimLinkUse, LINK_EXHAUSTED_RACE } from './link-admission-claim';
import type {
  LinkJoinBroadcast,
  LinkJoinOutcome,
  LinkJoinProfileInput,
  ShareLinkWithConversation,
} from './link-admission';

/**
 * L'admission d'un VISITEUR SANS COMPTE par lien partagé — la création de sa
 * ligne `Participant`, de sa session anonyme et de son avis d'arrivée.
 *
 * Sortie de `link-admission.ts` au lot #16837, et pas pour gagner des lignes :
 * ce fichier-là DÉCIDE (lire le lien, juger l'admission, répondre) et pesait
 * 993 lignes, au ras du budget de 1 000 — toute évolution de la décision y
 * était donc payée en découpage. La CRÉATION de la ligne d'un invité est une
 * responsabilité distincte, et la plus volumineuse : permissions dérivées du
 * lien, pseudonyme automatique numéroté, jeton de session haché, poste réduit,
 * avis système.
 *
 * Les types viennent de `./link-admission` en `import type` : aucun cycle de
 * VALEUR, puisque tout ce que cette unité APPELLE vit dans d'autres modules.
 */
export async function joinAsGuest(
  prisma: PrismaClient,
  shareLink: ShareLinkWithConversation,
  profile: LinkJoinProfileInput,
  broadcast: LinkJoinBroadcast | undefined,
  requestUserAgent: string | null | undefined
): Promise<LinkJoinOutcome> {
  const firstName = SecuritySanitizer.sanitizeText(profile.firstName || '');
  const lastName = SecuritySanitizer.sanitizeText(profile.lastName || '');
  const nicknameBase =
    profile.requestedUsername && profile.requestedUsername.trim() !== ''
      ? SecuritySanitizer.sanitizeUsername(profile.requestedUsername.trim())
      : automaticNicknameBase(firstName, lastName);
  const username = await findFreeAnonymousUsername(
    prisma,
    () => numberedAnonymousUsername(nicknameBase),
    shareLink.conversationId
  );

  if (!username) {
    return { kind: 'username-taken', suggestion: numberedAnonymousUsername(automaticNicknameBase(firstName, lastName)) };
  }

  const claimed = await claimLinkUse(prisma, shareLink.id, shareLink.maxUses, {
    currentConcurrentUsers: { increment: 1 },
    currentUniqueSessions: { increment: 1 },
  });
  if (!claimed) return { kind: 'refused', refusal: LINK_EXHAUSTED_RACE };

  const sessionToken = generateSessionToken(profile.deviceFingerprint);
  const sessionTokenHash = hashSessionToken(sessionToken);

  const permissions: ParticipantPermissions = {
    canSendMessages: shareLink.allowAnonymousMessages,
    canSendFiles: shareLink.allowAnonymousFiles,
    canSendImages: shareLink.allowAnonymousImages,
    // Une vidéo EST un fichier (`classifyAnonymousAttachment`,
    // `services/attachments/ContentSignature.ts`) : elle suit le MÊME
    // drapeau que `canSendFiles`, jamais un `false` inventé par ce site.
    // La voix suit le droit d'ÉCRIRE, pas celui d'envoyer des fichiers — même
    // fonction, même décision produit, `isAudio` y retourne `{ allowed: true }`
    // sans jamais consulter `allowAnonymousFiles`/`allowAnonymousImages` (#6091).
    canSendVideos: shareLink.allowAnonymousFiles,
    canSendAudios: shareLink.allowAnonymousMessages,
    // Refus ASSUMÉS, alignés sur `NEW_MEMBER_PERMISSIONS` : le lien ne porte
    // aucun drapeau position/lien, et un visiteur n'a pas de raison d'émettre
    // l'un ou l'autre avant un geste explicite de l'hôte.
    canSendLocations: false,
    canSendLinks: false,
    canViewHistory: shareLink.allowViewHistory,
  };

  const participant = await prisma.participant.create({
    data: {
      conversationId: shareLink.conversationId,
      type: 'anonymous',
      displayName: username,
      language: profile.language,
      sessionTokenHash,
      shareLinkId: shareLink.id,
      role: 'member',
      permissions,
      anonymousSession: {
        shareLinkId: shareLink.id,
        session: {
          sessionTokenHash,
          // Aucune IP n'est conservée (#9342) : l'adresse de la requête sert
          // la seule recherche du pays, puis elle est oubliée.
          // Le pays d'arrivée vit sur `Participant.joinCountry` (#7797),
          // posé après la réponse par la vraie géolocalisation
          // (`services/conversations/arrivalCountry.ts`) — jamais par
          // l'heuristique du premier octet que #4167 a retirée.
          country: null,
          deviceFingerprint: profile.deviceFingerprint || null,
          // Le poste RÉDUIT (#10102) — nom et version majeure, jamais la
          // chaîne User-Agent. Lu par la seule fiche de modération de World Wide.
          client: describeGuestClient(requestUserAgent),
          connectedAt: new Date(),
        },
        profile: {
          firstName,
          lastName,
          username,
          email: profile.email || null,
          birthday: profile.birthday ? new Date(profile.birthday) : null,
        },
      },
    },
  });
  announceConversationLanguageChange({ kind: 'arrival', conversationId: shareLink.conversationId, language: profile.language, readerUserId: null });

  await postJoinSystemMessage(
    { prisma, broadcast },
    {
      conversationId: shareLink.conversationId,
      participantId: participant.id,
      displayName: username,
      isAnonymous: true,
      viaShareLink: true,
      username,
      givenName: [firstName, lastName].filter(Boolean).join(' ') || undefined,
      linkRules: {
        canSendMessages: shareLink.allowAnonymousMessages,
        canSendFiles: shareLink.allowAnonymousFiles,
        canSendImages: shareLink.allowAnonymousImages,
      },
    }
  );

  return {
    kind: 'joined',
    outcome: 'new',
    shareLink,
    participant,
    sessionToken,
    rights: resolveEntryRights(participant, undefined, shareLink.allowViewHistory),
  };
}
