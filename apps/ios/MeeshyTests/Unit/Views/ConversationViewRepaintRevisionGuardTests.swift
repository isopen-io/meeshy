import XCTest

/// #10751 — `MeeshyConversation.==` ne compare que l'`id` : une copie repeinte écrite dans
/// `@State` est une valeur égale et ne redessine pas le fil. Une révision entière, lue par
/// `liveConversation`, porte l'invalidation.
final class ConversationViewRepaintRevisionGuardTests: XCTestCase {
    private func source() throws -> String {
        let file = URL(fileURLWithPath: #filePath)
        let root = file.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Views/ConversationView.swift"), encoding: .utf8)
    }

    func test_admitRepainted_bumpsARevisionSoTheThreadRedraws() throws {
        let text = try source()
        let body = try XCTUnwrap(text.range(of: "func admitRepainted").map { String(text[$0.lowerBound...].prefix(260)) })
        XCTAssertTrue(body.contains("repaintRevision &+= 1"))
    }

    /// Les réglages enregistrés (`onConversationUpdated`) réécrivaient l'override EN DIRECT : un second
    /// enregistrement (même `id`) ne redessinait rien. Tout passe par `admitRepainted`.
    func test_conversationOverride_hasASingleWriter() throws {
        let text = try source()
        XCTAssertEqual(text.components(separatedBy: "conversationOverride = ").count - 1, 1)
    }

    func test_liveConversation_readsTheRevisionToDependOnIt() throws {
        let text = try source()
        let body = try XCTUnwrap(text.range(of: "var liveConversation").map { String(text[$0.lowerBound...].prefix(160)) })
        XCTAssertTrue(body.contains("_ = repaintRevision"))
    }
}
