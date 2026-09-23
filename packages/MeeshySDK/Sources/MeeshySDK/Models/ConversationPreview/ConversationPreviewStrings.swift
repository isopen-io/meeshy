import Foundation

// Le CADRAGE de la ligne d'aperçu — les clés de libellés et les formats de
// nombre, miroir de `packages/shared/utils/conversation-preview-strings.ts`.
//
// Le SDK ne porte AUCUN texte : il nomme les clés, et l'app lui prête ses
// libellés (`Localizable.xcstrings`, sept langues). Les modèles de libellé
// gardent les jetons `{nom}` du catalogue partagé ; la substitution vit ici,
// une fois, pour que le texte rendu soit le même que celui du web.

public enum ConversationPreviewStringKey: String, Sendable, CaseIterable {
    case lineAuthor = "line.author"
    case authorSelf = "message.author.self"
    case authorUnknown = "message.author.unknown"
    case conversationEmpty = "conversation.empty"
    case typingOne = "typing.one"
    case typingTwo = "typing.two"
    case typingMany = "typing.many"
    case draft = "draft"
    case reactionMember = "reaction.member"
    case reactionMemberBare = "reaction.member.bare"
    case reactionSelf = "reaction.self"
    case reactionSelfBare = "reaction.self.bare"
    case callActive = "call.active"
    case callParticipantsOne = "call.participants.one"
    case callParticipantsOther = "call.participants.other"
    case callAudio = "call.audio"
    case callVideo = "call.video"
    case callMissed = "call.missed"
    case callDeclined = "call.declined"
    case callCancelled = "call.cancelled"
    case callUnanswered = "call.unanswered"
    case callFailed = "call.failed"
    case attachmentVoice = "attachment.voice"
    case attachmentAudio = "attachment.audio"
    case attachmentVideo = "attachment.video"
    case attachmentPhoto = "attachment.photo"
    case attachmentFile = "attachment.file"
    case attachmentLocation = "attachment.location"
    case attachmentSticker = "attachment.sticker"
    case attachmentVoiceMany = "attachment.voice.many"
    case attachmentAudioMany = "attachment.audio.many"
    case attachmentVideoMany = "attachment.video.many"
    case attachmentPhotoMany = "attachment.photo.many"
    case attachmentFileMany = "attachment.file.many"
    case attachmentMixedMany = "attachment.mixed.many"
    case detailPagesOne = "detail.pages.one"
    case detailPagesOther = "detail.pages.other"
    case protectionViewOnce = "protection.viewOnce"
    case protectionViewOnceOpened = "protection.viewOnce.opened"
    case protectionExpired = "protection.expired"
    case protectionHidden = "protection.hidden"
    case protectionHiddenHint = "protection.hidden.hint"
    case protectionEncrypted = "protection.encrypted"
    case effectCount = "effect.count"
    case effectShake = "effect.shake"
    case effectZoom = "effect.zoom"
    case effectExplode = "effect.explode"
    case effectConfetti = "effect.confetti"
    case effectFireworks = "effect.fireworks"
    case effectWaoo = "effect.waoo"
    case effectGlow = "effect.glow"
    case effectPulse = "effect.pulse"
    case effectRainbow = "effect.rainbow"
    case effectSparkle = "effect.sparkle"
    case systemMemberAdded = "system.member.added"
    case systemMemberRemoved = "system.member.removed"
    case systemMemberLeft = "system.member.left"
    case systemMemberJoined = "system.member.joined"
    case systemConversationRenamed = "system.conversation.renamed"
    case systemConversationImage = "system.conversation.image"
    case systemEncryptionE2EE = "system.encryption.e2ee"
    case systemEncryptionEnabled = "system.encryption.enabled"
    case systemGeneric = "system.generic"
    case unitSecond = "unit.second"
    case unitMinute = "unit.minute"
    case unitHour = "unit.hour"
    case unitDay = "unit.day"
}

/// Les sept langues du catalogue ; toute autre retombe sur le français, comme
/// `normalizeConversationPreviewLanguage`.
public enum ConversationPreviewLanguage: String, Sendable, CaseIterable {
    case fr, en, es, pt, de, it, ar

    public init(code: String?) {
        let base = code.map { MeeshyUser.normalizeLanguageForDedup($0) }?
            .split(separator: "-").first.map { String($0) } ?? ""
        self = ConversationPreviewLanguage(rawValue: base) ?? .fr
    }

    var decimalSeparator: String {
        switch self {
        case .en, .ar: return "."
        case .fr, .es, .pt, .de, .it: return ","
        }
    }
}

/// Les libellés prêtés au composeur, dans UNE langue de cadrage.
///
/// `template` rend le modèle BRUT d'une clé (jetons `{nom}` compris) ; la
/// substitution est faite ici, jamais par l'appelant.
public struct ConversationPreviewStrings: Sendable {
    public let language: ConversationPreviewLanguage
    private let template: @Sendable (ConversationPreviewStringKey) -> String

    public init(language: String, template: @escaping @Sendable (ConversationPreviewStringKey) -> String) {
        self.language = ConversationPreviewLanguage(code: language)
        self.template = template
    }

    public func callAsFunction(_ key: ConversationPreviewStringKey, _ params: [String: String] = [:]) -> String {
        Self.substitute(template(key), params)
    }

    /// `{jeton}` → sa valeur ; un jeton sans valeur disparaît, comme au web.
    static func substitute(_ template: String, _ params: [String: String]) -> String {
        var output = ""
        var index = template.startIndex
        while index < template.endIndex {
            guard template[index] == "{",
                  let close = template[index...].firstIndex(of: "}"),
                  case let token = template[template.index(after: index)..<close],
                  !token.isEmpty,
                  token.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "_" })
            else {
                output.append(template[index])
                index = template.index(after: index)
                continue
            }
            output += params[String(token)] ?? ""
            index = template.index(after: close)
        }
        return output
    }

    /// Poids d'un fichier : « 48 Ko », « 4,2 Mo » en français ; « 4.2 MB » en
    /// anglais. Une décimale sous dix unités, aucune au-delà, jamais de « ,0 ».
    public func fileSize(_ bytes: Double) -> String {
        let french = language == .fr
        let (b, kb, mb, gb) = french ? ("o", "Ko", "Mo", "Go") : ("B", "KB", "MB", "GB")
        if bytes < 1024 { return "\(Int(max(0, bytes).rounded())) \(b)" }
        let kilo = bytes / 1024
        if kilo.rounded() < 1024 { return "\(Int(kilo.rounded())) \(kb)" }
        let mega = kilo / 1024
        if (mega * 10).rounded() / 10 < 1024 { return "\(oneDecimal(mega)) \(mb)" }
        return "\(oneDecimal(mega / 1024)) \(gb)"
    }

    private func oneDecimal(_ value: Double) -> String {
        if value >= 10 { return String(Int(value.rounded())) }
        let tenths = Int((value * 10).rounded())
        let whole = tenths / 10
        let fraction = tenths % 10
        return fraction == 0 ? "\(whole)" : "\(whole)\(language.decimalSeparator)\(fraction)"
    }

    /// Temps restant d'un éphémère, arrondi à l'unité SUPÉRIEURE : « 4 min »
    /// de 3:01 à 4:00, jamais « 3 min » quand il en reste plus de trois.
    public func remaining(milliseconds: Double) -> String {
        let seconds = max(1, Int((milliseconds / 1000).rounded(.up)))
        if seconds < 60 { return self(.unitSecond, ["count": String(seconds)]) }
        let minutes = Int((Double(seconds) / 60).rounded(.up))
        if minutes < 60 { return self(.unitMinute, ["count": String(minutes)]) }
        let hours = Int((Double(minutes) / 60).rounded(.up))
        if hours < 24 { return self(.unitHour, ["count": String(hours)]) }
        return self(.unitDay, ["count": String(Int((Double(hours) / 24).rounded(.up)))])
    }

    /// Horloge `m:ss` / `h:mm:ss` — miroir de `formatClock`.
    public static func clock(seconds totalSeconds: Double) -> String {
        let safe = totalSeconds.isFinite ? max(0, totalSeconds) : 0
        let totalMs = Int((safe * 1000).rounded(.down))
        let hours = totalMs / 3_600_000
        let minutes = (totalMs % 3_600_000) / 60_000
        let seconds = (totalMs % 60_000) / 1000
        let pad: (Int) -> String = { $0 < 10 ? "0\($0)" : "\($0)" }
        let head = hours > 0 ? "\(hours):\(pad(minutes))" : "\(minutes)"
        return "\(head):\(pad(seconds))"
    }
}
