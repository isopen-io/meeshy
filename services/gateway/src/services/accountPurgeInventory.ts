/**
 * L'INVENTAIRE de la purge d'un compte (#4225) : pour chaque modèle du schéma
 * qui désigne un compte, son verdict et celui qui l'applique.
 *
 * Le principe (`decisions/suppression-de-compte-ce-qui-part-ce-qui-reste-anonymise-ce-qui-survit-4225.md`) :
 * ce qui identifie la personne part ; ce qu'elle a contribué à l'espace
 * d'autrui reste, sans son nom (la ligne `User` devient une pierre tombale) ;
 * ce qui prouve qu'on a bien effacé, ou qu'une action d'administration a eu
 * lieu, survit.
 *
 * Un témoin (`AccountPurgeInventory.test.ts`) confronte cet inventaire au
 * schéma : un modèle qui porte une référence de compte sans y figurer — ni ici,
 * ni à `GAME_PURGED_MODELS` / `GAME_PURGE_EXCEPTIONS` — fait tomber la suite.
 * Un second témoin vérifie que `purgeAccountIsolatedData` supprime bien chaque
 * table qui lui est attribuée, par le champ déclaré.
 *
 * `pending` dit une purge décidée et pas encore livrée, avec sa raison : la
 * liste est explicite, jamais silencieuse.
 */

import { ACCOUNT_SCOPED_MODELS } from './accountScopedErasure';

export type AccountPurgeVerdict =
  | { readonly verdict: 'effacer'; readonly by: 'purgeAccountIsolatedData'; readonly fields: readonly string[] }
  | { readonly verdict: 'effacer'; readonly by: string }
  | { readonly verdict: 'effacer'; readonly pending: string }
  | { readonly verdict: 'anonymiser'; readonly by: string }
  | { readonly verdict: 'conserver'; readonly reason: string };

const direct = (...fields: readonly string[]): AccountPurgeVerdict => ({ verdict: 'effacer', by: 'purgeAccountIsolatedData', fields });
const erasedBy = (by: string): AccountPurgeVerdict => ({ verdict: 'effacer', by });
const pending = (reason: string): AccountPurgeVerdict => ({ verdict: 'effacer', pending: reason });
const tombstone: AccountPurgeVerdict = { verdict: 'anonymiser', by: 'anonymizeUserIdentity — la ligne reste, son auteur devient la pierre tombale' };
const kept = (reason: string): AccountPurgeVerdict => ({ verdict: 'conserver', reason });

export const ACCOUNT_PURGE_INVENTORY: Readonly<Record<string, AccountPurgeVerdict>> = {
  user: { verdict: 'anonymiser', by: 'anonymizeUserIdentity' },

  userSession: direct('userId'),
  pushToken: direct('userId'),
  userVoiceModel: direct('userId'),
  notification: direct('userId'),
  storyHighlight: direct('ownerId'),
  communityJoinRequest: direct('userId'),
  bloodLocationPoint: direct('ownerId'),
  bloodLocationConsultation: direct('observedId', 'observerId'),
  userRelation: direct('userLowId', 'userHighId'),
  pairInteractionDay: direct('userLowId', 'userHighId'),
  relationFeatureSetting: direct('ownerId', 'otherId'),
  friendRequest: direct('senderId', 'receiverId'),
  ...Object.fromEntries(ACCOUNT_SCOPED_MODELS.map((delegate) => [delegate, direct('userId')])),

  conversationShareLink: erasedBy('deleteShareLinksRevokingGuests'),
  userContact: erasedBy('eraseAddressBookOf'),
  profileAddress: erasedBy('eraseProfileAddressesOf'),
  profileLinkVisitDay: erasedBy('eraseProfileLinkVisitsOf'),
  emailInvitation: erasedBy('eraseSentInvitationsOf'),
  e2EEDevice: erasedBy('eraseE2EEDataOfUser'),
  e2EEOneTimePreKey: erasedBy('eraseE2EEDataOfUser'),
  e2EERevokedIdentity: erasedBy('eraseE2EEDataOfUser'),
  e2EEBindingProof: erasedBy('eraseE2EEDataOfUser'),
  e2EEDeviceVerificationMessage: erasedBy('eraseE2EEDataOfUser'),
  postView: erasedBy('eraseReadingTelemetryOf'),
  postImpression: erasedBy('eraseReadingTelemetryOf'),
  postEngagement: erasedBy('eraseReadingTelemetryOf'),
  contentEvent: erasedBy('eraseReadingTelemetryOf'),
  userSticker: erasedBy('purgePackData'),
  userStickerPack: erasedBy('purgePackData'),
  userPackOwnership: erasedBy('purgePackData'),
  partnerProfile: erasedBy('purgePackData'),
  contactJoinNotice: erasedBy('eraseAddressBookOf'),
  externalConversationPeer: erasedBy('eraseExternalPeerHandlesOpenedBy'),
  sharedTranslation: erasedBy('eraseSharedTranslationsOfAccount'),
  messageAttachment: erasedBy('purgeMediaOfDeletedAccount'),
  messageEnvelope: erasedBy('eraseE2EEDataOfUser'),
  stickerPack: { verdict: 'anonymiser', by: 'purgePackData — brouillons effacés, publiés signés « compte supprimé » ; reviewerId reste, trace de modération' },
  communityAppearancePack: { verdict: 'anonymiser', by: 'purgePackData — brouillons effacés, publiés signés « compte supprimé » ; reviewerId reste, trace de modération' },
  lensPack: { verdict: 'anonymiser', by: 'purgePackData — brouillons effacés, publiés signés « compte supprimé » ; reviewerId reste, trace de modération' },

  post: pending("ses publications propres (et leurs commentaires) restent : seuls leurs médias partent (purgeMediaOfDeletedAccount) — leur suppression doit reprendre celle d'un auteur vivant, compteurs et flux compris"),
  signalPreKeyBundle: pending("matériel cryptographique public : la suppression passe par l'agent auditeur-adversarial avant d'être câblée"),
  conversationPublicKey: pending("clé publique par conversation : un pair peut encore en avoir besoin pour vérifier l'historique, revue cryptographique requise"),
  dMASession: pending("état de session Signal de l'interopérabilité DMA : sa fin doit prévenir la passerelle tierce, chantier #17007"),
  affiliateToken: pending("ses jetons de parrainage restent actifs : un lien partagé continuerait de créditer un compte effacé"),
  callRecording: pending("requesterId, requiredUserIds, consentedUserIds et stoppedByUserId nomment encore le compte : le consentement d'un enregistrement que les autres gardent doit se dépersonnaliser sans fausser sa preuve"),
  agentConfig: pending("manualUserIds, excludedUserIds et triggerFromUserIds gardent l'identifiant : la lecture (getControlledUsers, participation vivante) empêche l'agent de parler à sa place, l'écriture ne le retire pas"),
  agentScanLog: pending("controlledUserIds et userIdsUsed du journal de l'animateur gardent l'identifiant du compte effacé"),
  preKey: pending("usedBy d'une pré-clé de l'enrôlement DMA nomme le compte qui l'a consommée : suit la fin de session DMA, chantier #17007"),
  affiliateRelation: pending("la paire parrain / filleul ne désigne plus personne d'un côté : effacer ou dépersonnaliser, comme affiliateVisitSession"),

  message: { verdict: 'anonymiser', by: 'anonymizeMessagesOfDeletedAccount' },
  communityMember: { verdict: 'anonymiser', by: 'deactivateCommunityMembershipsOfDeletedAccount' },
  participant: tombstone,
  conversation: tombstone,
  conversationShare: tombstone,
  commentReaction: tombstone,
  postReaction: tombstone,
  postComment: tombstone,
  postInteractiveResponse: tombstone,
  mention: tombstone,
  commentMention: tombstone,
  postMention: tombstone,
  community: tombstone,
  callSession: tombstone,
  callCaptureEvent: tombstone,
  sound: tombstone,
  trackingLink: tombstone,

  accountDeletionRequest: kept('le journal de la purge elle-même : sans lui, on ne peut plus démontrer qu\'on a effacé'),
  adminAuditLog: kept("la preuve d'une action d'administration ne s'efface pas sur demande de son sujet"),
  securityEvent: kept('journal de sécurité, avec sa propre durée de rétention'),
  ban: kept('la sanction de modération et sa raison prouvent une décision prise, comme le journal d\'administration'),
  report: kept('un signalement et son traitement sont une preuve de modération, pour le signalant comme pour le modérateur'),
  serverEncryptionKey: kept('la clé de la conversation PARTAGÉE (une par conversation) : l\'effacer rendrait illisibles les pièces des autres participants ; userId n\'y nomme que son créateur, devenu pierre tombale'),
  adminBroadcast: kept("createdById / sentById / inAppSentById nomment l'administrateur qui a diffusé : preuve d'une action d'administration"),
  agentLlmConfig: kept("configuredBy nomme l'administrateur qui a réglé le modèle : preuve d'une action d'administration"),
  engagementScaleConfig: kept("updatedById nomme l'administrateur qui a réglé le barème : preuve d'une action d'administration"),
  gameSeasonDefinition: kept("updatedBy nomme l'administrateur qui a publié la saison : preuve d'une action d'administration"),
  gameSeasonProposal: kept("createdBy / reviewedBy nomment l'équipe qui a proposé et relu la saison : preuve d'une action d'administration"),
  packRegistryEntry: kept("updatedBy nomme l'administrateur qui a tenu le registre des packs : preuve d'une action d'administration"),
  engagementCounter: kept('agrégat de compteurs non identifiant, gardé par décision avec engagementScore (#5691)'),
};

export type DirectErasure = Extract<AccountPurgeVerdict, { readonly fields: readonly string[] }>;

/** Les tables que `purgeAccountIsolatedData` supprime elle-même, par les champs déclarés. */
export function isDirectErasure(verdict: AccountPurgeVerdict): verdict is DirectErasure {
  return 'fields' in verdict;
}

export function accountPurgeVerdictOf(delegate: string): AccountPurgeVerdict | undefined {
  return Object.prototype.hasOwnProperty.call(ACCOUNT_PURGE_INVENTORY, delegate) ? ACCOUNT_PURGE_INVENTORY[delegate] : undefined;
}
