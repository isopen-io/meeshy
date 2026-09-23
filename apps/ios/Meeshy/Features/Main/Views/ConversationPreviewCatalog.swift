import Foundation
import MeeshySDK

/// Prête au composeur de la ligne d'aperçu (`ConversationPreviewComposer`, SDK)
/// les libellés du catalogue de l'app — les sept langues de
/// `Localizable.xcstrings`, reprises clé pour clé du catalogue partagé
/// (`packages/shared/utils/conversation-preview-strings.ts`, #7546).
///
/// Une ligne par clé, en littéral : c'est ce qui permet à l'extraction Xcode et
/// à `LocalizationConsistencyTests` de voir chaque clé utilisée. Le SDK ne lit
/// jamais le catalogue de l'app ; il reçoit ces modèles bruts (jetons `{nom}`
/// compris) et fait lui-même la substitution.
nonisolated enum ConversationPreviewCatalog {

    /// La langue de cadrage : celle dans laquelle l'app répond déjà.
    static var currentLanguage: String {
        Bundle.main.preferredLocalizations.first ?? "fr"
    }

    static func strings(language: String = currentLanguage) -> ConversationPreviewStrings {
        ConversationPreviewStrings(language: language) { template($0) }
    }

    static func template(_ key: ConversationPreviewStringKey) -> String {
        switch key {
        case .lineAuthor: return String(localized: "line.author", bundle: .main)
        case .authorSelf: return String(localized: "message.author.self", bundle: .main)
        case .authorUnknown: return String(localized: "message.author.unknown", bundle: .main)
        case .conversationEmpty: return String(localized: "conversation.empty", bundle: .main)
        case .typingOne: return String(localized: "typing.one", bundle: .main)
        case .typingTwo: return String(localized: "typing.two", bundle: .main)
        case .typingMany: return String(localized: "typing.many", bundle: .main)
        case .draft: return String(localized: "draft", bundle: .main)
        case .reactionMember: return String(localized: "reaction.member", bundle: .main)
        case .reactionMemberBare: return String(localized: "reaction.member.bare", bundle: .main)
        case .reactionSelf: return String(localized: "reaction.self", bundle: .main)
        case .reactionSelfBare: return String(localized: "reaction.self.bare", bundle: .main)
        case .callActive: return String(localized: "call.active", bundle: .main)
        case .callParticipantsOne: return String(localized: "call.participants.one", bundle: .main)
        case .callParticipantsOther: return String(localized: "call.participants.other", bundle: .main)
        case .callAudio: return String(localized: "call.audio", bundle: .main)
        case .callVideo: return String(localized: "call.video", bundle: .main)
        case .callMissed: return String(localized: "call.missed", bundle: .main)
        case .callDeclined: return String(localized: "call.declined", bundle: .main)
        case .callCancelled: return String(localized: "call.cancelled", bundle: .main)
        case .callUnanswered: return String(localized: "call.unanswered", bundle: .main)
        case .callFailed: return String(localized: "call.failed", bundle: .main)
        case .attachmentVoice: return String(localized: "attachment.voice", bundle: .main)
        case .attachmentAudio: return String(localized: "attachment.audio", bundle: .main)
        case .attachmentVideo: return String(localized: "attachment.video", bundle: .main)
        case .attachmentPhoto: return String(localized: "attachment.photo", bundle: .main)
        case .attachmentFile: return String(localized: "attachment.file", bundle: .main)
        case .attachmentLocation: return String(localized: "attachment.location", bundle: .main)
        case .attachmentSticker: return String(localized: "attachment.sticker", bundle: .main)
        case .attachmentVoiceMany: return String(localized: "attachment.voice.many", bundle: .main)
        case .attachmentAudioMany: return String(localized: "attachment.audio.many", bundle: .main)
        case .attachmentVideoMany: return String(localized: "attachment.video.many", bundle: .main)
        case .attachmentPhotoMany: return String(localized: "attachment.photo.many", bundle: .main)
        case .attachmentFileMany: return String(localized: "attachment.file.many", bundle: .main)
        case .attachmentMixedMany: return String(localized: "attachment.mixed.many", bundle: .main)
        case .detailPagesOne: return String(localized: "detail.pages.one", bundle: .main)
        case .detailPagesOther: return String(localized: "detail.pages.other", bundle: .main)
        case .protectionViewOnce: return String(localized: "protection.viewOnce", bundle: .main)
        case .protectionViewOnceOpened: return String(localized: "protection.viewOnce.opened", bundle: .main)
        case .protectionExpired: return String(localized: "protection.expired", bundle: .main)
        case .protectionHidden: return String(localized: "protection.hidden", bundle: .main)
        case .protectionHiddenHint: return String(localized: "protection.hidden.hint", bundle: .main)
        case .protectionEncrypted: return String(localized: "protection.encrypted", bundle: .main)
        case .effectCount: return String(localized: "effect.count", bundle: .main)
        case .effectShake: return String(localized: "effect.shake", bundle: .main)
        case .effectZoom: return String(localized: "effect.zoom", bundle: .main)
        case .effectExplode: return String(localized: "effect.explode", bundle: .main)
        case .effectConfetti: return String(localized: "effect.confetti", bundle: .main)
        case .effectFireworks: return String(localized: "effect.fireworks", bundle: .main)
        case .effectWaoo: return String(localized: "effect.waoo", bundle: .main)
        case .effectGlow: return String(localized: "effect.glow", bundle: .main)
        case .effectPulse: return String(localized: "effect.pulse", bundle: .main)
        case .effectRainbow: return String(localized: "effect.rainbow", bundle: .main)
        case .effectSparkle: return String(localized: "effect.sparkle", bundle: .main)
        case .systemMemberAdded: return String(localized: "system.member.added", bundle: .main)
        case .systemMemberRemoved: return String(localized: "system.member.removed", bundle: .main)
        case .systemMemberLeft: return String(localized: "system.member.left", bundle: .main)
        case .systemMemberJoined: return String(localized: "system.member.joined", bundle: .main)
        case .systemConversationRenamed: return String(localized: "system.conversation.renamed", bundle: .main)
        case .systemConversationImage: return String(localized: "system.conversation.image", bundle: .main)
        case .systemEncryptionE2EE: return String(localized: "system.encryption.e2ee", bundle: .main)
        case .systemEncryptionEnabled: return String(localized: "system.encryption.enabled", bundle: .main)
        case .systemGeneric: return String(localized: "system.generic", bundle: .main)
        case .unitSecond: return String(localized: "unit.second", bundle: .main)
        case .unitMinute: return String(localized: "unit.minute", bundle: .main)
        case .unitHour: return String(localized: "unit.hour", bundle: .main)
        case .unitDay: return String(localized: "unit.day", bundle: .main)
        }
    }
}
