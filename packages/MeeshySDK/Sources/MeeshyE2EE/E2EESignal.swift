import Foundation

/// Un SIGNAL entre clients d'une conversation chiffrée de bout en bout (#13142) :
/// ce qui se passe AUTOUR des messages — réaction, frappe, accusé, progression
/// de lecture, modification, suppression pour tous, vue unique ouverte,
/// épinglage. Comme chez Signal (`SignalService.proto` : `ReactionMessage`,
/// `TypingMessage`, `ReceiptMessage`, `EditMessage`, `DataMessage.Delete`,
/// `SyncMessage.ViewOnceOpen`), le signal est un CONTENU chiffré libsignal,
/// d'appareil à appareil : la passerelle ne sait ni lequel, ni sur quoi.
///
/// La version se dit sous la clé `s`, jamais `v` : une version antérieure de
/// Meeshy, qui ne connaît que `E2EEContent`, ne le lit donc jamais comme un
/// message (elle le classe illisible, sans rien ranger de son contenu).
///
/// L'auteur et la conversation voyagent DANS le chiffré, posés par le scelleur :
/// libsignal authentifie l'appareil émetteur, pas la conversation ni le nom que
/// le serveur lui associe.
public struct E2EESignal: Equatable, Sendable {
    public static let currentVersion = 1

    public let version: Int
    public let conversationId: String
    /// L'instant de l'émission, en millisecondes depuis 1970.
    public let sentAt: Int64
    public let authorUserId: String?
    public let authorDeviceId: UInt32?
    public let action: E2EESignalAction

    public init(conversationId: String, sentAt: Date, action: E2EESignalAction) {
        self.init(
            version: Self.currentVersion, conversationId: conversationId,
            sentAt: Int64((sentAt.timeIntervalSince1970 * 1000).rounded()),
            authorUserId: nil, authorDeviceId: nil, action: action
        )
    }

    init(version: Int, conversationId: String, sentAt: Int64, authorUserId: String?, authorDeviceId: UInt32?, action: E2EESignalAction) {
        self.version = version
        self.conversationId = conversationId
        self.sentAt = sentAt
        self.authorUserId = authorUserId
        self.authorDeviceId = authorDeviceId
        self.action = action
    }

    /// Le même signal, signé de son auteur avant d'être chiffré.
    public func authored(by userId: String, deviceId: UInt32) -> E2EESignal {
        E2EESignal(version: version, conversationId: conversationId, sentAt: sentAt, authorUserId: userId, authorDeviceId: deviceId, action: action)
    }

    /// L'auteur porté dans le chiffré est-il l'expéditeur que libsignal a
    /// authentifié ? Un signal n'a pas de version antérieure sans auteur : un
    /// signal sans auteur n'est celui de personne.
    public func isAuthored(by userId: String, deviceId: UInt32) -> Bool {
        authorUserId == userId && authorDeviceId == deviceId
    }

    public func belongs(to conversationId: String) -> Bool {
        self.conversationId == conversationId
    }
}

/// Ce que dit un signal. `unknown` : une action d'une version ultérieure, que
/// cet appareil reconnaît comme un signal et ignore, sans l'appliquer à moitié.
public enum E2EESignalAction: Equatable, Sendable {
    case reaction(target: String, emoji: String, removed: Bool)
    case typing(active: Bool)
    case receipt(E2EEReceiptKind, targets: [String])
    case readProgress(target: String, attachmentId: String?, position: Double, completed: Bool)
    case edit(target: String, text: String, language: String?)
    case deleteForEveryone(target: String)
    case viewOnceOpened(target: String)
    case pin(target: String, pinned: Bool)
    case unknown(kind: String)

    /// Le message que l'action vise, quand elle en vise un.
    public var target: String? {
        switch self {
        case .reaction(let target, _, _), .readProgress(let target, _, _, _), .edit(let target, _, _),
             .deleteForEveryone(let target), .viewOnceOpened(let target), .pin(let target, _):
            target
        case .typing, .receipt, .unknown:
            nil
        }
    }
}

public enum E2EEReceiptKind: String, Codable, Sendable {
    case delivered
    case read
}

public enum E2EESignalError: Error, Equatable {
    case unsupportedVersion(Int)
}

extension E2EESignal: Codable {
    private enum CodingKeys: String, CodingKey {
        case s, kind, conversationId, sentAt, authorUserId, authorDeviceId
        case target, emoji, removed, active, receipt, targets, attachmentId, position, completed, text, language, pinned
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        version = try c.decode(Int.self, forKey: .s)
        conversationId = try c.decode(String.self, forKey: .conversationId)
        sentAt = try c.decode(Int64.self, forKey: .sentAt)
        authorUserId = try c.decodeIfPresent(String.self, forKey: .authorUserId)
        authorDeviceId = try c.decodeIfPresent(UInt32.self, forKey: .authorDeviceId)
        action = try Self.action(from: c)
    }

    private static func action(from c: KeyedDecodingContainer<CodingKeys>) throws -> E2EESignalAction {
        let kind = try c.decode(String.self, forKey: .kind)
        func target() throws -> String { try c.decode(String.self, forKey: .target) }
        switch kind {
        case "reaction":
            return .reaction(target: try target(), emoji: try c.decode(String.self, forKey: .emoji), removed: try c.decode(Bool.self, forKey: .removed))
        case "typing":
            return .typing(active: try c.decode(Bool.self, forKey: .active))
        case "receipt":
            return .receipt(try c.decode(E2EEReceiptKind.self, forKey: .receipt), targets: try c.decode([String].self, forKey: .targets))
        case "read-progress":
            return .readProgress(
                target: try target(), attachmentId: try c.decodeIfPresent(String.self, forKey: .attachmentId),
                position: try c.decode(Double.self, forKey: .position), completed: try c.decode(Bool.self, forKey: .completed)
            )
        case "edit":
            return .edit(target: try target(), text: try c.decode(String.self, forKey: .text), language: try c.decodeIfPresent(String.self, forKey: .language))
        case "delete-for-everyone":
            return .deleteForEveryone(target: try target())
        case "view-once-opened":
            return .viewOnceOpened(target: try target())
        case "pin":
            return .pin(target: try target(), pinned: try c.decode(Bool.self, forKey: .pinned))
        default:
            return .unknown(kind: kind)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(version, forKey: .s)
        try c.encode(conversationId, forKey: .conversationId)
        try c.encode(sentAt, forKey: .sentAt)
        try c.encodeIfPresent(authorUserId, forKey: .authorUserId)
        try c.encodeIfPresent(authorDeviceId, forKey: .authorDeviceId)
        try encode(action, into: &c)
    }

    private func encode(_ action: E2EESignalAction, into c: inout KeyedEncodingContainer<CodingKeys>) throws {
        switch action {
        case .reaction(let target, let emoji, let removed):
            try c.encode("reaction", forKey: .kind)
            try c.encode(target, forKey: .target)
            try c.encode(emoji, forKey: .emoji)
            try c.encode(removed, forKey: .removed)
        case .typing(let active):
            try c.encode("typing", forKey: .kind)
            try c.encode(active, forKey: .active)
        case .receipt(let kind, let targets):
            try c.encode("receipt", forKey: .kind)
            try c.encode(kind, forKey: .receipt)
            try c.encode(targets, forKey: .targets)
        case .readProgress(let target, let attachmentId, let position, let completed):
            try c.encode("read-progress", forKey: .kind)
            try c.encode(target, forKey: .target)
            try c.encodeIfPresent(attachmentId, forKey: .attachmentId)
            try c.encode(position, forKey: .position)
            try c.encode(completed, forKey: .completed)
        case .edit(let target, let text, let language):
            try c.encode("edit", forKey: .kind)
            try c.encode(target, forKey: .target)
            try c.encode(text, forKey: .text)
            try c.encodeIfPresent(language, forKey: .language)
        case .deleteForEveryone(let target):
            try c.encode("delete-for-everyone", forKey: .kind)
            try c.encode(target, forKey: .target)
        case .viewOnceOpened(let target):
            try c.encode("view-once-opened", forKey: .kind)
            try c.encode(target, forKey: .target)
        case .pin(let target, let pinned):
            try c.encode("pin", forKey: .kind)
            try c.encode(target, forKey: .target)
            try c.encode(pinned, forKey: .pinned)
        case .unknown(let kind):
            try c.encode(kind, forKey: .kind)
        }
    }

    /// JSON canonique : clés triées, aucun champ absent écrit.
    public func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(self)
    }

    /// Refuse un format que cet appareil ne sait pas lire.
    public static func decoded(from data: Data) throws -> E2EESignal {
        let signal = try JSONDecoder().decode(E2EESignal.self, from: data)
        guard signal.version == currentVersion else { throw E2EESignalError.unsupportedVersion(signal.version) }
        return signal
    }
}

/// Ce qu'un clair déchiffré porte : un message (`v`) ou un signal (`s`).
public enum E2EEPayloadKind: Equatable, Sendable {
    case message
    case signal

    private struct Probe: Decodable {
        let s: Int?
    }

    public static func of(_ plaintext: Data) -> E2EEPayloadKind {
        (try? JSONDecoder().decode(Probe.self, from: plaintext))?.s == nil ? .message : .signal
    }
}

/// Le remplissage du clair AVANT libsignal (Signal, `PushTransportDetails` :
/// le contenu se remplit par blocs), commun aux messages et aux signaux : la
/// passerelle ne distingue plus une réaction d'un message court par la taille
/// de son enveloppe. Le remplissage est fait d'ESPACES après l'objet JSON : un
/// JSON suivi d'espaces reste valide, et une version antérieure de Meeshy lit
/// donc encore un message rempli.
public enum E2EEPadding {
    /// Les paliers, en octets (`E2EE_PADDING_TIERS` de `@meeshy/shared`).
    public static let tiers = [256, 1024, 4096, 16384]
    /// Au-delà du dernier palier, le multiple suivant de celui-ci.
    public static let step = 16384
    /// Jamais au-delà : l'enveloppe chiffrée doit tenir sous 64 Kio (`E2EE_ENVELOPE_BOUNDS`).
    public static let maxPaddedLength = 61440

    public static func paddedLength(for length: Int) -> Int {
        if let tier = tiers.first(where: { $0 >= length }) { return tier }
        guard length <= maxPaddedLength else { return length }
        return min(((length + step - 1) / step) * step, maxPaddedLength)
    }

    public static func padded(_ plaintext: Data) -> Data {
        let target = paddedLength(for: plaintext.count)
        guard target > plaintext.count else { return plaintext }
        return plaintext + Data(repeating: 0x20, count: target - plaintext.count)
    }
}
