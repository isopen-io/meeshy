import Foundation

/// Ce qu'un dernier message DÉCLARE de sa protection, et l'ordre dans lequel
/// la ligne les honore — miroir de `protectionOf` + `messageProtection` +
/// `ephemeralDeadline` (`packages/shared/utils/`).
///
/// La protection se lit aux DEUX niveaux qui la déclarent — le message et sa
/// pièce jointe — et par deux canaux, les colonnes et le bitfield
/// `effectFlags` : un OU, jamais une cascade (fail-closed).
enum ConversationPreviewProtection: Equatable {
    case none
    case expired
    case viewOnce
    case hidden
    case encrypted
    /// `expiresAt` : l'échéance connue (servie ou réception + durée) ;
    /// `durationSeconds` : l'expéditeur dont personne n'a encore reçu le
    /// message voit sa DURÉE, sans décompte (#7451).
    case ephemeral(expiresAt: Date?, durationSeconds: Int?)

    private struct Flags {
        let ephemeral: Bool
        let viewOnce: Bool
        let blurred: Bool
        let encrypted: Bool

        init(isEncrypted: Bool?, isViewOnce: Bool?, isBlurred: Bool?, effectFlags: Int?,
             expiresAt: Date? = nil, ephemeralDuration: Int? = nil) {
            let flags = MessageEffectFlags(rawValue: UInt32(truncatingIfNeeded: effectFlags ?? 0))
            ephemeral = expiresAt != nil || (ephemeralDuration ?? 0) > 0 || flags.contains(.ephemeral)
            viewOnce = isViewOnce == true || flags.contains(.viewOnce)
            blurred = isBlurred == true || flags.contains(.blurred)
            encrypted = isEncrypted == true
        }
    }

    private enum Deadline {
        case none
        case awaitingReception(durationSeconds: Int)
        case scheduled(Date)
    }

    /// L'échéance d'un éphémère : la plus PROCHE de l'échéance servie et de la
    /// réception locale + durée — montrer le message un instant de moins que
    /// promis, jamais un instant de plus. La réception ne vaut que pour un
    /// destinataire : l'expéditeur n'a d'échéance que servie.
    private static func deadline(
        durationSeconds rawDuration: Int?, served: Date?, receivedAt: Date?, isMine: Bool
    ) -> Deadline {
        let duration = rawDuration.flatMap { $0 > 0 ? $0 : nil }
        let local: Date? = {
            guard !isMine, let duration, let receivedAt else { return nil }
            return receivedAt.addingTimeInterval(TimeInterval(duration))
        }()
        switch (served, local) {
        case let (served?, local?): return .scheduled(min(served, local))
        case let (served?, nil): return .scheduled(served)
        case let (nil, local?): return .scheduled(local)
        case (nil, nil): return duration.map { Deadline.awaitingReception(durationSeconds: $0) } ?? Deadline.none
        }
    }

    static func guardOf(_ message: ConversationPreviewMessage, _ input: ConversationPreviewInput) -> ConversationPreviewProtection {
        let flags = Flags(
            isEncrypted: message.isEncrypted, isViewOnce: message.isViewOnce, isBlurred: message.isBlurred,
            effectFlags: message.effectFlags, expiresAt: message.expiresAt,
            ephemeralDuration: message.ephemeralDuration
        )
        let attachment = Flags(
            isEncrypted: nil, isViewOnce: message.attachment?.isViewOnce,
            isBlurred: message.attachment?.isBlurred, effectFlags: message.attachment?.effectFlags
        )
        let due: Deadline = flags.ephemeral
            ? deadline(
                durationSeconds: message.ephemeralDuration,
                served: message.expiresAt,
                receivedAt: input.receivedAt,
                isMine: ConversationPreviewComposer.isReader(message, viewerId: input.viewerId)
            )
            : Deadline.none

        if case .scheduled(let expiresAt) = due, expiresAt <= input.now { return .expired }
        if flags.viewOnce || attachment.viewOnce { return .viewOnce }
        if flags.blurred || attachment.blurred { return .hidden }
        if flags.encrypted { return .encrypted }
        guard flags.ephemeral else { return .none }
        switch due {
        case .scheduled(let expiresAt): return .ephemeral(expiresAt: expiresAt, durationSeconds: nil)
        case .awaitingReception(let seconds): return .ephemeral(expiresAt: nil, durationSeconds: seconds)
        case .none: return .ephemeral(expiresAt: nil, durationSeconds: nil)
        }
    }
}

/// Le corps d'un message lisible : `segments` pour une ligne dont l'icône porte
/// la nature (📷 Photo · …), `labelled` pour une ligne dont l'icône est prise
/// par une protection (🔥 4 min · Photo · …), où la nature doit se dire en mots.
struct ConversationPreviewBody {
    let icon: ConversationPreviewIcon?
    let segments: [ConversationPreviewSegment]
    let labelled: [ConversationPreviewSegment]

    private enum AttachmentKind {
        case voice, audio, video, photo, file

        var icon: ConversationPreviewIcon {
            switch self {
            case .voice: return .voice
            case .audio: return .audio
            case .video: return .video
            case .photo: return .photo
            case .file: return .file
            }
        }

        var one: ConversationPreviewStringKey {
            switch self {
            case .voice: return .attachmentVoice
            case .audio: return .attachmentAudio
            case .video: return .attachmentVideo
            case .photo: return .attachmentPhoto
            case .file: return .attachmentFile
            }
        }

        var many: ConversationPreviewStringKey {
            switch self {
            case .voice: return .attachmentVoiceMany
            case .audio: return .attachmentAudioMany
            case .video: return .attachmentVideoMany
            case .photo: return .attachmentPhotoMany
            case .file: return .attachmentFileMany
            }
        }
    }

    /// Le texte d'un message, servi par le Prisme ; `nil` sans texte.
    static func servedText(_ message: ConversationPreviewMessage, _ input: ConversationPreviewInput) -> ConversationPreviewSegment? {
        guard let content = message.content, ConversationPreviewComposer.hasText(content) else { return nil }
        let served = PrismTranslationResolver.resolve(
            originalLanguage: message.originalLanguage,
            translations: message.translations ?? [:],
            preferredLanguages: input.preferredLanguages
        )
        if let served { return .text(ConversationPreviewComposer.trimmed(served.text), language: served.language) }
        return .text(ConversationPreviewComposer.trimmed(content), language: nil)
    }

    private static let voiceNamePrefixes = ["voice", "vocal", "audio", "recording", "record", "enregistrement"]

    /// Un audio est un VOCAL sauf s'il porte un nom de fichier qui n'en est
    /// pas un (`nom.mp3`) — même règle que `attachmentKindOf`.
    private static func isVoiceName(_ name: String) -> Bool {
        let lowered = name.lowercased()
        return voiceNamePrefixes.contains { prefix in
            guard lowered.hasPrefix(prefix) else { return false }
            let rest = lowered.dropFirst(prefix.count)
            return rest.first.map { "-_ .".contains($0) } ?? false
        }
    }

    private static func kindOf(_ attachment: ConversationPreviewAttachment?, messageType: String?) -> AttachmentKind {
        let mime = attachment?.mimeType?.lowercased() ?? ""
        let head = mime.split(separator: "/", omittingEmptySubsequences: false).first.map(String.init) ?? ""
        let family = head.isEmpty ? (messageType ?? "") : head
        switch family {
        case "image": return .photo
        case "video": return .video
        case "audio":
            let name = attachment?.originalName ?? ""
            return ConversationPreviewComposer.hasText(name) && !isVoiceName(name) ? .audio : .voice
        default: return .file
        }
    }

    private static func summaryKind(_ raw: String) -> AttachmentKind {
        switch raw {
        case "image": return .photo
        case "video": return .video
        case "audio": return .audio
        default: return .file
        }
    }

    private static func positive(_ value: Double?) -> Double? {
        guard let value, value.isFinite, value > 0 else { return nil }
        return value
    }

    static func of(
        _ message: ConversationPreviewMessage, _ input: ConversationPreviewInput, _ strings: ConversationPreviewStrings
    ) -> ConversationPreviewBody {
        let text = servedText(message, input)
        let attachment = message.attachment
        let summary = message.attachmentSummary
        let count = summary?.count ?? (attachment != nil ? 1 : 0)

        if message.messageType == "location" || message.location != nil {
            let place = [message.location?.name, message.location?.address, message.content]
                .compactMap { $0 }
                .first(where: ConversationPreviewComposer.hasText)
                .map { [ConversationPreviewSegment.label(ConversationPreviewComposer.trimmed($0))] } ?? []
            let segments = [ConversationPreviewSegment.label(strings(.attachmentLocation))] + place
            return ConversationPreviewBody(icon: .location, segments: segments, labelled: segments)
        }
        if message.messageType == "sticker" || message.sticker != nil {
            let segments = attachment?.alt
                .flatMap { ConversationPreviewComposer.hasText($0) ? $0 : nil }
                .map { [ConversationPreviewSegment.text(ConversationPreviewComposer.trimmed($0), language: nil)] }
                ?? [ConversationPreviewSegment.label(strings(.attachmentSticker))]
            return ConversationPreviewBody(icon: .sticker, segments: segments, labelled: segments)
        }
        if count == 0 {
            let segments = text.map { [$0] } ?? []
            return ConversationPreviewBody(icon: nil, segments: segments, labelled: segments)
        }

        if count > 1 {
            let kinds = Set((summary?.kinds ?? [:]).filter { $0.value > 0 }.map { summaryKind($0.key) })
            let kind = kinds.count == 1 ? kinds.first : nil
            let icon = kind?.icon ?? .attachments
            if let text { return ConversationPreviewBody(icon: icon, segments: [text], labelled: [text]) }
            let size = positive(summary?.totalSize.map { Double($0) }).map { [ConversationPreviewSegment.label(strings.fileSize($0))] } ?? []
            let head = ConversationPreviewSegment.label(strings(kind?.many ?? .attachmentMixedMany, ["count": String(count)]))
            return ConversationPreviewBody(icon: icon, segments: [head] + size, labelled: [head] + size)
        }

        let kind = kindOf(attachment, messageType: message.messageType)
        if let text { return ConversationPreviewBody(icon: kind.icon, segments: [text], labelled: [text]) }
        let name = ConversationPreviewComposer.trimmed(attachment?.originalName ?? "")
        let named = (kind == .audio || kind == .file) && !name.isEmpty
        let head = ConversationPreviewSegment.label(named ? name : strings(kind.one))
        let details = detailsOf(kind, attachment, strings)
        let labelledHead = named ? [ConversationPreviewSegment.label(strings(kind.one)), head] : [head]
        return ConversationPreviewBody(icon: kind.icon, segments: [head] + details, labelled: labelledHead + details)
    }

    /// Chaque détail n'apparaît QUE si l'information existe — durée, dimensions,
    /// pages, poids, séparés par « · » au rendu.
    private static func detailsOf(
        _ kind: AttachmentKind, _ attachment: ConversationPreviewAttachment?, _ strings: ConversationPreviewStrings
    ) -> [ConversationPreviewSegment] {
        guard let attachment else { return [] }
        let timed = kind == .voice || kind == .audio || kind == .video
        let sized = kind == .photo || kind == .video
        var details: [ConversationPreviewSegment] = []
        if timed, let duration = positive(attachment.duration) {
            details.append(.label(ConversationPreviewStrings.clock(seconds: (duration / 1000).rounded())))
        }
        if sized, let width = positive(attachment.width), let height = positive(attachment.height) {
            details.append(.label("\(Int(width.rounded()))×\(Int(height.rounded()))"))
        }
        if kind == .file, let pages = positive(attachment.pageCount) {
            let count = Int(pages.rounded(.down))
            details.append(.label(strings(pages == 1 ? .detailPagesOne : .detailPagesOther, ["count": String(count)])))
        }
        if let size = positive(attachment.fileSize) {
            details.append(.label(strings.fileSize(size)))
        }
        return details
    }
}
