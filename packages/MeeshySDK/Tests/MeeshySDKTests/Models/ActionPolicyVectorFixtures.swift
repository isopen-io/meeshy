import Foundation
@testable import MeeshySDK

/// Lecture des vecteurs COMMUNS de la loi des actions (#11205, #11209) :
/// `packages/shared/fixtures/action-policy/*.vectors.json`, générés en
/// EXÉCUTANT `messageActionsFor` / `conversationActionsFor`. Les attendus sont
/// relus sous leur forme FILAIRE (chaînes, millisecondes) et la sortie Swift y
/// est projetée : un `rawValue` qui dériverait du TypeScript rougit ici.
enum ActionPolicyVectorFixtures {

    static func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Models
            .deletingLastPathComponent()   // MeeshySDKTests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .deletingLastPathComponent()   // packages
            .deletingLastPathComponent()   // racine
    }

    static func load<Vector: Decodable>(_ name: String, as _: Vector.Type) throws -> [Vector] {
        let url = repoRoot().appendingPathComponent("packages/shared/fixtures/action-policy/\(name)")
        return try JSONDecoder().decode(ActionPolicyVectorFile<Vector>.self, from: Data(contentsOf: url)).vectors
    }

    static func date(_ raw: String?) -> Date? {
        raw.flatMap(WireDate.date(from:))
    }

    static func instant(milliseconds: Double) -> Date {
        Date(timeIntervalSince1970: milliseconds / 1_000)
    }

    static func milliseconds(_ date: Date?) -> Int64? {
        date.map { Int64(($0.timeIntervalSince1970 * 1_000).rounded()) }
    }
}

/// `{ $format, vectors }` — le format de `reading-modes/*.vectors.json`.
struct ActionPolicyVectorFile<Vector: Decodable>: Decodable {
    let vectors: [Vector]
}

/// Une valeur JSON quelconque — `metadata` n'a pas de forme fixe.
enum VectorJSONValue: Decodable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([VectorJSONValue])
    case object([String: VectorJSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null; return }
        if let value = try? container.decode(Bool.self) { self = .bool(value); return }
        if let value = try? container.decode(Double.self) { self = .number(value); return }
        if let value = try? container.decode(String.self) { self = .string(value); return }
        if let value = try? container.decode([VectorJSONValue].self) { self = .array(value); return }
        self = .object(try container.decode([String: VectorJSONValue].self))
    }

    var fields: [String: VectorJSONValue] {
        if case .object(let fields) = self { return fields }
        return [:]
    }

    var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }
}

// MARK: - Entrées filaires

struct WireViewer: Decodable {
    let id: String
    let participantId: String?
    let hasAccount: Bool
    let isAnonymous: Bool
    let platformRole: String?
    let conversationRole: String?
    let isActiveMember: Bool
    let canSendMessages: Bool
    let isDeclaredMinor: Bool

    var authority: ConversationViewerAuthority {
        ConversationViewerAuthority(
            id: id,
            participantId: participantId,
            hasAccount: hasAccount,
            isAnonymous: isAnonymous,
            platformRoleRaw: platformRole,
            conversationRoleRaw: conversationRole,
            isActiveMember: isActiveMember,
            canSendMessages: canSendMessages,
            isDeclaredMinor: isDeclaredMinor
        )
    }
}

struct WireConversation: Decodable {
    let type: String
    let encryptionMode: String?
    let isActive: Bool?
    let closedAt: String?
    let isAnnouncementChannel: Bool?
    let defaultWriteRole: String?

    var conversation: MessageActionPolicy.Conversation {
        MessageActionPolicy.Conversation(
            type: type,
            encryptionMode: encryptionMode,
            isActive: isActive,
            closedAt: ActionPolicyVectorFixtures.date(closedAt),
            isAnnouncementChannel: isAnnouncementChannel,
            defaultWriteRole: defaultWriteRole
        )
    }
}

struct WirePiece: Decodable {
    let mimeType: String?
    let originalName: String?
    let fileName: String?
    let isViewOnce: Bool?
    let isBlurred: Bool?
    let effectFlags: UInt32?

    var piece: MessageContentKind.Piece {
        MessageContentKind.Piece(
            mimeType: mimeType,
            originalName: originalName,
            fileName: fileName,
            isViewOnce: isViewOnce,
            isBlurred: isBlurred,
            effectFlags: effectFlags
        )
    }
}

struct WireMessage: Decodable {
    let id: String
    let content: String?
    let messageType: String?
    let deletedAt: String?
    let isViewOnce: Bool?
    let isBlurred: Bool?
    let isEncrypted: Bool?
    let encryptionMode: String?
    let effectFlags: UInt32?
    let expiresAt: String?
    let ephemeralDuration: Double?
    let metadata: VectorJSONValue?
    let attachments: [WirePiece?]?
    let failed: Bool?
    let senderId: String?
    let authorUserId: String?
    let createdAt: String?
    let pinnedAt: String?
    let capturedMessageIsMine: Bool?

    private func carries(_ key: String) -> Bool {
        guard let value = metadata?.fields[key] else { return false }
        return value != .null
    }

    var subject: MessageContentKind.Subject {
        MessageContentKind.Subject(
            id: id,
            content: content,
            messageType: messageType,
            deletedAt: ActionPolicyVectorFixtures.date(deletedAt),
            isViewOnce: isViewOnce,
            isBlurred: isBlurred,
            isEncrypted: isEncrypted,
            encryptionMode: encryptionMode,
            effectFlags: effectFlags,
            expiresAt: ActionPolicyVectorFixtures.date(expiresAt),
            ephemeralDuration: ephemeralDuration,
            metadata: MessageContentKind.Metadata(
                kind: metadata?.fields["kind"]?.stringValue,
                carriesSticker: carries("sticker"),
                carriesLocation: carries("location"),
                carriesPoll: carries("poll")
            ),
            attachments: attachments?.map { $0?.piece },
            failed: failed
        )
    }

    var message: MessageActionPolicy.Message {
        MessageActionPolicy.Message(
            subject: subject,
            senderId: senderId,
            authorUserId: authorUserId,
            createdAt: ActionPolicyVectorFixtures.date(createdAt),
            pinnedAt: ActionPolicyVectorFixtures.date(pinnedAt),
            capturedMessageIsMine: capturedMessageIsMine
        )
    }
}
