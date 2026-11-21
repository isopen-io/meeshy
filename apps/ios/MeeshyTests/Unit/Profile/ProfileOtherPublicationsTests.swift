import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Les publications d'un autre (#19431, planche `Autre-Publications`) : le genre de chaque publication, les tuiles de
/// la grille du kit (K49), le compte, la phrase de fin, et la marque de traduction (K51) du détail qu'on ouvre.
@MainActor
final class ProfileOtherPublicationsTests: XCTestCase {

    private func post(_ id: String, type: String? = nil, content: String = "", media: [FeedMedia] = [],
                      translatedContent: String? = nil, timestamp: Date = Date()) -> FeedPost {
        FeedPost(id: id, author: "Léo Marchetti", type: type, content: content, timestamp: timestamp, media: media,
                 originalLanguage: translatedContent == nil ? nil : "it", translatedContent: translatedContent)
    }

    private var photo: FeedMedia { FeedMedia(type: .image, url: "/p.jpg", width: 300, height: 400) }

    // MARK: - Genres (K04)

    func test_genre_isReadOnTheServedType_thenOnTheMedia_andATextAloneHasNone() {
        XCTAssertEqual(ProfilePublicationGenre.of(post("r", type: "REEL")), .reels)
        XCTAssertEqual(ProfilePublicationGenre.of(post("s", type: "STORY")), .stories)
        XCTAssertEqual(ProfilePublicationGenre.of(post("m", type: "STATUS", content: "Lumière")), .statuses)
        XCTAssertEqual(ProfilePublicationGenre.of(post("p", type: "POST", media: [photo])), .photos)
        XCTAssertNil(ProfilePublicationGenre.of(post("t", type: "POST", content: "Bonjour")))
    }

    func test_genres_areTheFiveChipsOfThePlanche_inTheirOrder() {
        XCTAssertEqual(ProfilePublicationGenre.allCases, [.all, .photos, .reels, .stories, .statuses])
    }

    func test_tiles_ofAGenre_keepOnlyItsPublications_andAllKeepsEverything() {
        let posts = [post("r", type: "REEL", media: [FeedMedia(type: .video, thumbnailUrl: "/r.jpg", duration: 24)]),
                     post("p", media: [photo]), post("t", content: "Bonjour")]
        XCTAssertEqual(ProfilePublicationsGrid.tiles(posts: posts, isLoading: false, genre: .reels).map(\.id), ["r"])
        XCTAssertEqual(ProfilePublicationsGrid.tiles(posts: posts, isLoading: false, genre: .photos).map(\.id), ["p"])
        XCTAssertEqual(ProfilePublicationsGrid.tiles(posts: posts, isLoading: false, genre: .all).map(\.id), ["r", "p", "t"])
        XCTAssertTrue(ProfilePublicationsGrid.tiles(posts: posts, isLoading: false, genre: .statuses).isEmpty)
    }

    func test_tiles_onAnEmptyCacheWhileLoading_areSkeletons_neverASpinner() {
        let tiles = ProfilePublicationsGrid.tiles(posts: [], isLoading: true, genre: .all)
        XCTAssertEqual(tiles.count, ProfilePublicationsGrid.skeletonCount)
        XCTAssertTrue(tiles.allSatisfy { $0.kind == .skeleton })
        XCTAssertTrue(ProfilePublicationsGrid.tiles(posts: [], isLoading: false, genre: .all).isEmpty)
    }

    // MARK: - Tuiles (K49)

    func test_statusTile_isATextTile_overlinedStatus_withTheMoodGlyph() {
        let tile = ProfilePublicationsGrid.item(for: post("m", type: "STATUS", content: " Lumière de 18 h "))
        XCTAssertEqual(tile.kind, .text)
        XCTAssertEqual(tile.text, "Lumière de 18 h")
        XCTAssertEqual(tile.overline, ProfilePublicationGenre.statusName)
        XCTAssertEqual(tile.badge, MeeshyMediaTileBadge(systemImage: "face.smiling"))
    }

    func test_translatedTextTile_showsTheServedTranslation_markedTranslated_andSaysIt() {
        let tile = ProfilePublicationsGrid.item(for: post("t", content: "Il tram 28", translatedContent: "Le tram 28"))
        XCTAssertEqual(tile.text, "Le tram 28", "le Prisme a choisi la langue : la tuile sert la traduction")
        XCTAssertEqual(tile.badge, MeeshyMediaTileBadge(systemImage: "translate"))
        XCTAssertEqual(tile.overline, ProfilePublicationsGridCopy.translated)
        XCTAssertTrue(tile.label.contains(ProfilePublicationsGridCopy.translatedSpoken), tile.label)
    }

    func test_untranslatedTextTile_carriesNoMark() {
        let tile = ProfilePublicationsGrid.item(for: post("t", content: "Bonjour"))
        XCTAssertNil(tile.badge)
        XCTAssertNil(tile.overline)
    }

    func test_albumTile_saysHowManyPictures_andAReelItsDuration_standingUp() {
        let album = post("a", media: [photo, photo, photo, photo])
        XCTAssertEqual(ProfilePublicationsGrid.item(for: album).badge,
                       MeeshyMediaTileBadge(systemImage: "square.on.square", value: "4"))
        let reel = post("r", type: "REEL", media: [FeedMedia(type: .video, thumbnailUrl: "/r.jpg", duration: 24)])
        let tile = ProfilePublicationsGrid.item(for: reel)
        XCTAssertEqual(tile.kind, .media)
        XCTAssertEqual(tile.badge, ProfilePublicationTiles.badge(of: reel))
        XCTAssertEqual(tile.aspect, ProfilePublicationsGrid.reelAspect)
        XCTAssertNil(ProfilePublicationsGrid.item(for: post("p", media: [photo])).badge, "une photo seule ne dit rien")
    }

    // MARK: - Compte et fin

    func test_totalLine_addsEveryGenre_andSaysPlusWhileItIsOnlyALowerBound() {
        let exact = ProfilePostsCounts(posts: 40, reels: 20, stories: 4, isApproximate: false)
        XCTAssertEqual(ProfilePublicationsGrid.totalLine(counts: exact),
                       String(format: ProfilePublicationsGridCopy.totalFormat, "64"))
        let bound = ProfilePostsCounts(posts: 10, reels: 2, stories: 0, isApproximate: true)
        XCTAssertEqual(ProfilePublicationsGrid.totalLine(counts: bound),
                       String(format: ProfilePublicationsGridCopy.totalFormat, "12+"))
        XCTAssertNil(ProfilePublicationsGrid.totalLine(counts: ProfilePostsCounts(posts: 0, reels: 0, stories: 0,
                                                                                  isApproximate: true)))
    }

    func test_endMessage_namesTheAuthorByFirstName_andTheMonthOfTheFirstPublication() throws {
        let january = try XCTUnwrap(DateComponents(calendar: Calendar(identifier: .gregorian), year: 2026, month: 1,
                                                   day: 12, hour: 12).date)
        let french = Locale(identifier: "fr_FR")
        XCTAssertEqual(ProfilePublicationsGrid.sinceText(january, locale: french), "janvier 2026")
        let message = ProfilePublicationsGrid.endMessage(authorName: "Léo Marchetti", firstPublished: january, locale: french)
        XCTAssertTrue(message.contains("Léo"), message)
        XCTAssertFalse(message.contains("Marchetti"), message)
        XCTAssertTrue(message.contains("janvier 2026"), message)
    }

    // MARK: - Marque de traduction (K51)

    func test_translationMark_whenTheTranslationIsServed_saysItsOrigin_andOffersTheOriginal() throws {
        let plan = try XCTUnwrap(PostTranslationMarkPlan.resolve(originalLanguage: "it", prismLanguage: "fr",
                                                                  override: nil, translatedLanguages: ["fr"]))
        XCTAssertEqual(plan.originalLanguage, "it")
        XCTAssertFalse(plan.isShowingOriginal)
        XCTAssertEqual(plan.toggledOverride, "it", "« Voir l'original » force l'original")
    }

    func test_translationMark_afterSeeingTheOriginal_staysMounted_andGivesTheHandBackToThePrism() throws {
        let plan = try XCTUnwrap(PostTranslationMarkPlan.resolve(originalLanguage: "IT", prismLanguage: "fr",
                                                                  override: "it", translatedLanguages: ["FR"]))
        XCTAssertTrue(plan.isShowingOriginal)
        XCTAssertNil(plan.toggledOverride, "« Voir la traduction » rend la main au Prisme")
    }

    func test_translationMark_isAbsent_whenTheOriginalIsAlreadyInTheReadersLanguage_orNothingIsTranslated() {
        XCTAssertNil(PostTranslationMarkPlan.resolve(originalLanguage: "fr", prismLanguage: "fr", override: nil,
                                                     translatedLanguages: ["en"]))
        XCTAssertNil(PostTranslationMarkPlan.resolve(originalLanguage: "it", prismLanguage: "fr", override: nil,
                                                     translatedLanguages: []))
        XCTAssertNil(PostTranslationMarkPlan.resolve(originalLanguage: nil, prismLanguage: "fr", override: nil,
                                                     translatedLanguages: ["fr"]))
    }

    func test_languagePhrase_isAgreedForTheMark_inFrench() {
        let french = Locale(identifier: "fr_FR")
        XCTAssertEqual(TranslationLanguagePhrase.phrase(code: "it", role: .source, locale: french), "de l'italien")
        XCTAssertEqual(TranslationLanguagePhrase.phrase(code: "ja", role: .source, locale: french), "du japonais")
        XCTAssertEqual(TranslationLanguagePhrase.phrase(code: "it", role: .original, locale: french), "en italien")
    }

    func test_languagePhrase_isAgreedInTheOtherInterfaceLanguages() throws {
        let english = Locale(identifier: "en_US")
        let italian = Locale(identifier: "it_IT")
        let spanish = Locale(identifier: "es_ES")
        let portuguese = Locale(identifier: "pt_BR")
        let german = Locale(identifier: "de_DE")
        let arabic = Locale(identifier: "ar")
        let italianInEnglish = try XCTUnwrap(english.localizedString(forLanguageCode: "it"))
        let englishInItalian = try XCTUnwrap(italian.localizedString(forLanguageCode: "en")).lowercased()
        let frenchInItalian = try XCTUnwrap(italian.localizedString(forLanguageCode: "fr")).lowercased()
        let italianInSpanish = try XCTUnwrap(spanish.localizedString(forLanguageCode: "it")).lowercased()
        let italianInPortuguese = try XCTUnwrap(portuguese.localizedString(forLanguageCode: "it")).lowercased()
        let italianInGerman = try XCTUnwrap(german.localizedString(forLanguageCode: "it"))
        let italianInArabic = try XCTUnwrap(arabic.localizedString(forLanguageCode: "it"))
        let germanDative = italianInGerman.hasSuffix("isch") ? italianInGerman + "en" : italianInGerman

        XCTAssertEqual(TranslationLanguagePhrase.phrase(code: "it", role: .source, locale: english), "from \(italianInEnglish)")
        XCTAssertEqual(TranslationLanguagePhrase.phrase(code: "en", role: .source, locale: italian), "dall'\(englishInItalian)")
        XCTAssertEqual(TranslationLanguagePhrase.phrase(code: "fr", role: .source, locale: italian), "dal \(frenchInItalian)")
        XCTAssertEqual(TranslationLanguagePhrase.phrase(code: "it", role: .original, locale: spanish), "en \(italianInSpanish)")
        XCTAssertEqual(TranslationLanguagePhrase.phrase(code: "it", role: .source, locale: portuguese),
                       "do \(italianInPortuguese)")
        XCTAssertEqual(TranslationLanguagePhrase.phrase(code: "it", role: .source, locale: german), "aus dem \(germanDative)")
        XCTAssertEqual(TranslationLanguagePhrase.phrase(code: "it", role: .source, locale: arabic), "من \(italianInArabic)")
    }

    // MARK: - « À la une »

    func test_highlightGlyph_readsThePlancheNames_andFallsBackToASparkle() {
        XCTAssertEqual(ProfileHighlightGlyph.systemImage(for: "map-pin"), "mappin.and.ellipse")
        XCTAssertEqual(ProfileHighlightGlyph.systemImage(for: "MOON"), "moon")
        XCTAssertEqual(ProfileHighlightGlyph.systemImage(for: "inconnu"), ProfileHighlightGlyph.fallback)
        XCTAssertEqual(ProfileHighlightGlyph.systemImage(for: nil), ProfileHighlightGlyph.fallback)
    }

    // MARK: - Câblage (fait du kit, loi 12)

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    func test_otherPublications_areMadeOfTheKit_chipsGridStateBlocksAndRail() throws {
        let grid = try code("Meeshy/Features/Profile/Views/ProfileOtherPublicationsGrid.swift")
        XCTAssertTrue(grid.contains("MeeshyChipRow("), "les genres sont la rangée de puces K04")
        XCTAssertTrue(grid.contains("MeeshyMediaGrid("), "la grille est K49")
        XCTAssertTrue(grid.contains("MeeshyStateBlock(kind: .success"), "« Tu as tout vu » est le bloc d'état K38")
        XCTAssertTrue(grid.contains("MeeshyAvatarGroup(count: highlights.count, layout: .rail"), "« À la une » est K48")
        XCTAssertFalse(grid.contains("6366F1"), "aucun accent codé en dur : celui de la fiche")
        let list = try code("Meeshy/Features/Profile/Views/ProfileUserPostsList.swift")
        XCTAssertTrue(list.contains("if showsGrid {"), "la fiche d'un autre se lit en grille, ma liste garde ses cartes")
        XCTAssertTrue(list.contains("@Environment(\\.meeshyProfileAccent)"))
    }

    func test_postDetail_mountsTheTranslationMarkOfTheKit_underItsText() throws {
        let detail = try code("Meeshy/Features/Main/Views/PostDetailView.swift")
        XCTAssertTrue(detail.contains("PostDetailTranslationLines(post: post"))
        let mark = try code("Meeshy/Features/Main/Views/PostDetailTranslationLines.swift")
        XCTAssertTrue(mark.contains("MeeshyTranslationMark("), "la marque est K51, jamais redessinée")
    }
}
