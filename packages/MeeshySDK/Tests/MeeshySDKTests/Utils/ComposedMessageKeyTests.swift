import XCTest
@testable import MeeshySDK

/// **La clé d'idempotence s'attribue à la COMPOSITION, jamais à l'ÉMISSION** (#6915).
///
/// Mesuré en production : chaque copie d'un message dupliqué portait SA
/// propre `clientMessageId`, que la déduplication `(conversationId,
/// clientMessageId)` ne pouvait donc pas reconnaître. Un renvoi du même texte
/// composé, après un échec qui a rendu ce texte au composeur, doit porter la
/// clé de la première tentative ; un texte nouveau en reçoit une neuve.
final class ComposedMessageKeyTests: XCTestCase {

    private func counter() -> () -> String {
        var minted = 0
        return {
            minted += 1
            return "cid_minted_\(minted)"
        }
    }

    func test_resolve_withoutRetainedKey_mintsAFreshKey() {
        let key = ComposedMessageKey.resolve(for: "bonjour", retained: nil, mint: counter())

        XCTAssertEqual(key, ComposedMessageKey(text: "bonjour", clientMessageId: "cid_minted_1"))
    }

    func test_resolve_sameTextAfterFailure_reusesTheComposedKey() {
        let mint = counter()
        let first = ComposedMessageKey.resolve(for: "bonjour", retained: nil, mint: mint)
        let retry = ComposedMessageKey.resolve(for: "bonjour", retained: first, mint: mint)

        XCTAssertEqual(retry.clientMessageId, first.clientMessageId)
    }

    func test_resolve_editedText_isANewCompositionWithANewKey() {
        let mint = counter()
        let first = ComposedMessageKey.resolve(for: "bonjour", retained: nil, mint: mint)
        let edited = ComposedMessageKey.resolve(for: "bonjour à tous", retained: first, mint: mint)

        XCTAssertNotEqual(edited.clientMessageId, first.clientMessageId)
        XCTAssertEqual(edited.text, "bonjour à tous")
    }

    func test_resolve_defaultMint_producesACanonicalClientMessageId() {
        let key = ComposedMessageKey.resolve(for: "bonjour", retained: nil)

        XCTAssertTrue(ClientMessageId.isValid(key.clientMessageId), key.clientMessageId)
    }
}
