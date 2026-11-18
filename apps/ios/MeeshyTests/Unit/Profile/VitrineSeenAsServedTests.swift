import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// « Voir comme » (#18869) se lit dans la fiche SERVIE à chaque cercle dès qu'elle existe : les langues qu'elle sert,
/// les crans qu'elle décide, les publications que le cercle voit, les personnes de chaque cercle.
@MainActor
final class VitrineSeenAsServedTests: XCTestCase {

    private func served(_ json: String) throws -> PublicProfile {
        try JSONDecoder().decode(PublicProfile.self, from: Data(json.utf8))
    }

    /// La fiche publique ne sert plus les trois rangs, seulement `languages` : les pastilles la lisent.
    func test_servedProfile_keepsItsLanguages_andTheChipsReadThem() throws {
        let profile = try served(#"{"id":"me","username":"aicha","languages":["fr","en"],"viewAs":"PUBLIC"}"#)
        XCTAssertEqual(profile.languages, ["fr", "en"])
        let preview = VitrinePreview.make(level: .public, served: profile)
        let owner = MeeshyUser(id: "me", username: "aicha", systemLanguage: "es")
        XCTAssertEqual(VitrineSeenAsView.shownLanguages(of: preview, owner: owner).codes, ["fr", "en"])
    }

    func test_projection_readsTheOwnersThreeRanks() {
        let preview = VitrinePreview.make(level: .friend, served: nil)
        let owner = MeeshyUser(id: "me", username: "aicha", systemLanguage: "fr", regionalLanguage: "en")
        XCTAssertEqual(VitrineSeenAsView.shownLanguages(of: preview, owner: owner).codes, ["fr", "en"])
    }

    func test_servedProfileWithoutLanguages_decodesEmpty() throws {
        XCTAssertEqual(try served(#"{"id":"me","username":"aicha"}"#).languages, [])
    }

    /// Un propriétaire mineur ferme « Demander à écrire » au Public : la carte du cran suit la fiche servie.
    func test_crans_followTheServedProfile_ofTheirCircle() throws {
        let profile = try served("""
        {"id":"me","username":"aicha","viewAs":"PUBLIC","circle":{"level":"PUBLIC","capabilities":{
         "directMessage":{"state":"locked","circle":"FRIEND"},
         "messageRequest":{"state":"locked","circle":"ACQUAINTANCE"}}}}
        """)
        let crans = VitrineCran.make(ownerRole: nil, served: [.public: profile])
        XCTAssertEqual(crans.first?.level, .public)
        XCTAssertEqual(crans.first?.contact, .unavailable)
        XCTAssertEqual(VitrineCran.make(ownerRole: nil).first?.contact, .requestToWrite, "la projection, elle, l'ouvrait")
    }

    func test_crans_sitSideBySide_untilAnAccessibilitySize() {
        XCTAssertFalse(VitrineCransSection.stacksVertically(.large), "la rangée à la taille par défaut")
        XCTAssertFalse(VitrineCransSection.stacksVertically(.xxxLarge))
        XCTAssertTrue(VitrineCransSection.stacksVertically(.accessibility1))
    }

    func test_publications_showOnlyWhatTheCircleSees_failClosed() {
        let posts = ["PUBLIC", "FRIENDS", "ONLY", "BLOOD"].enumerated().map { index, visibility in
            var post = FeedPost(id: "p\(index)", author: "aicha", authorId: "me", content: "c")
            post.visibility = visibility
            return post
        } + [FeedPost(id: "unsaid", author: "aicha", authorId: "me", content: "c")]
        XCTAssertEqual(VitrineSeenAsView.visiblePublications(posts, to: .public).map(\.id), ["p0"])
        XCTAssertEqual(VitrineSeenAsView.visiblePublications(posts, to: .friend).map(\.id), ["p0", "p1"])
        XCTAssertEqual(VitrineSeenAsView.visiblePublications(posts, to: .blood).map(\.id), ["p0", "p1", "p3"],
                       "une audience choisie ou absente ne se montre à aucun cercle")
    }

    func test_ladderCount_isTheServedCircle_andNothingWithoutIt() {
        let summary = ProfileCirclesSummary.make(links: [
            RelationLink(userId: "a", effectiveLevel: .friend, grantedByMe: .friend)
        ], pendingCount: 0)
        XCTAssertEqual(VitrineSeenAsView.ladderCount(of: .friend, in: summary), 1)
        XCTAssertEqual(VitrineSeenAsView.ladderCount(of: .blood, in: summary), 0)
        XCTAssertNil(VitrineSeenAsView.ladderCount(of: .public, in: summary), "le Public n'a pas de personnes")
        XCTAssertNil(VitrineSeenAsView.ladderCount(of: .friend, in: nil), "rien de servi : rien d'affiché")
    }

    /// Les annonces passent par le catalogue (arguments positionnels) et disent les nombres comme la bande les écrit.
    func test_spokenLabels_comeFromTheCatalog_andSayFormattedNumbers() {
        let cran = VitrineCran(level: .friend, opened: [.presence], contact: .write)
        XCTAssertEqual(cran.spokenLabel, VitrineSeenAsCopy.cranSpoken(circle: CircleLevelNames.title(of: .friend),
                                                                      opens: VitrineSeenAsCopy.rowTitle(.presence),
                                                                      contact: VitrineSeenAsCopy.write))
        let stats = UserStats(totalMessages: 12_480, totalConversations: 3, totalTranslations: 40)
        let locale = Locale(identifier: "fr_FR")
        let label = ProfileActivityBand.accessibilityLabel(stats: stats, locale: locale)
        XCTAssertTrue(label.contains(12_480.formatted(.number.locale(locale))), label)
    }

    func test_seenAs_drawsTheLanguagesWithTheProfileChips_andMovesByTheKitToken() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Profile/Faces/VitrineSeenAsView.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(source.contains("ProfileLanguageChips(languages: Self.shownLanguages(of: model.preview, owner: user))"))
        XCTAssertFalse(source.contains("languageNames(of:"), "aucune jumelle des pastilles de langues")
        XCTAssertTrue(source.contains(".meeshyMotion(.morph, value: model.level)"))
        XCTAssertFalse(source.contains("MeeshyAnimation.springDefault"))
        XCTAssertFalse(source.contains("circlePicker(form: .ladder)"), "l'en-tête épinglé ne s'empile pas")
    }
}
