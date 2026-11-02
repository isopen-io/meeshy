import Foundation
import Testing
@testable import MeeshySDK

/// Le déroulé du moteur du translator (`test_protected_identities.py`, partie
/// `TranslatorEngine`), rejoué sur l'appareil (#14333). Un « moteur » est ici une
/// fonction de texte appliquée à chaque demande.
struct TranslationShieldedBatchTests {

    private static let sharedReel = "🔗 Reel de recretrait_b: https://staging.meeshy.me/l/I0tqQp"

    private func rewriteWords(_ text: String) -> String {
        text.components(separatedBy: " ").map { $0.contains("🔹") ? $0 : "«\($0)»" }.joined(separator: " ")
    }

    /// Un moteur qui avale les marqueurs dès que la phrase en contient.
    private func dropMarkers(_ text: String) -> String {
        text.components(separatedBy: " ").filter { !$0.contains("🔹") }.map { "«\($0)»" }.joined(separator: " ")
    }

    private func run(_ engine: (String) -> String, on requests: [TranslationShieldedPiece]) -> [String: String] {
        Dictionary(uniqueKeysWithValues: requests.map { ($0.id, engine($0.text)) })
    }

    private func translate(_ texts: [String], with engine: (String) -> String) -> (served: [String], seen: [String]) {
        let batch = TranslationShieldedBatch(texts.enumerated().map { TranslationShieldedPiece(id: "\($0.offset)", text: $0.element) })
        var seen = batch.requests.map(\.text)
        let settlement = batch.settle(run(engine, on: batch.requests))
        var served = settlement.served
        if let retry = settlement.retry {
            seen += retry.requests.map(\.text)
            served.merge(retry.settle(run(engine, on: retry.requests))) { first, _ in first }
        }
        return (texts.indices.map { served["\($0)"] ?? "∅" }, seen)
    }

    @Test func theSharedReelReachesTheReaderWithAuthorAndLinkIntact() {
        let result = translate([Self.sharedReel], with: rewriteWords).served[0]

        #expect(result.contains("recretrait_b"))
        #expect(result.contains("https://staging.meeshy.me/l/I0tqQp"))
        #expect(result.hasPrefix("🔗"))
    }

    @Test func noIdentityIsEverGivenToTheEngine() {
        let seen = translate([Self.sharedReel, "Écris à contact@meeshy.me ou @ami_2"], with: dropMarkers).seen.joined()

        for identity in ["recretrait_b", "https://", "contact@meeshy.me", "@ami_2"] {
            #expect(!seen.contains(identity))
        }
    }

    @Test func anAddressAloneIsServedUntouchedWithoutTheEngine() {
        let outcome = translate(["https://staging.meeshy.me/l/I0tqQp"], with: { "«\($0)»" })

        #expect(outcome.served == ["https://staging.meeshy.me/l/I0tqQp"])
        #expect(outcome.seen.isEmpty)
    }

    @Test func aTranslationThatLostAMarkerFallsBackToTranslatingBetweenMarkers() {
        #expect(translate(["Regarde https://a.com maintenant"], with: dropMarkers).served == ["«Regarde» https://a.com «maintenant»"])
    }

    @Test func aTranslationThatAlteredAMarkerIsNeverServed() {
        let engine: (String) -> String = { $0.contains("🔹") ? $0.replacingOccurrences(of: "EMOJI_0", with: "EMOJI_1") : "«\($0)»" }

        #expect(translate(["Voici @ami et @amie"], with: engine).served == ["«Voici» @ami «et» @amie"])
    }

    @Test func theBatchPathFallsBackToo() {
        let served = translate([Self.sharedReel, "Voici @ami", "Va sur https://a.com vite"], with: dropMarkers).served

        #expect(served[0].contains("recretrait_b") && served[0].contains("https://staging.meeshy.me/l/I0tqQp"))
        #expect(served[1] == "«Voici» @ami")
        #expect(served[2] == "«Va» «sur» https://a.com «vite»")
    }

    @Test func whenEvenTheFallbackLosesAMarkerTheTextIsNotServed() {
        let engine: (String) -> String = { $0.contains("🔹") ? "perdu" : "🔹EMOJI_9🔹 \($0)" }

        #expect(translate(["Voici @ami"], with: engine).served == ["∅"])
    }

    @Test func aTextTheEngineDidNotTranslateIsNeitherServedNorRetried() {
        let batch = TranslationShieldedBatch([TranslationShieldedPiece(id: "a", text: "Voici @ami")])
        let settlement = batch.settle([:])

        #expect(settlement.served.isEmpty)
        #expect(settlement.retry == nil)
    }
}
