import Foundation
import Testing
@testable import MeeshySDK

/// LE LIEN TEL QUE `GET /relations` LE SERT (#13938) — `RelationLinkView`
/// (`packages/shared/types/relation.ts`). Le décodage est tolérant : un niveau
/// qu'un serveur plus récent ajouterait, ou une valeur illisible, se lit
/// `public` (jamais un niveau plus haut) et `eligibleFor` illisible se lit `nil`.
struct RelationLinkTests {

    private func decode(_ json: String) throws -> RelationLink {
        try JSONDecoder().decode(RelationLink.self, from: Data(json.utf8))
    }

    @Test func decodesTheServedView() throws {
        let link = try decode("""
        {"userId":"u1","effectiveLevel":"FRIEND","grantedByMe":"CLOSE","since":"2026-10-01T10:00:00.000Z",
         "progress":{"activeWeeks":3,"needed":4,"missing":[]},"eligibleFor":null}
        """)
        #expect(link.userId == "u1")
        #expect(link.id == "u1")
        #expect(link.effectiveLevel == .friend)
        #expect(link.grantedByMe == .close)
        #expect(link.progress == RelationProgress(activeWeeks: 3, needed: 4, missing: []))
        #expect(link.eligibleFor == nil)
    }

    @Test func anUnreadableLevelReadsPublic_neverHigher() throws {
        let link = try decode("""
        {"userId":"u1","effectiveLevel":"ATOM","grantedByMe":"MYTHIC","since":null,
         "progress":{"activeWeeks":0,"needed":null,"missing":["audio"]},"eligibleFor":"ATOM"}
        """)
        #expect(link.effectiveLevel == .public)
        #expect(link.grantedByMe == .public)
        #expect(link.eligibleFor == nil)
        #expect(link.progress.missing == ["audio"])
    }

    @Test func aMissingProgressBlockDoesNotDropTheLink() throws {
        let link = try decode(#"{"userId":"u1","effectiveLevel":"ACQUAINTANCE","grantedByMe":"ACQUAINTANCE"}"#)
        #expect(link.effectiveLevel == .acquaintance)
        #expect(link.progress == RelationProgress(activeWeeks: 0, needed: nil, missing: []))
    }

    @Test func roundTripsThroughTheCacheEncoding() throws {
        let link = RelationLink(
            userId: "u2", effectiveLevel: .close, grantedByMe: .blood, since: nil,
            progress: RelationProgress(activeWeeks: 12, needed: 12, missing: []), eligibleFor: .blood
        )
        let decoded = try JSONDecoder().decode(RelationLink.self, from: JSONEncoder().encode(link))
        #expect(decoded == link)
    }

    // MARK: - Ce qu'on PROPOSE (le serveur reste l'autorité)

    private func link(_ level: RelationLevel, eligibleFor: RelationLevel? = nil) -> RelationLink {
        RelationLink(userId: "u", effectiveLevel: level, grantedByMe: level, eligibleFor: eligibleFor)
    }

    @Test func offersTheNextRungWhenNoSeriesIsRequired() {
        #expect(link(.acquaintance).raiseOffer() == .available(.friend))
    }

    @Test func offersCloseOnlyOnceTheSeriesIsServedAsEligible() {
        #expect(link(.friend).raiseOffer() == .locked(.close))
        #expect(link(.friend, eligibleFor: .close).raiseOffer() == .available(.close))
    }

    @Test func offersBloodOnlyOnceTheBloodSeriesIsServedAsEligible() {
        #expect(link(.close, eligibleFor: .close).raiseOffer() == .locked(.blood))
        #expect(link(.close, eligibleFor: .blood).raiseOffer() == .available(.blood))
    }

    @Test func offersNothingAtTheTop() {
        #expect(link(.blood).raiseOffer() == .none)
    }

    // MARK: - La config (libellés des sept langues)

    @Test func theConfigServesTheLabelOfALanguageAndFallsBackToNil() throws {
        let config = try JSONDecoder().decode(RelationsConfig.self, from: Data("""
        {"levels":[{"level":"BLOOD","labelKey":"relation.level.blood","icon":"🩸","labels":{"fr":"Sang","en":"Blood"}}],
         "thresholds":{"close":{"activeWeeks":4}},"features":{"bring":"FRIEND"}}
        """.utf8))
        #expect(config.label(for: .blood, language: "fr") == "Sang")
        #expect(config.label(for: .blood, language: "de") == nil)
        #expect(config.icon(for: .blood) == "🩸")
        #expect(config.icon(for: .close) == nil)
    }
}
