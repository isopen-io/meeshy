import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **La Rivière ne réindexe plus tout son fil à chaque passe de `body` (#3946).**
///
/// `RiverStreamHost` déclarait `contentByMessageId` et `bubbleByRank` en
/// propriétés calculées : deux dictionnaires de TOUT le fil, reconstruits à
/// chaque lecture. Or la grille les lit pour CHAQUE rang et CHAQUE couloir
/// réalisés, et son `body` repasse à chaque publication de cadres — donc à
/// chaque image de défilement. Sur mille messages, vingt rangs visibles et sept
/// couloirs : des centaines de milliers d'insertions par image. L'échelle du
/// temps (`RiverTimeScale.resolve`, un tri de tout le fil) suivait le même
/// chemin.
///
/// Le rendu (contenus + index + échelle) se construit désormais UNE fois par
/// changement réel d'entrée — la clé de #3946, traduction comprise — et la peau
/// ne fait plus que le lire.
@MainActor
final class RiverRenderingMemoTests: XCTestCase {

    private static let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    private func message(_ id: String, sender: String, minutes: Double) -> MeeshyMessage {
        MeeshyMessage(
            id: id, conversationId: "c", senderId: sender, content: "texte \(id)",
            createdAt: Self.t0.addingTimeInterval(minutes * 60), updatedAt: Self.t0
        )
    }

    private var thread: [MeeshyMessage] {
        [
            message("m1", sender: "moi", minutes: 0),
            message("m2", sender: "toi", minutes: 3),
            message("m3", sender: "elle", minutes: 90),
        ]
    }

    private func geometry(_ messages: [MeeshyMessage]) -> RiverLaneResolver.RiverGeometry {
        RiverConversationMapping.resolveGeometry(messages: messages, viewerId: "moi")
    }

    private func key(_ messages: [MeeshyMessage], text: @escaping (MeeshyMessage) -> String = { $0.content })
        -> RiverConversationMapping.ContentsKey {
        RiverConversationMapping.contentsKey(geometry: geometry(messages), messages: messages, viewerId: "moi", text: text)
    }

    private func contents(_ messages: [MeeshyMessage], text: @escaping (MeeshyMessage) -> String = { $0.content })
        -> [RiverBubbleContent] {
        RiverConversationMapping.contents(geometry: geometry(messages), messages: messages, viewerId: "moi",
                                          text: text, time: { _ in "12:45" })
    }

    // MARK: - Une construction par entrée, pas par passe

    func test_rendering_sameKeyOnEveryPass_buildsOnce() {
        let memo = RiverRenderingMemo()
        let messages = thread
        for _ in 0..<50 {
            _ = memo.rendering(for: key(messages), geometry: geometry(messages)) { contents(messages) }
        }
        XCTAssertEqual(memo.buildCount, 1, "cinquante passes sans entrée nouvelle ne reconstruisent rien")
    }

    /// Le Prisme n'est pas figé par le cache : une traduction qui arrive
    /// reconstruit le rendu, et la bulle sert le texte traduit.
    func test_rendering_translationArrives_rebuildsAndServesIt() {
        let memo = RiverRenderingMemo()
        let messages = thread
        _ = memo.rendering(for: key(messages), geometry: geometry(messages)) { contents(messages) }
        let traduit: (MeeshyMessage) -> String = { $0.id == "m2" ? "Bonjour" : $0.content }
        let rendering = memo.rendering(for: key(messages, text: traduit), geometry: geometry(messages)) {
            contents(messages, text: traduit)
        }
        XCTAssertEqual(memo.buildCount, 2)
        XCTAssertEqual(rendering.contentByMessageId["m2"]?.text, "Bonjour")
    }

    func test_rendering_messageArrives_rebuilds() {
        let memo = RiverRenderingMemo()
        let avant = thread
        let apres = avant + [message("m4", sender: "toi", minutes: 95)]
        _ = memo.rendering(for: key(avant), geometry: geometry(avant)) { contents(avant) }
        let rendering = memo.rendering(for: key(apres), geometry: geometry(apres)) { contents(apres) }
        XCTAssertEqual(memo.buildCount, 2)
        XCTAssertNotNil(rendering.contentByMessageId["m4"])
    }

    // MARK: - Ce que la peau lit

    func test_rendering_indexesEveryBubbleByRank_andEveryContentByMessage() {
        let messages = thread
        let geometry = geometry(messages)
        let rendering = RiverRendering(geometry: geometry, contents: contents(messages))

        XCTAssertEqual(rendering.bubbleByRank.count, geometry.bubbles.count)
        for bubble in geometry.bubbles {
            XCTAssertEqual(rendering.bubbleByRank[bubble.rank], bubble)
            XCTAssertEqual(rendering.contentByMessageId[bubble.messageId]?.bubble, bubble)
        }
    }

    func test_rendering_timeScale_isTheLawsScaleForTheGeometry() {
        let messages = thread
        let geometry = geometry(messages)
        let expected = RiverTimeScale.resolve(
            ranks: geometry.bubbles.map { RiverTimeScale.RankTime(rank: $0.rank, timeMs: $0.createdAtMs) },
            calendar: .current
        )
        XCTAssertNotNil(expected)
        XCTAssertEqual(RiverRendering(geometry: geometry, contents: contents(messages)).timeScale, expected)
    }

    func test_rendering_emptyThread_hasNoScaleAndNoIndex() {
        let rendering = RiverRendering(geometry: geometry([]), contents: [])
        XCTAssertNil(rendering.timeScale)
        XCTAssertTrue(rendering.bubbleByRank.isEmpty)
        XCTAssertTrue(rendering.contentByMessageId.isEmpty)
    }

    // MARK: - La peau ne réindexe plus

    func test_streamHost_buildsNoIndexAndNoScaleInItsBody() throws {
        let path = "Meeshy/Features/Main/Riviere/View/RiverStreamHost.swift"
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
        XCTAssertFalse(code.isEmpty)
        for forbidden in ["Dictionary(uniqueKeysWithValues", "Dictionary(grouping", "RiverTimeScale.resolve("] {
            XCTAssertFalse(code.contains(forbidden),
                           "`RiverStreamHost` contient `\(forbidden)` — un index du fil se reconstruirait à chaque passe")
        }
        XCTAssertTrue(code.contains("let rendering: RiverRendering"), "la peau reçoit le rendu déjà indexé")
    }
}
