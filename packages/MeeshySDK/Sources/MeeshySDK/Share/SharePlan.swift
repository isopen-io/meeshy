import Foundation

/// **Les plafonds communs du partage** (D10, #10949, porteur 2026-10-18) — les
/// mêmes sur iOS (app et extension), sur le web et dans la coque Android.
///
/// Miroir JUMEAU de `SHARE_LIMITS` (`packages/shared/utils/share-limits.ts`) ;
/// toute évolution touche les deux sites. `maxPublicationMedia` est la borne
/// que la passerelle applique déjà aux posts (`MAX_POST_MEDIA`).
public enum ShareLimits {
    public static let maxFiles = 20
    /// 500 Mio, comme l'extension l'a toujours compté.
    public static let maxTotalBytes = 500 * 1024 * 1024
    /// Destinataires, publications comprises.
    public static let maxRecipients = 10
    public static let maxPublicationMedia = 10
    /// La légende d'un envoi (`MAX_SHARE_CAPTION`).
    public static let maxCaptionLength = 5000
}

/// Un média : un fichier venu d'une autre app, ou la pièce d'un message —
/// dans ce second cas, ses drapeaux de protection sont ceux que la loi de
/// sortie lit (`ContentExitLaw.Piece`).
public struct ShareMedia: Equatable, Sendable {
    public var id: String?
    public var mimeType: String
    public var bytes: Int?
    public var durationMs: Int?
    public var isViewOnce: Bool?
    public var isBlurred: Bool?
    public var effectFlags: UInt32?

    public init(
        id: String? = nil,
        mimeType: String,
        bytes: Int? = nil,
        durationMs: Int? = nil,
        isViewOnce: Bool? = nil,
        isBlurred: Bool? = nil,
        effectFlags: UInt32? = nil
    ) {
        self.id = id
        self.mimeType = mimeType
        self.bytes = bytes
        self.durationMs = durationMs
        self.isViewOnce = isViewOnce
        self.isBlurred = isBlurred
        self.effectFlags = effectFlags
    }

    var exitPiece: ContentExitLaw.Piece {
        ContentExitLaw.Piece(isViewOnce: isViewOnce, isBlurred: isBlurred, effectFlags: effectFlags)
    }
}

/// Un message source, tel que le client le connaît. `encrypted` : sa
/// conversation est chiffrée, ou il porte un contenu chiffré ; `citesProtected` :
/// il cite un contenu protégé.
public struct ShareMessage: Equatable, Sendable {
    public var id: String
    public var text: String?
    public var isViewOnce: Bool?
    public var isBlurred: Bool?
    public var effectFlags: UInt32?
    public var ephemeralDuration: Double?
    public var expiresAt: Date?
    public var encrypted: Bool
    public var citesProtected: Bool
    public var pieces: [ShareMedia]

    public init(
        id: String,
        text: String? = nil,
        isViewOnce: Bool? = nil,
        isBlurred: Bool? = nil,
        effectFlags: UInt32? = nil,
        ephemeralDuration: Double? = nil,
        expiresAt: Date? = nil,
        encrypted: Bool = false,
        citesProtected: Bool = false,
        pieces: [ShareMedia] = []
    ) {
        self.id = id
        self.text = text
        self.isViewOnce = isViewOnce
        self.isBlurred = isBlurred
        self.effectFlags = effectFlags
        self.ephemeralDuration = ephemeralDuration
        self.expiresAt = expiresAt
        self.encrypted = encrypted
        self.citesProtected = citesProtected
        self.pieces = pieces
    }

    func exitSubject(pieces chosen: [ShareMedia]? = nil) -> ContentExitLaw.Subject {
        ContentExitLaw.Subject(
            isViewOnce: isViewOnce,
            isBlurred: isBlurred,
            effectFlags: effectFlags,
            ephemeralDuration: ephemeralDuration,
            expiresAt: expiresAt,
            attachments: (chosen ?? pieces).map(\.exitPiece)
        )
    }
}

public enum ShareCardKind: String, Equatable, Sendable, CaseIterable {
    case post, story, reel, profile, invitation
}

/// Ce que l'écran reçoit à envoyer.
public enum ShareEntry: Equatable, Sendable {
    case text(String)
    case link(url: String, text: String?)
    case media([ShareMedia], text: String?)
    case piece(message: ShareMessage, attachmentId: String)
    case messages([ShareMessage])
    case card(ShareCardKind, url: String?)
}

/// Un destinataire choisi. `encrypted` faux = non chiffré.
public struct ShareDestination: Equatable, Sendable {
    public let id: String
    public let encrypted: Bool

    public init(id: String, encrypted: Bool = false) {
        self.id = id
        self.encrypted = encrypted
    }
}

public enum ShareAction: String, Equatable, Hashable, Sendable, CaseIterable {
    case send
    case caption
    case reorder
    case grouping
    case publishPost = "publish-post"
    case publishStory = "publish-story"
    case publishReel = "publish-reel"
    case studio
    case save
    case copyLink = "copy-link"
    case copyText = "copy-text"
    case imager
    case shareOut = "share-out"
}

public enum ShareWithheldReason: String, Equatable, Sendable {
    case singlePhotoNotAReel = "single-photo-not-a-reel"
    case notAReel = "not-a-reel"
    case tooManyForPublication = "too-many-for-publication"
    case flame
    case blurred
    case encrypted
    case citesProtected = "cites-protected"
}

public enum ShareWithdrawReason: String, Equatable, Sendable {
    case viewOnce = "view-once"
    case afterRead = "after-read"
    case unavailable
}

public struct ShareWithheld: Equatable, Sendable {
    public let action: ShareAction
    public let reason: ShareWithheldReason

    public init(action: ShareAction, reason: ShareWithheldReason) {
        self.action = action
        self.reason = reason
    }
}

public struct ShareWithdrawal: Equatable, Sendable {
    public let id: String
    public let reason: ShareWithdrawReason

    public init(id: String, reason: ShareWithdrawReason) {
        self.id = id
        self.reason = reason
    }
}

public enum ShareTitle: String, Equatable, Sendable {
    /// « Envoyer ».
    case send
    /// « Transférer » : la source est un message.
    case forward
}

public enum ShareGrouping: String, Equatable, Sendable {
    case together
    case separately
}

public struct ShareCaption: Equatable, Sendable {
    public enum Placement: String, Equatable, Sendable {
        /// La légende est le texte du message (du premier en « Séparément »).
        case messageText = "message-text"
        /// La légende part en message à part, juste après la copie (D4).
        case separateMessage = "separate-message"
    }

    public let placement: Placement
    public let maxLength: Int

    public init(placement: Placement, maxLength: Int = ShareLimits.maxCaptionLength) {
        self.placement = placement
        self.maxLength = maxLength
    }
}

/// Source chiffrée : la copie se fait sur l'appareil ; ces destinations ne sont
/// pas chiffrées et reçoivent l'avertissement (D7).
public struct ShareEncryption: Equatable, Sendable {
    public let copyOnDevice: Bool
    public let warnDestinationIds: [String]

    public init(warnDestinationIds: [String]) {
        self.copyOnDevice = true
        self.warnDestinationIds = warnDestinationIds
    }
}

public struct ShareLimitsReport: Equatable, Sendable {
    public let files: Int
    public let bytes: Int
    /// Combien de pièces retirer, depuis la fin, pour tenir 20 fichiers et 500 Mio.
    public let trimCount: Int
    public let recipients: Int
    public let overRecipients: Int
}

/// Le plan de l'écran de partage unique, pour une entrée et des destinataires.
public struct SharePlan: Equatable, Sendable {
    public let title: ShareTitle
    /// Ce qui part, dans l'ordre : ids des messages, de la pièce, ou des médias (index si sans id).
    public let kept: [String]
    public let withdrawn: [ShareWithdrawal]
    /// Rien ne part : tout ce qui est choisi est protégé ou indisponible.
    public let blocked: ShareWithdrawReason?
    public let actions: [ShareAction]
    public let withheld: [ShareWithheld]
    /// « Ensemble » par défaut, offert dès deux pièces (D3).
    public let grouping: ShareGrouping?
    public let caption: ShareCaption?
    /// La copie d'une flamme dure AU PLUS autant que la source — présélectionnée.
    public let flameMaxDurationSeconds: Int?
    /// La copie d'un flouté reste floutée (D8).
    public let blurInherited: Bool
    public let encryption: ShareEncryption?
    public let limits: ShareLimitsReport
    public let canSend: Bool

    public func offers(_ action: ShareAction) -> Bool { actions.contains(action) }

    public func withheldReason(for action: ShareAction) -> ShareWithheldReason? {
        withheld.first { $0.action == action }?.reason
    }
}

/// **LE plan de l'écran de partage unique** (#10949, planche
/// `docs/product/partage-unique/planche-partage-unique.html`, D1–D15).
///
/// PUR : aucune requête, aucun réseau. Miroir JUMEAU de `planShare`
/// (`packages/shared/utils/share-plan.ts`) ; la table de `SharePlanTests`
/// reprend cas pour cas celle du témoin TypeScript. La nature d'un message se
/// lit par la LOI DE SORTIE (`ContentExitLaw`), jamais par une règle redite ici.
public enum SharePlanner {

    private enum Family { case image, video, audio, file }

    private struct Offer {
        var actions: [ShareAction]
        var withheld: [ShareWithheld]

        static let none = Offer(actions: [], withheld: [])
        static func plain(_ actions: ShareAction...) -> Offer { Offer(actions: actions, withheld: []) }
        static func merged(_ offers: Offer...) -> Offer {
            Offer(actions: offers.flatMap(\.actions), withheld: offers.flatMap(\.withheld))
        }
    }

    private struct Nature {
        let withhold: [(actions: [ShareAction], reason: ShareWithheldReason)]
        let flameSeconds: Int?
        let blurred: Bool
        let encrypted: Bool
    }

    private struct Draft {
        let title: ShareTitle
        let kept: [String]
        let withdrawn: [ShareWithdrawal]
        let blocked: ShareWithdrawReason?
        let offer: Offer
        let nature: Nature?
        let media: [ShareMedia]
        let captionPlacement: ShareCaption.Placement?
    }

    private static let publish: [ShareAction] = [.publishPost, .publishStory, .studio]
    private static let exports: [ShareAction] = [.publishPost, .publishStory, .publishReel, .studio, .save, .copyLink, .copyText, .imager, .shareOut]
    private static let publications: [ShareAction] = [.publishPost, .publishStory, .publishReel, .studio]

    private static func family(of media: ShareMedia) -> Family {
        let mime = media.mimeType.lowercased()
        if mime.hasPrefix("image/") { return .image }
        if mime.hasPrefix("video/") { return .video }
        if mime.hasPrefix("audio/") { return .audio }
        return .file
    }

    /// Visuels homogènes, ou sons seuls (D13) ; jamais un fichier.
    private static func publicationOffer(_ media: [ShareMedia]) -> Offer {
        let families = media.map(family(of:))
        let visual = families.allSatisfy { $0 == .image || $0 == .video }
        let sound = families.allSatisfy { $0 == .audio }
        guard !media.isEmpty, visual || sound else { return .none }
        guard media.count <= ShareLimits.maxPublicationMedia else {
            return Offer(actions: [], withheld: publish.map { ShareWithheld(action: $0, reason: .tooManyForPublication) })
        }
        if sound { return Offer(actions: publish, withheld: []) }
        let reel = ReelComposition.qualifiesAsReel(mimeTypes: media.map(\.mimeType), durationsMs: media.map(\.durationMs))
        if reel { return Offer(actions: publish + [.publishReel], withheld: []) }
        let singlePhoto = media.count == 1 && families.first == .image
        return Offer(actions: publish, withheld: [ShareWithheld(action: .publishReel, reason: singlePhoto ? .singlePhotoNotAReel : .notAReel)])
    }

    private static func isBlurredCarrier(isBlurred: Bool?, effectFlags: UInt32?) -> Bool {
        isBlurred == true || ((effectFlags ?? 0) & MessageEffectFlags.blurred.rawValue) != 0
    }

    private static func hasText(_ text: String?) -> Bool {
        !(text ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private static func withdrawReason(of message: ShareMessage, pieces: [ShareMedia]? = nil) -> ShareWithdrawReason? {
        switch ContentExitLaw.of(message.exitSubject(pieces: pieces)).forward {
        case .allowed: return nil
        case .refused(.viewOnce): return .viewOnce
        case .refused(.afterRead): return .afterRead
        }
    }

    private static func nature(of sources: [(message: ShareMessage, pieces: [ShareMedia])]) -> Nature {
        let flames = sources.compactMap { source -> Int? in
            ContentExitLaw.of(source.message.exitSubject(pieces: source.pieces)).forward.maxDurationSeconds
        }
        let blurred = sources.contains { source in
            isBlurredCarrier(isBlurred: source.message.isBlurred, effectFlags: source.message.effectFlags)
                || source.pieces.contains { isBlurredCarrier(isBlurred: $0.isBlurred, effectFlags: $0.effectFlags) }
        }
        let encrypted = sources.contains { $0.message.encrypted }
        let citesProtected = sources.contains { $0.message.citesProtected }
        var withhold: [(actions: [ShareAction], reason: ShareWithheldReason)] = []
        if !flames.isEmpty { withhold.append((exports, .flame)) }
        if blurred { withhold.append((exports, .blurred)) }
        if encrypted { withhold.append((publications, .encrypted)) }
        if citesProtected { withhold.append(([.imager], .citesProtected)) }
        return Nature(withhold: withhold, flameSeconds: flames.min(), blurred: blurred, encrypted: encrypted)
    }

    private static func applying(_ nature: Nature, to offer: Offer) -> Offer {
        let reason: (ShareAction) -> ShareWithheldReason? = { action in
            nature.withhold.first { $0.actions.contains(action) }?.reason
        }
        let kept = offer.actions.filter { reason($0) == nil }
        let removed = offer.actions.compactMap { action in reason(action).map { ShareWithheld(action: action, reason: $0) } }
        return Offer(actions: kept, withheld: removed + offer.withheld.filter { reason($0.action) == nil })
    }

    private static func cardOffer(_ kind: ShareCardKind) -> Offer {
        switch kind {
        case .post, .reel: return .plain(.send, .caption, .publishPost, .publishStory, .copyLink, .shareOut)
        // D14, revue par le porteur (#12644) : une story se
        // republie en story, post ou réel, et se recompose au studio.
        case .story: return .plain(.send, .caption, .publishPost, .publishStory, .publishReel, .studio, .copyLink, .shareOut)
        case .profile, .invitation: return .plain(.send, .caption, .copyLink, .shareOut)
        }
    }

    private static func mediaIds(_ media: [ShareMedia]) -> [String] {
        media.enumerated().map { index, item in item.id ?? String(index) }
    }

    private static func sendDraft(_ offer: Offer, caption: ShareCaption.Placement?, media: [ShareMedia] = []) -> Draft {
        Draft(title: .send, kept: mediaIds(media), withdrawn: [], blocked: nil, offer: offer, nature: nil, media: media, captionPlacement: caption)
    }

    private static func blockedDraft(_ reason: ShareWithdrawReason, withdrawn: [ShareWithdrawal] = []) -> Draft {
        Draft(title: .forward, kept: [], withdrawn: withdrawn, blocked: reason, offer: .none, nature: nil, media: [], captionPlacement: nil)
    }

    private static func pieceDraft(message: ShareMessage, attachmentId: String) -> Draft {
        guard let piece = message.pieces.first(where: { $0.id == attachmentId }) else { return blockedDraft(.unavailable) }
        if let refusal = withdrawReason(of: message, pieces: [piece]) { return blockedDraft(refusal) }
        let offer = Offer.merged(.plain(.send, .caption), publicationOffer([piece]), .plain(.save, .shareOut))
        return Draft(
            title: .forward, kept: [attachmentId], withdrawn: [], blocked: nil, offer: offer,
            nature: nature(of: [(message, [piece])]), media: [], captionPlacement: .separateMessage
        )
    }

    private static func messagesDraft(_ messages: [ShareMessage]) -> Draft {
        let withdrawn = messages.compactMap { message in withdrawReason(of: message).map { ShareWithdrawal(id: message.id, reason: $0) } }
        let withdrawnIds = Set(withdrawn.map(\.id))
        let kept = messages.filter { !withdrawnIds.contains($0.id) }
        guard !kept.isEmpty else { return blockedDraft(withdrawn.first?.reason ?? .unavailable, withdrawn: withdrawn) }

        let sole = kept.count == 1 ? kept.first : nil
        let pieces = sole?.pieces ?? []
        let publishable = pieces.isEmpty ? Offer.none : Offer.merged(publicationOffer(pieces), .plain(.save, .shareOut))
        let offer = Offer.merged(
            .plain(.send, .caption),
            kept.count > 1 || pieces.count > 1 ? .plain(.reorder) : .none,
            publishable,
            .plain(.imager),
            kept.contains { hasText($0.text) } ? .plain(.copyText) : .none
        )
        return Draft(
            title: .forward, kept: kept.map(\.id), withdrawn: withdrawn, blocked: nil, offer: offer,
            nature: nature(of: kept.map { ($0, $0.pieces) }), media: [], captionPlacement: .separateMessage
        )
    }

    private static func draft(of entry: ShareEntry) -> Draft {
        switch entry {
        case .text:
            return sendDraft(.plain(.send, .publishPost, .publishStory, .studio), caption: nil)
        case .link:
            return sendDraft(.plain(.send, .caption, .publishPost, .publishStory, .studio, .copyLink, .shareOut), caption: .messageText)
        case .media(let media, _):
            let offer = Offer.merged(.plain(.send, .caption), media.count > 1 ? .plain(.reorder, .grouping) : .none, publicationOffer(media))
            return sendDraft(offer, caption: .messageText, media: media)
        case .piece(let message, let attachmentId):
            return pieceDraft(message: message, attachmentId: attachmentId)
        case .messages(let messages):
            return messagesDraft(messages)
        case .card(let kind, _):
            return sendDraft(cardOffer(kind), caption: .messageText)
        }
    }

    /// Le plus petit nombre de pièces à retirer, depuis la fin, pour tenir les deux plafonds.
    public static func trimCount(of media: [ShareMedia]) -> Int {
        let sizes = media.map { max(0, $0.bytes ?? 0) }
        let fits: (Int) -> Bool = { count in
            count <= ShareLimits.maxFiles && sizes.prefix(count).reduce(0, +) <= ShareLimits.maxTotalBytes
        }
        let keep = stride(from: media.count, through: 0, by: -1).first(where: fits) ?? 0
        return media.count - keep
    }

    private static func unique(_ actions: [ShareAction]) -> [ShareAction] {
        var seen = Set<ShareAction>()
        return actions.filter { seen.insert($0).inserted }
    }

    public static func plan(entry: ShareEntry, destinations: [ShareDestination] = []) -> SharePlan {
        let draft = draft(of: entry)
        let offer = draft.nature.map { applying($0, to: draft.offer) } ?? draft.offer
        let actions = unique(offer.actions)
        let bytes = draft.media.reduce(0) { $0 + max(0, $1.bytes ?? 0) }
        let trim = trimCount(of: draft.media)
        let overRecipients = max(0, destinations.count - ShareLimits.maxRecipients)
        let encrypted = draft.nature?.encrypted == true

        return SharePlan(
            title: draft.title,
            kept: draft.kept,
            withdrawn: draft.withdrawn,
            blocked: draft.blocked,
            actions: actions,
            withheld: offer.withheld,
            grouping: actions.contains(.grouping) ? .together : nil,
            caption: draft.captionPlacement.flatMap { actions.contains(.caption) ? ShareCaption(placement: $0) : nil },
            flameMaxDurationSeconds: draft.nature?.flameSeconds,
            blurInherited: draft.nature?.blurred == true,
            encryption: encrypted ? ShareEncryption(warnDestinationIds: destinations.filter { !$0.encrypted }.map(\.id)) : nil,
            limits: ShareLimitsReport(files: draft.media.count, bytes: bytes, trimCount: trim, recipients: destinations.count, overRecipients: overRecipients),
            canSend: draft.blocked == nil && actions.contains(.send) && trim == 0 && !destinations.isEmpty && overRecipients == 0
        )
    }
}
