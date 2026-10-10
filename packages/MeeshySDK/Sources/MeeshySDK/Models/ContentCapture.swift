import Foundation

// MARK: - La capture d'un contenu qui disparaît (#9617)
//
// Miroir du contrat `packages/shared/types/content-capture.ts` : le client
// DÉTECTE une capture ou un enregistrement d'écran et DÉCLARE les messages
// visibles à cet instant ; la passerelle juge chacun et écrit l'avis. Ce
// fichier ne porte que des valeurs et des règles pures : QUI détecte, et QUOI
// est visible, est l'affaire de l'application.

/// `screenshot` : une capture ; `recording` : un enregistrement ou une recopie
/// d'écran. La passerelle annonce chaque sorte au plus une fois par message et
/// par acteur.
public enum ContentCaptureKind: String, Codable, Sendable, Equatable, CaseIterable {
    case screenshot
    case recording
}

/// Un message RÉELLEMENT à l'écran au moment d'une capture, tel que sa surface le voit.
public struct ContentCaptureCandidate: Equatable, Hashable, Sendable {
    public let conversationId: String
    public let messageId: String
    public let capture: ContentExitLaw.CaptureVerdict
    /// Le lecteur est l'auteur : sa propre capture ne s'annonce pas.
    public let isMine: Bool

    public init(conversationId: String, messageId: String, capture: ContentExitLaw.CaptureVerdict, isMine: Bool) {
        self.conversationId = conversationId
        self.messageId = messageId
        self.capture = capture
        self.isMine = isMine
    }

    /// Ce message se déclare-t-il ? Ni ordinaire, ni à soi, ni encore en vol
    /// (la passerelle refuse le lot ENTIER au premier identifiant qui n'est
    /// pas un ObjectId).
    public var isDeclared: Bool {
        capture.isDeclared && !isMine && !conversationId.isEmpty && Self.isObjectId(messageId)
    }

    static func isObjectId(_ value: String) -> Bool {
        ContentCaptureReport.isDeclarableMessageId(value)
    }
}

/// La charge de `message:capture-detected` et de
/// `POST /conversations/:id/messages/capture` (sans `conversationId`, pris dans l'adresse).
public struct ContentCaptureReport: Equatable, Sendable, Encodable {
    public let conversationId: String
    public let messageIds: [String]
    public let kind: ContentCaptureKind
    public let captureId: String

    /// Messages par déclaration : la passerelle accepte jusqu'à 50
    /// (`CONTENT_CAPTURE_MAX_MESSAGES`) mais n'annonce que 10 avis par
    /// déclaration — au-delà, un message ne s'annoncerait pas.
    public static let maxMessages = 10

    public init(conversationId: String, messageIds: [String], kind: ContentCaptureKind, captureId: String) {
        self.conversationId = conversationId
        self.messageIds = messageIds
        self.kind = kind
        self.captureId = captureId
    }

    /// La charge de l'événement socket.
    public var socketPayload: [String: Any] {
        ["conversationId": conversationId, "messageIds": messageIds, "kind": kind.rawValue, "captureId": captureId]
    }

    /// Le corps REST.
    public struct Body: Encodable, Equatable, Sendable {
        public let messageIds: [String]
        public let kind: ContentCaptureKind
        public let captureId: String
    }

    public var body: Body { Body(messageIds: messageIds, kind: kind, captureId: captureId) }

    /// 8 à 64 caractères `[A-Za-z0-9_-]`. FACULTATIF côté passerelle, qui ne
    /// s'en sert plus que pour corréler : elle annonce au plus une fois par
    /// (acteur, message, sorte de capture), quel que soit l'identifiant.
    public static func isValidCaptureId(_ value: String) -> Bool {
        (8...64).contains(value.utf8.count)
            && value.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) && $0.isASCII || $0 == "_" || $0 == "-" }
    }

    /// Un identifiant que la passerelle sait juger : un ObjectId. Un message
    /// encore en vol (`cid_…`) ne s'annonce pas — il ne se montre donc pas en
    /// clair (`announced OU noir`).
    public static func isDeclarableMessageId(_ value: String) -> Bool {
        value.utf8.count == 24 && value.allSatisfy(\.isHexDigit)
    }

    /// Un identifiant NEUF : un par capture d'écran, un seul pour tout un enregistrement.
    public static func newCaptureId() -> String {
        "cap_" + UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }

    /// Les déclarations d'UNE capture : messages déclarables seulement,
    /// dédoublonnés dans l'ordre de l'écran, un lot par conversation, au plus
    /// `maxMessages` par lot.
    public static func reports(
        for candidates: [ContentCaptureCandidate],
        kind: ContentCaptureKind,
        captureId: String
    ) -> [ContentCaptureReport] {
        var seen = Set<String>()
        var order: [String] = []
        var idsByConversation: [String: [String]] = [:]
        for candidate in candidates where candidate.isDeclared {
            guard seen.insert(candidate.conversationId + "|" + candidate.messageId).inserted else { continue }
            if idsByConversation[candidate.conversationId] == nil { order.append(candidate.conversationId) }
            idsByConversation[candidate.conversationId, default: []].append(candidate.messageId)
        }
        return order.flatMap { conversationId in
            chunks(idsByConversation[conversationId] ?? [], of: maxMessages).map {
                ContentCaptureReport(conversationId: conversationId, messageIds: $0, kind: kind, captureId: captureId)
            }
        }
    }

    private static func chunks(_ ids: [String], of size: Int) -> [[String]] {
        stride(from: 0, to: ids.count, by: size).map { Array(ids[$0..<min($0 + size, ids.count)]) }
    }
}

// MARK: - Le suivi d'une session de capture

/// **Ce qui a été déclaré pendant un enregistrement** — valeur pure, sans
/// horloge ni réseau ; l'application la nourrit.
///
/// - Une capture d'écran a son identifiant à elle, et déclare tout ce qui est
///   visible.
/// - Un enregistrement (ou une recopie) garde UN identifiant du début à la fin :
///   chaque éphémère qui paraît pendant qu'il tourne est déclaré UNE fois, sous
///   cet identifiant. Les déclarations se regroupent par conversation, au plus
///   une toutes les `recordingFlushInterval` secondes, pour tenir sous le budget
///   de la passerelle (6 déclarations par minute et par conversation).
public struct ContentCaptureTracker: Equatable, Sendable {

    public static let recordingFlushInterval: TimeInterval = 10

    public private(set) var recordingCaptureId: String?
    private var declared: Set<String> = []
    private var pending: [ContentCaptureCandidate] = []
    private var lastFlush: [String: Date] = [:]

    public init() {}

    public var isRecording: Bool { recordingCaptureId != nil }

    /// Une capture d'écran : tout ce qui est visible, sous un identifiant neuf.
    public func screenshot(visible: [ContentCaptureCandidate], captureId: String) -> [ContentCaptureReport] {
        ContentCaptureReport.reports(for: visible, kind: .screenshot, captureId: captureId)
    }

    /// L'enregistrement commence : l'identifiant se fixe, ce qui est visible
    /// part tout de suite.
    public mutating func recordingStarted(visible: [ContentCaptureCandidate], captureId: String, at now: Date) -> [ContentCaptureReport] {
        guard recordingCaptureId == nil else { return note(visible: visible, at: now) }
        recordingCaptureId = captureId
        declared = []
        pending = []
        lastFlush = [:]
        return note(visible: visible, at: now, force: true)
    }

    /// Ce qui est visible pendant l'enregistrement : seuls les messages jamais
    /// déclarés sous cet identifiant s'ajoutent ; une conversation ne part pas
    /// plus d'une fois par `recordingFlushInterval`.
    public mutating func note(visible: [ContentCaptureCandidate], at now: Date, force: Bool = false) -> [ContentCaptureReport] {
        guard let captureId = recordingCaptureId else { return [] }
        for candidate in visible where candidate.isDeclared {
            let key = Self.key(candidate)
            guard !declared.contains(key), !pending.contains(where: { Self.key($0) == key }) else { continue }
            pending.append(candidate)
        }
        let due = Set(pending.map(\.conversationId)).filter { conversationId in
            force || lastFlush[conversationId].map { now.timeIntervalSince($0) >= Self.recordingFlushInterval } ?? true
        }
        guard !due.isEmpty else { return [] }
        let leaving = pending.filter { due.contains($0.conversationId) }
        pending.removeAll { due.contains($0.conversationId) }
        leaving.forEach { declared.insert(Self.key($0)) }
        due.forEach { lastFlush[$0] = now }
        return ContentCaptureReport.reports(for: leaving, kind: .recording, captureId: captureId)
    }

    /// L'enregistrement s'arrête : ce qui attendait part, et la session s'oublie.
    public mutating func recordingEnded(visible: [ContentCaptureCandidate], at now: Date) -> [ContentCaptureReport] {
        let last = note(visible: visible, at: now, force: true)
        recordingCaptureId = nil
        declared = []
        pending = []
        lastFlush = [:]
        return last
    }

    /// Une déclaration d'enregistrement n'est pas partie : ses messages
    /// redeviennent à déclarer, sous le MÊME identifiant (la passerelle dédoublonne).
    public mutating func reportFailed(_ report: ContentCaptureReport) {
        guard report.kind == .recording, report.captureId == recordingCaptureId else { return }
        report.messageIds.forEach { declared.remove(report.conversationId + "|" + $0) }
    }

    private static func key(_ candidate: ContentCaptureCandidate) -> String {
        candidate.conversationId + "|" + candidate.messageId
    }
}

// MARK: - La déclaration durable (file hors ligne)

/// La charge de la ligne `OutboxKind.reportContentCapture` : la déclaration
/// telle qu'elle partira, rejouée par la file jusqu'à ce que la passerelle la
/// juge.
public struct ReportContentCapturePayload: Codable, Sendable, Equatable {
    public let clientMutationId: String
    public let conversationId: String
    public let messageIds: [String]
    public let kind: ContentCaptureKind
    public let captureId: String

    public init(clientMutationId: String = ClientMutationId.generate(), report: ContentCaptureReport) {
        self.clientMutationId = clientMutationId
        self.conversationId = report.conversationId
        self.messageIds = report.messageIds
        self.kind = report.kind
        self.captureId = report.captureId
    }

    public var report: ContentCaptureReport {
        ContentCaptureReport(conversationId: conversationId, messageIds: messageIds, kind: kind, captureId: captureId)
    }
}

/// **Ce que la file fait d'une déclaration après un essai** — règle pure,
/// lue par le répartiteur de la file.
public enum ContentCaptureDispatchOutcome: Equatable, Sendable {
    /// La passerelle a jugé : la ligne part.
    case done
    /// À rejouer, avec le recul exponentiel de la file.
    case retry
    /// Refus FINAL (non-participant, conversation close, forme refusée) : la
    /// ligne part sans rien annoncer.
    case drop

    /// Essais au-delà desquels un message JUGÉ mais non annoncé n'est plus
    /// rejoué : la passerelle exige sa lecture (`readAt`), que l'accusé de
    /// lecture posé à l'instant de la capture peut n'avoir pas encore livré.
    public static let unnoticedRetries = 2

    public static func of(
        _ result: Result<[String], Error>,
        declared: [String],
        attempts: Int
    ) -> ContentCaptureDispatchOutcome {
        switch result {
        case .success(let noticed):
            let missing = Set(declared).subtracting(noticed)
            return missing.isEmpty || attempts >= unnoticedRetries ? .done : .retry
        case .failure(let refusal as ContentCaptureRefusal) where refusal.code == "RATE_LIMITED":
            return .retry
        case .failure(let refusal as ContentCaptureRefusal) where refusal.isFinal:
            return .drop
        case .failure:
            return .retry
        }
    }
}
