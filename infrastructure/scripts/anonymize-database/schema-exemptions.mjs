// Le balayage FERMÉ du schéma. Chaque champ texte, liste de textes, JSON ou
// binaire de chaque modèle et de chaque type composite de
// `packages/shared/prisma/schema.prisma` doit être CLASSÉ : traité par
// l'inventaire (inventory.mjs), couvert par le champ qui l'embarque
// (NESTED_COVERAGE), exempté comme nom de secret (SECRET_EXEMPTIONS), ou
// exempté ICI avec sa raison. Un champ ajouté au schéma sans classement fait
// rougir le témoin — c'est voulu : un nouveau champ texte est réputé personnel
// tant qu'on n'a pas écrit pourquoi il ne l'est pas.
//
// Un modèle purgé en entier (`purge` sans filtre) couvre tous ses champs.

const LANGUAGE = 'code de langue ou de locale (ISO), choisi dans une liste';
const COUNTRY = 'pays (ISO) ou fuseau horaire : granularité pays, gardée — c’est une pseudonymisation (README)';
const ENUM = 'énumération ou état technique fixé par le code, jamais saisi par un utilisateur';
const TECHNICAL_ID = 'identifiant technique (UUID client, clé de requête, identifiant de groupe), ni secret ni personnel';
const DAY = 'jour civil ou heure technique (AAAA-MM-JJ, HH:MM) d’un réglage ou d’un jeu';
const EMOJI = 'emoji, icône ou couleur choisis dans une palette';
const COUNTS = 'agrégat numérique (compteurs par emoji, jour, heure ou langue, segments lus) : nombres sous clés techniques';
const DEVICE = 'description grossière de l’appareil ou du navigateur (famille, version, résolution) : IP, empreinte, agent complet et nom d’appareil sont remplacés';
const EDITORIAL = 'contenu éditorial écrit par l’équipe (campagne, annonce, catalogue, configuration), sans utilisateur';

const withReason = (reason, ...fields) => Object.fromEntries(fields.map((f) => [f, reason]));

export const FIELD_EXEMPTIONS = Object.freeze({
  ...withReason(LANGUAGE,
    'User.systemLanguage', 'User.regionalLanguage', 'User.customDestinationLanguage', 'User.deviceLocale', 'Participant.language',
    'Message.originalLanguage', 'MessageAttachment.captionLanguage', 'MessageStatusEntry.viewedLanguages', 'AttachmentStatusEntry.viewedLanguages',
    'ConversationShareLink.allowedLanguages', 'AdminBroadcast.sourceLanguage', 'AdminBroadcast.targetLanguages', 'Transcription.language',
    'TranslationCall.targetLanguage', 'Post.originalLanguage', 'Post.detectedLanguage', 'Sound.sourceLanguage', 'PostMedia.captionLanguage',
    'PostMedia.altLanguage', 'PostMedia.language', 'PostComment.originalLanguage', 'AtlasStamp.language', 'TrackingLinkClick.language',
    'TrackingLinkClick.languages'),
  ...withReason(COUNTRY,
    'User.timezone', 'User.deviceCountry', 'User.registrationCountry', 'AnonymousSessionDetails.country', 'Participant.joinCountry',
    'ConversationShareLink.allowedCountries', 'TrackingLinkClick.country', 'TrackingLinkClick.timezone', 'UserSession.country',
    'UserSession.timezone', 'LeagueGroupWeek.timezone'),
  ...withReason(ENUM,
    'User.onboardingSteps', 'User.guideSeen', 'User.publicLeagueConsentVersion', 'User.termsVersion', 'UserContact.matchedBy',
    'Conversation.type', 'Conversation.defaultWriteRole', 'Conversation.encryptionMode', 'Conversation.encryptionProtocol',
    'Participant.type', 'Participant.role', 'Message.messageType', 'Message.messageSource', 'Message.encryptionMode',
    'MessageAttachment.mimeType', 'MessageAttachment.scanStatus', 'MessageAttachment.moderationStatus', 'MessageAttachment.encryptionMode',
    'FriendRequest.status', 'Notification.type', 'Notification.priority', 'CommunityMember.role', 'UserPreference.valueType',
    'ConversationPreference.valueType', 'AffiliateRelation.status', 'TrackingLinkClick.redirectStatus', 'TrackingLinkClick.socialSource',
    'TrackingLinkClick.connectionType', 'TrackingLinkClick.platform', 'AdminAuditLog.action', 'AdminAuditLog.entity', 'AdminBroadcast.status',
    'Report.reportedType', 'Report.reportType', 'Report.status', 'CallSession.networkQuality', 'CallRecording.stopReason', 'CallRecording.kind',
    'TranslationCall.model', 'UserConversationPreferences.readingMode', 'UserCommunityPreferences.notificationLevel', 'SecurityEvent.eventType',
    'SecurityEvent.severity', 'SecurityEvent.status', 'UserSession.loginMethod', 'UserSession.invalidatedReason', 'UserVoiceModel.embeddingModel',
    'UserVoiceModel.voiceAnalysisModel', 'Post.geoPrecision', 'Sound.mimeType', 'PostMedia.mimeType', 'PostImpression.source',
    'PostEngagement.contentType', 'PostEngagement.surface', 'PostEngagement.consent', 'PostMediaDownload.surface', 'AgentConfig.currentNode',
    'AgentConfig.agentType', 'AgentConfig.excludedRoles', 'AgentConfig.eligibleConversationTypes', 'AgentConfig.freshTopicCategoryHints',
    'AgentConfig.freshTopicBlockedSlugs', 'AgentUserRole.origin', 'AgentLlmConfig.provider', 'AgentLlmConfig.model',
    'AgentLlmConfig.fallbackProvider', 'AgentLlmConfig.fallbackModel', 'AgentGlobalConfig.defaultProvider', 'AgentGlobalConfig.defaultModel',
    'AgentGlobalConfig.fallbackProvider', 'AgentGlobalConfig.fallbackModel', 'AgentGlobalConfig.eligibleConversationTypes', 'MutationLog.kind',
    'EngagementMilestone.milestoneType', 'MeeshLedger.reason', 'GloryLedger.reason', 'DailyMission.difficulty', 'DailyMission.signal',
    'DailyMission.seen', 'GameProfile.showcaseVisibility', 'GameProfile.rankVisibility', 'GameProfile.treasuryVisibility',
    'GameProfile.atlasVisibility', 'GameProfile.showcaseOrder', 'LeaguePseudonym.kind', 'LeagueGroupWeek.league', 'LeagueMembership.league',
    'LeagueMembership.zone', 'LeagueMembership.cup', 'GameDuo.status', 'GameDuo.signal', 'GameDuo.inviterSeen', 'GameDuo.inviteeSeen',
    'AchievementRarityStat.rarity', 'UserSticker.origin', 'UserSticker.mimeType', 'StickerPack.status', 'StickerPackItem.kind',
    'StickerPackItem.mimeType'),
  ...withReason(TECHNICAL_ID,
    'Message.clientMessageId', 'PostInteractiveResponse.objectId', 'AdminAuditLog.entityId', 'Transcription.segmentId', 'SoundUsage.trackId',
    'UserVoiceModel.profileId', 'MutationLog.clientMutationId', 'MutationLog.resultId', 'MeeshLedger.requestId', 'GloryLedger.requestId',
    'LeagueGroupWeek.groupId', 'LeagueMembership.groupId', 'AgentUserRole.archetypeId'),
  ...withReason(DAY,
    'User.lastRelightDay', 'User.brokenStreakLastDay', 'LeagueGroupWeek.snapshotDay', 'AtlasStamp.stampedOn',
    'NotificationPreference.dndStartTime', 'NotificationPreference.dndEndTime'),
  ...withReason(EMOJI,
    'AttachmentReaction.emoji', 'Reaction.emoji', 'CommentReaction.emoji', 'PostReaction.emoji', 'Post.moodEmoji',
    'UserConversationPreferences.reaction', 'UserConversationCategory.icon', 'UserConversationCategory.color', 'StickerPackItem.emoji'),
  ...withReason(COUNTS,
    'Message.reactionSummary', 'AttachmentStatusEntry.listenSegments', 'AttachmentStatusEntry.watchSegments', 'CallSession.reactionCounts',
    'Post.reactionSummary', 'PostComment.reactionSummary', 'ConversationMessageStats.dailyActivity',
    'ConversationMessageStats.hourlyDistribution', 'ConversationMessageStats.languageDistribution', 'ConversationEngagement.dayCounts'),
  ...withReason(DEVICE,
    'UserSession.deviceType', 'UserSession.deviceVendor', 'UserSession.deviceModel', 'UserSession.osName', 'UserSession.osVersion',
    'UserSession.browserName', 'UserSession.browserVersion', 'UserSession.appVersion', 'UserSession.appBuild', 'UserSession.platform',
    'MessageStatusEntry.clientVersion', 'TrackingLinkClick.browser', 'TrackingLinkClick.os', 'TrackingLinkClick.device',
    'TrackingLinkClick.screenResolution', 'TrackingLinkClick.viewportSize'),
  ...withReason(EDITORIAL,
    'TrackingLink.campaign', 'TrackingLink.source', 'TrackingLink.medium', 'AdminBroadcast.name', 'AdminBroadcast.subject',
    'AdminBroadcast.body', 'AdminBroadcast.targeting', 'AdminBroadcast.translatedSubjects', 'AdminBroadcast.translatedBodies',
    'AgentGlobalConfig.systemPrompt', 'AgentTopicCatalog.slug', 'AgentTopicCatalog.label', 'AgentTopicCatalog.description',
    'AgentTopicCatalog.instructionTemplate', 'AgentTopicCatalog.searchHintTemplate', 'AgentTopicCatalog.examples',
    'EngagementScaleConfig.config'),
  'StickerPackItem.zones': 'géométrie des zones interactives d’un sticker (nombres), sans texte',
  'LeaguePseudonym.pseudonym': 'pseudonyme GÉNÉRÉ par le jeu à partir d’un lexique, déjà un alias, jamais saisi',
});
