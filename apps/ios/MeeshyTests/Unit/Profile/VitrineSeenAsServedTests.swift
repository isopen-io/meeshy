import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// La fiche que le serveur sert à chaque cercle ; un cercle sans fiche échoue au réseau.
private nonisolated struct SeenAsServiceDouble: ProfileSeenAsProviding {
    let profiles: [RelationLevel: PublicProfile]

    func vitrine(handle: String, seenAs level: RelationLevel) async throws -> PublicProfile {
        guard let profile = profiles[level] else { throw URLError(.notConnectedToInternet) }
        return profile
    }
}

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

    /// Une fiche servie qui ferme le jeu à Ami (version de la loi, âge du propriétaire) : le cran Ami le dit fermé.
    func test_crans_ofAServedFriendProfile_openOnlyWhatItServesOpen() throws {
        let friend = try served("""
        {"id":"me","username":"aicha","viewAs":"FRIEND","circle":{"level":"FRIEND","capabilities":{
         "presence":{"state":"open"},"game":{"state":"locked","circle":"CLOSE"},
         "directMessage":{"state":"open"}}}}
        """)
        let crans = VitrineCran.make(ownerRole: nil, served: [.friend: friend])
        XCTAssertEqual(crans[1].opened, [.presence], "le jeu fermé par la fiche servie ne s'ouvre pas au cran Ami")
        XCTAssertEqual(crans[1].contact, .write)
        XCTAssertEqual(crans[0].opened, [], "le Public non servi reste lu dans la loi")
    }

    private func waitUntil(_ condition: @MainActor () -> Bool) async {
        for _ in 0..<200 where !condition() { try? await Task.sleep(nanoseconds: 10_000_000) }
    }

    private func seenAsService() throws -> SeenAsServiceDouble {
        let common = #""username":"aicha","voicePublic":true,"voiceSampleUrl":"/v.m4a","languages":["fr","en"],"isOnline":true"#
        let publicProfile = try served("""
        {"id":"me",\(common),"viewAs":"PUBLIC","circle":{"level":"PUBLIC","capabilities":{
         "presence":{"state":"locked","circle":"FRIEND"},"messageRequest":{"state":"open"}}}}
        """)
        let friendProfile = try served("""
        {"id":"me",\(common),"viewAs":"FRIEND","circle":{"level":"FRIEND","capabilities":{
         "presence":{"state":"open"},"game":{"state":"open"},"directMessage":{"state":"open"}}}}
        """)
        return SeenAsServiceDouble(profiles: [.public: publicProfile, .friend: friendProfile])
    }

    /// De bout en bout : la fiche servie garde ma voix publique et mes langues, et « En ligne » ne s'allume qu'au cran
    /// dont la vue servie ouvre la présence — jamais au Public, même si la charge porte `isOnline`.
    func test_seenAsModel_keepsVoiceAndLanguages_andLightsOnlineOnlyWhereTheServedViewOpensPresence() async throws {
        let owner = MeeshyUser(id: "me", username: "aicha", systemLanguage: "es")
        let service = try seenAsService()
        let model = VitrineSeenAsViewModel(handle: "aicha", ownerRole: nil, initial: .public, service: service)

        model.start()
        await waitUntil { model.preview.source == .served }

        XCTAssertEqual(model.preview.level, .public)
        let publicUser = VitrineSeenAsView.shownUser(of: model.preview, owner: owner)
        XCTAssertEqual(VitrineSeenAsView.publicVoice(of: publicUser)?.url, "/v.m4a", "ma voix publique reste servie")
        XCTAssertEqual(VitrineSeenAsView.shownLanguages(of: model.preview, owner: owner).codes, ["fr", "en"])
        XCTAssertFalse(model.preview.isOnline, "le Public ne lit pas ma présence")

        model.select(.friend)
        await waitUntil { model.preview.level == .friend && model.preview.source == .served }

        XCTAssertEqual(model.preview.source, .served)
        XCTAssertTrue(model.preview.isOnline, "Ami ouvre la présence, et le serveur l'a servie")
        let friendUser = VitrineSeenAsView.shownUser(of: model.preview, owner: owner)
        XCTAssertEqual(VitrineSeenAsView.publicVoice(of: friendUser)?.url, "/v.m4a")
        XCTAssertEqual(VitrineSeenAsView.shownLanguages(of: model.preview, owner: owner).codes, ["fr", "en"])
    }

    /// Sans réponse du serveur, le cran reste projeté : aucune présence inventée, mes langues lues dans mes rangs.
    func test_seenAsModel_withoutAServedProfile_inventsNoPresence() async {
        let owner = MeeshyUser(id: "me", username: "aicha", systemLanguage: "fr", regionalLanguage: "en")
        let model = VitrineSeenAsViewModel(handle: "aicha", ownerRole: nil, initial: .blood,
                                           service: SeenAsServiceDouble(profiles: [:]))

        model.start()
        await waitUntil { model.preview.source == .served }

        XCTAssertEqual(model.preview.source, .projected)
        XCTAssertFalse(model.preview.isOnline, "la projection n'invente aucune présence")
        XCTAssertEqual(VitrineSeenAsView.shownLanguages(of: model.preview, owner: owner).codes, ["fr", "en"])
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
