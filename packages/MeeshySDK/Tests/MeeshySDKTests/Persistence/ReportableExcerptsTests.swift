import XCTest
import GRDB
@testable import MeeshySDK

/// **Ce qu'un signalement peut joindre d'une personne : ses messages en clair, lus du cache** (#19609).
///
/// La feuille « Signaler » propose les messages que la personne signalée a écrits dans nos conversations. La source
/// est la base locale (cache d'abord, jamais le réseau) et elle ne propose JAMAIS ce qu'un message protège : ni un
/// message supprimé, ni un éphémère, ni une vue unique, ni un flouté, ni un message chiffré de bout en bout (la ligne
/// n'en garde pas le clair), ni le texte d'un autre auteur.
final class ReportableExcerptsTests: XCTestCase {

    private static let author = "6a9e11d7c2b84f0193ac55e1"
    private static let other = "6a9e11d7c2b84f0193ac55e2"

    private func makeActor() throws -> MessagePersistenceActor {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        return MessagePersistenceActor(dbWriter: queue)
    }

    private func message(_ id: String, sender: String = author, content: String = "Réponds. Je sais que tu es là.",
                         at stamp: String = "2026-11-17T22:41:00.000Z", extra: [String: Any] = [:]) throws -> APIMessage {
        var json: [String: Any] = [
            "id": id, "conversationId": "6ab16c0b67c87be0efa9a50e", "senderId": sender, "content": content,
            "messageType": "text", "messageSource": "user", "isEncrypted": false,
            "createdAt": stamp, "updatedAt": stamp,
        ]
        extra.forEach { json[$0.key] = $0.value }
        let data = try JSONSerialization.data(withJSONObject: json)
        return try MeeshyCoders.decoder(.api).decode(APIMessage.self, from: data)
    }

    func test_reportableExcerpts_servesTheAuthorsPlainMessages_newestFirst() async throws {
        let actor = try makeActor()
        try await actor.upsertFromAPIMessages([
            try message("6ab3e5ac5654dc8abab48f01", content: "Réponds. Je sais que tu es là.", at: "2026-11-16T22:41:00.000Z"),
            try message("6ab3e5ac5654dc8abab48f02", content: "Tu ne peux pas m'ignorer comme ça.", at: "2026-11-17T07:12:00.000Z"),
        ])

        let excerpts = try ReportableMessageExcerpts.read(in: actor, fromSender: Self.author)

        XCTAssertEqual(excerpts.map(\.messageId), ["6ab3e5ac5654dc8abab48f02", "6ab3e5ac5654dc8abab48f01"])
        XCTAssertEqual(excerpts.first?.text, "Tu ne peux pas m'ignorer comme ça.")
        XCTAssertEqual(excerpts.first?.conversationId, "6ab16c0b67c87be0efa9a50e")
    }

    func test_reportableExcerpts_neverServesAnotherAuthor() async throws {
        let actor = try makeActor()
        try await actor.upsertFromAPIMessages([try message("6ab3e5ac5654dc8abab48f03", sender: Self.other)])

        XCTAssertTrue(try ReportableMessageExcerpts.read(in: actor, fromSender: Self.author).isEmpty)
    }

    func test_reportableExcerpts_neverServesAProtectedMessage() async throws {
        let actor = try makeActor()
        try await actor.upsertFromAPIMessages([
            try message("6ab3e5ac5654dc8abab48f04", extra: ["isViewOnce": true, "effectFlags": 4]),
            try message("6ab3e5ac5654dc8abab48f05", extra: ["isBlurred": true, "effectFlags": 2]),
            try message("6ab3e5ac5654dc8abab48f06", extra: ["expiresAt": "2099-01-01T00:00:00.000Z"]),
            try message("6ab3e5ac5654dc8abab48f07", extra: ["deletedAt": "2026-11-17T08:00:00.000Z"]),
        ])

        XCTAssertTrue(try ReportableMessageExcerpts.read(in: actor, fromSender: Self.author).isEmpty)
    }

    func test_reportableExcerpts_neverServesAnEndToEndMessage() async throws {
        let actor = try makeActor()
        try await actor.upsertFromAPIMessages([
            try message("6ab3e5ac5654dc8abab48f08", extra: ["isEncrypted": true, "encryptionMode": "e2ee"]),
        ])

        XCTAssertTrue(try ReportableMessageExcerpts.read(in: actor, fromSender: Self.author).isEmpty)
    }

    func test_reportableExcerpts_skipsBlankText_andKeepsTheLimit() async throws {
        let actor = try makeActor()
        try await actor.upsertFromAPIMessages([
            try message("6ab3e5ac5654dc8abab48f09", content: "   ", at: "2026-11-17T09:00:00.000Z"),
            try message("6ab3e5ac5654dc8abab48f0a", content: "Un", at: "2026-11-17T08:00:00.000Z"),
            try message("6ab3e5ac5654dc8abab48f0b", content: "Deux", at: "2026-11-17T07:00:00.000Z"),
        ])

        let excerpts = try ReportableMessageExcerpts.read(in: actor, fromSender: Self.author, limit: 1)

        XCTAssertEqual(excerpts.map(\.text), ["Un"])
    }
}
