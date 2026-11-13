import Foundation

/// L'AVIS QU'ON CITE (#17441) — un appel (manqué ou non), une arrivée (seule ou
/// regroupée) et un départ ANNONCÉ se citent comme un message. Miroir de
/// `QUOTABLE_NOTICE_KINDS` + `quotedNoticeText` (`packages/shared/utils/
/// quotable-notice.ts`).
///
/// Se décode depuis la métadonnée de l'avis, sous la forme que la passerelle
/// sert en `replyTo.notice` (`servedQuotedMessage`). Un avis non citable
/// (capture, retrait, renommage) ou illisible ne se décode pas : la citation
/// retombe sur `content`, repli français.
public enum QuotedNotice: Codable, Equatable, Sendable {
    case call(CallSummaryMetadata)
    case joined(name: String, addedBy: String?)
    case arrivals(ArrivalsNoticeMetadata)
    case left(name: String)

    private struct Actor: Codable, Equatable {
        let displayName: String
    }

    private enum CodingKeys: String, CodingKey {
        case kind, displayName, givenName, addedBy, actor
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decodeIfPresent(String.self, forKey: .kind) {
        case "call", "call-live":
            self = .call(try CallSummaryMetadata(from: decoder))
        case "member-joined":
            let given = try c.decodeIfPresent(String.self, forKey: .givenName)?.trimmingCharacters(in: .whitespaces)
            let displayName = try c.decode(String.self, forKey: .displayName)
            let name = given.flatMap { $0.isEmpty ? nil : $0 } ?? displayName
            self = .joined(name: name, addedBy: (try? c.decodeIfPresent(Actor.self, forKey: .addedBy))?.displayName)
        case ArrivalsNoticeMetadata.kind:
            self = .arrivals(try ArrivalsNoticeMetadata(from: decoder))
        case "member-left":
            self = .left(name: try c.decode(Actor.self, forKey: .actor).displayName)
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "avis non citable")
        }
    }

    public func encode(to encoder: Encoder) throws {
        switch self {
        case .call(let summary):
            try summary.encode(to: encoder)
        case .arrivals(let arrivals):
            try arrivals.encode(to: encoder)
        case .joined(let name, let addedBy):
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode("member-joined", forKey: .kind)
            try c.encode(name, forKey: .displayName)
            try c.encodeIfPresent(addedBy.map(Actor.init(displayName:)), forKey: .addedBy)
        case .left(let name):
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode("member-left", forKey: .kind)
            try c.encode(Actor(displayName: name), forKey: .actor)
        }
    }

    /// L'avis porté par un message EN MÉMOIRE — la citation optimiste du composeur.
    public init?(call: CallSummaryMetadata?, join: JoinNoticeMetadata?, arrivals: ArrivalsNoticeMetadata?) {
        if let call { self = .call(call); return }
        if let join {
            let given = join.givenName?.trimmingCharacters(in: .whitespaces)
            self = .joined(name: given.flatMap { $0.isEmpty ? nil : $0 } ?? join.displayName, addedBy: nil)
            return
        }
        if let arrivals { self = .arrivals(arrivals); return }
        return nil
    }

    /// Le texte de l'avis dans la langue des libellés prêtés, du point de vue du
    /// LECTEUR : un appel manqué se dit « manqué » ou « sans réponse » selon qui l'a passé.
    public func text(viewerId: String?, strings: ConversationPreviewStrings) -> String {
        switch self {
        case .call(let summary):
            return Self.callText(summary, viewerId: viewerId, strings: strings)
        case .joined(let name, let addedBy):
            guard let addedBy else { return strings(.systemMemberJoined, ["actor": name]) }
            return strings(.systemMemberAdded, ["actor": addedBy, "target": name])
        case .arrivals(let arrivals):
            return arrivals.text(strings)
        case .left(let name):
            return strings(.systemMemberLeft, ["actor": name])
        }
    }

    private static func callKey(_ summary: CallSummaryMetadata, outgoing: Bool) -> ConversationPreviewStringKey {
        if summary.isLive { return .callActive }
        switch summary.outcome {
        case .missed:
            guard outgoing else { return .callMissed }
            return summary.endedByInitiator == true ? .callCancelled : .callUnanswered
        case .rejected: return .callDeclined
        case .failed: return .callFailed
        case .completed: return summary.callType == .video ? .callVideo : .callAudio
        }
    }

    private static func callText(_ summary: CallSummaryMetadata, viewerId: String?, strings: ConversationPreviewStrings) -> String {
        let key = callKey(summary, outgoing: viewerId != nil && summary.initiatorId == viewerId)
        let label = strings(key)
        guard key == .callAudio || key == .callVideo, summary.durationSeconds > 0 else { return label }
        return "\(label) · \(paddedClock(summary.durationSeconds))"
    }

    /// `formatCallDuration` (`call-summary.ts`) : minutes sur deux chiffres, « 04:32 ».
    private static func paddedClock(_ totalSeconds: Int) -> String {
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60
        let pad: (Int) -> String = { $0 < 10 ? "0\($0)" : "\($0)" }
        return hours > 0 ? "\(hours):\(pad(minutes)):\(pad(seconds))" : "\(pad(minutes)):\(pad(seconds))"
    }

    // MARK: - Les libellés prêtés par l'app

    private static let lentStringsSlot = Locked<(@Sendable () -> ConversationPreviewStrings)?>(nil)

    /// L'app prête ses libellés (`ConversationPreviewCatalog`) au démarrage : le SDK ne porte aucun texte.
    /// Sans eux, la citation d'un avis garde le repli français servi par la passerelle.
    public static func lend(strings: (@Sendable () -> ConversationPreviewStrings)?) {
        lentStringsSlot.mutate { $0 = strings }
    }

    public static var lentStrings: ConversationPreviewStrings? {
        lentStringsSlot.read { $0 }?()
    }
}
