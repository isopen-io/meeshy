import XCTest
import MeeshyUI
import MeeshySDK
@testable import Meeshy

/// L'épure du fil, des stories et des publications (#17584, lot iOS 2/3, #18109).
///
/// Un libellé NOMME ; un état vide tient en une ligne ; ce qui est PROPRE À MEESHY garde SA phrase, lisible au repos
/// (règle 7) ; le détail secondaire passe derrière un (i) dont le nom est la QUESTION. Aucun texte n'est perdu : une
/// clé sans lecteur est supprimée des sept langues, un libellé raccourci est traduit, jamais copié du français.
@MainActor
final class EpureFeedStoriesTests: XCTestCase {

    // MARK: - Lecture des catalogues et des sources

    private static let repoRoot: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

    private typealias Catalog = [String: [String: String]]

    private static func catalog(_ relativePath: String) throws -> Catalog {
        let data = try Data(contentsOf: repoRoot.appendingPathComponent(relativePath))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        return strings.reduce(into: Catalog()) { result, entry in
            let localizations = ((entry.value as? [String: Any])?["localizations"] as? [String: Any]) ?? [:]
            result[entry.key] = localizations.reduce(into: [String: String]()) { values, locale in
                if let unit = (locale.value as? [String: Any])?["stringUnit"] as? [String: Any], let value = unit["value"] as? String {
                    values[locale.key] = value
                }
            }
        }
    }

    private static let appCatalogPath = "apps/ios/Meeshy/Localizable.xcstrings"
    private static let kitCatalogPath = "packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings"
    private static let otherLanguages = ["en", "es", "pt-BR", "de", "it", "ar"]

    private func app() throws -> Catalog { try Self.catalog(Self.appCatalogPath) }
    private func kit() throws -> Catalog { try Self.catalog(Self.kitCatalogPath) }

    private func code(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: Self.repoRoot.appendingPathComponent(relativePath), encoding: .utf8))
    }

    private func specifiers(in text: String) -> [String] {
        let regex = try? NSRegularExpression(pattern: #"%(\d+\$)?(@|lld|d|ld)"#)
        let range = NSRange(text.startIndex..., in: text)
        return (regex?.matches(in: text, range: range) ?? []).compactMap { Range($0.range, in: text).map { String(text[$0]) } }.sorted()
    }

    private func shippedSources() throws -> String {
        let roots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"].map { Self.repoRoot.appendingPathComponent($0) }
        return try roots.flatMap { root -> [String] in
            let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
            return try (walker?.allObjects as? [URL] ?? [])
                .filter { $0.pathExtension == "swift" }
                .map { AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8)) }
        }.joined(separator: "\n")
    }

    private static let views = "apps/ios/Meeshy/Features/Main/Views/"
    private static let stories = "apps/ios/Meeshy/Features/Stories/Views/"

    // MARK: - Le nouveau français de chaque libellé (règles 1, 4, 5 et 7)

    private static let appFrench: [String: String] = [
        "story.viewer.expiredBanner": "Story expirée",
        "story.sentinel.body": "Mettez l'application à jour pour la voir telle que son auteur l'a composée.",
        "story.export.share.question": "Que contient l'export ?",
        "story.export.share.subtitle": "Génère un MP4 fidèle à la prévisualisation pour le partager hors Meeshy.",
        "story.mine.viewers": "Vues",
        "story.mine.repost": "Repartager",
        "story.viewer.action.repost": "Repartager",
        "story.mine.repost.success": "Story repartagée",
        "story.mine.repost.error": "Échec du repartage",
        "story.repost.error.generic": "Échec du repartage",
        "story.repost.success": "Repartagé dans ton feed",
        "story.repost.success.reel": "Repartagé dans tes réels",
        "feed.scene.sound.muted": "Son coupé",
        "feed.scene.sound.muted.hint": "Ouvrir en plein écran pour l'entendre",
        "feed.nearby.empty.awaiting.detail": "Déplacez la carte pour choisir un point de départ.",
        "feed.nearby.empty.none.why": "Seules les publications « trouvables à proximité » apparaissent ici.",
        "feed.nearby.empty.none.why.question": "Pourquoi une publication manque-t-elle ?",
        "feed.nearby.empty.none.why.note": "L'auteur doit avoir activé « trouvable à proximité ». Les publications antérieures à cette option n'y figurent pas.",
        "feed.unsent.composerBusy": "Terminez d'abord le brouillon en cours.",
        "post.daily_limit.comment": "Limite de commentaires atteinte — vos étincelles ne bougent pas. Reprise à %@.",
        "post.daily_limit.comment.untimed": "Limite de commentaires du jour atteinte — vos étincelles ne bougent pas.",
        "post.daily_limit.reaction": "Limite de réactions atteinte — vos étincelles ne bougent pas. Reprise à %@.",
        "post.daily_limit.reaction.untimed": "Limite de réactions du jour atteinte — vos étincelles ne bougent pas.",
        "post.audience.only_unlinked_limit": "Trop de personnes sans lien avec vous aujourd’hui. Retirez-en, ou réessayez demain.",
        "story.mine.failed.delete.message": "Cette story n'a jamais été publiée : sa dernière copie sera définitivement perdue.",
    ]

    private static let kitFrench: [String: String] = [
        "post.visibility.public.who": "Tout le monde la voit",
        "post.visibility.community.who": "Les membres de vos communautés la voient",
        "post.visibility.acquaintances.who": "Vos connaissances et au-dessus la voient",
        "post.visibility.friends.who": "Vos amis et au-dessus la voient",
        "post.visibility.close.who": "Vos proches et au-dessus la voient",
        "post.visibility.blood.who": "Seul votre Sang la voit",
        "post.visibility.except.who": "Tout le monde la voit, sauf les personnes choisies",
        "post.visibility.only.who": "Seules les personnes choisies la voient",
        "post.visibility.private.who": "Vous seul la voyez",
    ]

    func test_catalogs_shortenedAndRevealedLabels_sayTheirNewFrench() throws {
        let app = try app(), kit = try kit()
        for (key, expected) in Self.appFrench { XCTAssertEqual(app[key]?["fr"], expected, key) }
        for (key, expected) in Self.kitFrench { XCTAssertEqual(kit[key]?["fr"], expected, key) }
    }

    func test_catalogs_shortenedAndRevealedLabels_areTranslatedInTheSixOtherLanguages_neverCopiedFromFrench() throws {
        let app = try app(), kit = try kit()
        let entries = Self.appFrench.keys.map { (app, $0) } + Self.kitFrench.keys.map { (kit, $0) }
        for (catalog, key) in entries {
            let values = catalog[key] ?? [:]
            let french = try XCTUnwrap(values["fr"], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
                XCTAssertEqual(specifiers(in: value), specifiers(in: french), "\(key) [\(language)] : mêmes marqueurs que le français")
            }
        }
    }

    /// Un libellé tient en une ligne ou deux ; les toasts de limite gardent le repère « étincelles » (règle 7).
    func test_toastsAndOneLiners_holdInOneOrTwoLines_andTheSparksLandmarkStays() throws {
        let app = try app()
        for key in ["post.daily_limit.comment", "post.daily_limit.reaction", "post.audience.only_unlinked_limit", "story.mine.failed.delete.message"] {
            XCTAssertLessThanOrEqual(try XCTUnwrap(app[key]?["fr"]).count, 90, key)
        }
        for key in ["post.daily_limit.comment", "post.daily_limit.comment.untimed", "post.daily_limit.reaction", "post.daily_limit.reaction.untimed"] {
            XCTAssertTrue(try XCTUnwrap(app[key]?["fr"]).contains("étincelles"), "\(key) : le repère « étincelles » reste dit")
        }
        XCTAssertLessThanOrEqual(try XCTUnwrap(app["story.viewer.expiredBanner"]?["fr"]).count, 20, "une bannière à une ligne n'est jamais tronquée")
    }

    func test_irreversibleConsequence_staysSaid_andTheAdjacentButtonAdviceIsGone() throws {
        let french = try XCTUnwrap(try app()["story.mine.failed.delete.message"]?["fr"])
        XCTAssertTrue(french.contains("définitivement perdue"))
        XCTAssertFalse(french.contains("Reprendre"), "le bouton « Reprendre » est adjacent : le conseil est retiré")
    }

    // MARK: - Ce qui sort : la redite (règles 2, 4) — aucune clé sans lecteur ne reste

    private static let removedFromApp = [
        "story.viewer.comments.beFirst", "story.mine.drafts.empty.subtitle", "feed.map.empty.detail",
        "feed.post.detail.loadFailed.body", "feed.post.detail.serverFailed.body",
        "feed.nearby.empty.denied.detail", "feed.nearby.empty.unavailable.detail", "feed.nearby.empty.offline.detail",
        "feed.nearby.empty.signin.detail", "feed.nearby.empty.none.detail", "bookmarks.empty.subtitle",
        "story.viewer.notFound.description", "feed.bookmark.error", "feed.bookmark.success", "feed.post.stat.reposts",
    ]
    private static let removedFromKit = ["story.repost.reprojected"]

    func test_removedKeys_areGoneFromEveryLanguage_andNoSourceReadsThemAnymore() throws {
        let app = try app(), kit = try kit(), sources = try shippedSources()
        for key in Self.removedFromApp {
            XCTAssertNil(app[key], "\(key) : encore au catalogue")
            XCTAssertFalse(sources.contains("\"\(key)\""), "\(key) : une source la lit encore")
        }
        for key in Self.removedFromKit {
            XCTAssertNil(kit[key], "\(key) : encore au catalogue du kit")
            XCTAssertFalse(sources.contains("\"\(key)\""), "\(key) : une source la lit encore")
        }
    }

    func test_bookmarksEmpty_isTheTitleAlone_andTheStoryNotFoundOverlayIsTitlePlusItsTwoButtons() throws {
        let bookmarks = try code(Self.views + "BookmarksView.swift")
        XCTAssertTrue(bookmarks.contains("bookmarks.empty.title"))
        XCTAssertFalse(bookmarks.contains("bookmarks.empty.subtitle"))
        let viewer = try code(Self.stories + "StoryViewerContainer.swift")
        XCTAssertTrue(viewer.contains("story.viewer.notFound.title"))
        XCTAssertFalse(viewer.contains("story.viewer.notFound.description"))
    }

    func test_storyCommentsOverlay_emptyIsOneLine_theReplyBarIsTheAction_andTheExpiredBannerIsNeverTruncated() throws {
        let overlay = try code(Self.stories + "StoryCommentsOverlayView.swift")
        XCTAssertTrue(overlay.contains("story.viewer.comments.empty"))
        XCTAssertFalse(overlay.contains("story.viewer.comments.beFirst"))
        XCTAssertEqual(try app()["story.viewer.expiredBanner"]?["fr"], "Story expirée")
    }

    func test_myStoriesDraftsEmpty_isTheTitleAlone() throws {
        let mine = try code(Self.stories + "MyStoriesView.swift")
        XCTAssertTrue(mine.contains("story.mine.drafts.empty.title"))
        XCTAssertFalse(mine.contains("story.mine.drafts.empty.subtitle"))
    }

    func test_contentFetchFailure_retryableCauses_areTitleAndRetry_onlyTheAbsenceExplains() {
        XCTAssertNil(ContentFetchFailure.network.message)
        XCTAssertNil(ContentFetchFailure.server.message)
        XCTAssertNotNil(ContentFetchFailure.forbidden.message)
        XCTAssertEqual(ContentFetchFailure.forbidden.message, ContentFetchFailure.notFound.message)
        XCTAssertNotEqual(ContentFetchFailure.network.title, ContentFetchFailure.server.title)
        XCTAssertTrue(ContentFetchFailure.network.offersRetry)
        XCTAssertTrue(ContentFetchFailure.server.offersRetry)
    }

    func test_contentFetchFailureViews_renderTheMessageOnlyWhenThereIsOne() throws {
        for path in [Self.views + "PostDetailView+AbsenceStates.swift", Self.views + "ReelOpenFailureView.swift"] {
            let source = try code(path)
            XCTAssertTrue(source.contains("ContentFetchFailureMessage("), "\(path) : pas de texte vide quand la cause n'explique rien")
        }
    }

    // MARK: - Derrière un (i), la question en nom, la note lue (règles 1, 7)

    func test_exportSheet_namesItsInfoButtonWithAQuestion_andKeepsTheOldSubtitleAsTheNote() throws {
        let note = StoryExportShareCopy.infoNote
        XCTAssertTrue(note.question.hasSuffix("?"), "le nom du (i) est la QUESTION : « \(note.question) »")
        XCTAssertFalse(note.question.localizedCaseInsensitiveContains("Plus d"))
        XCTAssertFalse(note.text.isEmpty)
        XCTAssertNotEqual(note.question, note.text)
        let sheet = try code(Self.stories + "StoryExportShareSheet.swift")
        XCTAssertTrue(sheet.contains("MeeshyInfoNoted"))
        XCTAssertFalse(sheet.contains("\"story.export.share.subtitle\""), "la vue ne rend plus la phrase au repos : elle passe par la note")
    }

    func test_nearbyNoneInRadius_keepsOneVisibleSentence_andTheEdgeCaseBehindAQuestion() throws {
        let note = NearbyEmptyStateCard.whyNote
        XCTAssertTrue(note.question.hasSuffix("?"), note.question)
        XCTAssertFalse(note.text.isEmpty)
        let nearby = try code(Self.views + "NearbyDiscoveryView.swift")
        XCTAssertTrue(nearby.contains("feed.nearby.empty.none.why"), "règle 7 : la phrase propre à Meeshy reste lisible au repos")
        XCTAssertTrue(nearby.contains("MeeshyInfoNoted"))
        XCTAssertFalse(nearby.contains("feed.map.empty.detail"))
    }

    func test_nearbyDetail_isOneSentence_andAbsentOnTheEmptyMap() {
        XCTAssertNil(NearbyEmptyStateCard.detail(for: .nothingOnTheMap, radiusKm: 10), "titre seul : l'état vide tient en une ligne")
        for reason in [NearbyEmptyReason.locationDenied, .offline, .signInRequired, .serviceUnavailable, .noneInRadius] {
            XCTAssertNil(NearbyEmptyStateCard.detail(for: reason, radiusKm: 10), "\(reason) : le titre et l'action suffisent")
        }
        let awaiting = NearbyEmptyStateCard.detail(for: .awaitingLocation, radiusKm: 10)
        XCTAssertEqual(awaiting?.filter { $0 == "." }.count, 1, "la seule consigne qui guide le geste reste une phrase")
    }

    func test_soundMutedBadge_isNamedSonCoupe_andTheRestIsTheAccessibilityHint() throws {
        for path in [Self.views + "FeedSceneAutoplay.swift", Self.views + "PostSceneMosaic.swift"] {
            let source = try code(path)
            XCTAssertTrue(source.contains("feed.scene.sound.muted.hint"), path)
            XCTAssertTrue(source.contains(".accessibilityHint"), "\(path) : la précision reste lue par le lecteur d'écran")
        }
    }

    // MARK: - Le même mot sur les trois plateformes

    func test_repostWord_isRepartager_onTheRailTheMenuAndTheirMessages() throws {
        let menu = try code(Self.stories + "MyStoryActionMenu.swift")
        XCTAssertTrue(menu.contains("defaultValue: \"Repartager\""))
        XCTAssertTrue(menu.contains("defaultValue: \"Vues\""))
        XCTAssertFalse(menu.contains("Listing des vues"))
        let rail = try code(Self.stories + "StoryViewerView+Sidebar.swift")
        XCTAssertTrue(rail.contains("defaultValue: \"Repartager\""))
        XCTAssertFalse(rail.contains("defaultValue: \"Republi"), "plus aucun libellé « Republi… » sur le lecteur de stories")
        XCTAssertFalse(try code(Self.stories + "MyStoriesView.swift").contains("defaultValue: \"Republi"))
        let english = try app()["story.viewer.action.repost"]?["en"]
        XCTAssertEqual(english, try app()["feed.post.repost"]?["en"], "le rail dit le mot du fil")
    }

    func test_repostMessages_sayTheActionWord_inEveryLanguage() throws {
        let app = try app()
        let stems = ["fr": "repartag", "en": "repost", "es": "republica", "pt-BR": "republica", "de": "teil", "it": "ripubblic", "ar": "إعادة"]
        let messages = ["story.mine.repost.success", "story.mine.repost.error", "story.repost.error.generic", "story.repost.success", "story.repost.success.reel"]
        for key in messages {
            for (language, stem) in stems {
                let value = try XCTUnwrap(app[key]?[language], "\(key) [\(language)]")
                XCTAssertTrue(value.lowercased().contains(stem), "\(key) [\(language)] : « \(value) » ne dit pas le mot du bouton")
            }
        }
    }

    // MARK: - Les publications non envoyées et les toasts de limite

    func test_unsentComposerBusy_saysWhatToDo_inOneSentence() throws {
        XCTAssertTrue(try code("apps/ios/Meeshy/Features/Main/UnsentPublications/UnsentPublicationsSource.swift")
            .contains("Terminez d'abord le brouillon en cours."))
    }

    func test_dailyLimitToast_keepsItsSparksLandmark_inTheSource() throws {
        let toast = try code("apps/ios/Meeshy/Features/Main/Services/FeedbackToastManager.swift")
        XCTAssertFalse(toast.contains("La limite compte vos gestes"))
        XCTAssertTrue(toast.contains("vos étincelles ne bougent pas"))
    }

    /// Sans heure de reprise, le toast dit encore que la limite est QUOTIDIENNE : sinon l'utilisateur ne sait pas quand
    /// il retrouve ses gestes.
    func test_dailyLimitToastWithoutResetTime_stillSaysTheLimitIsForToday_inEveryLanguage() throws {
        let app = try app()
        let today = ["fr": "du jour", "en": "today", "es": "hoy", "pt-BR": "hoje", "de": "tages", "it": "oggi", "ar": "اليوم"]
        for key in ["post.daily_limit.comment.untimed", "post.daily_limit.reaction.untimed"] {
            for (language, word) in today {
                let value = try XCTUnwrap(app[key]?[language], "\(key) [\(language)]")
                XCTAssertTrue(value.lowercased().contains(word), "\(key) [\(language)] : « \(value) » ne dit plus « aujourd'hui »")
            }
        }
    }

    // MARK: - Modifier une publication : l'audience dit QUI voit, au repos (règle 7)

    func test_everyAudience_saysWhoSeesIt_withItsOwnSentence() {
        let sentences = PostVisibility.allCases.map(\.who)
        XCTAssertEqual(Set(sentences).count, PostVisibility.allCases.count, "une phrase par audience, aucune ne se répète")
        for sentence in sentences { XCTAssertFalse(sentence.isEmpty) }
    }

    func test_editPostSheet_rendersTheAudienceSentenceUnderTheRow_withoutAnInfoButton() throws {
        let sheet = try code("apps/ios/Meeshy/Features/Main/Components/EditPostSheet.swift")
        XCTAssertTrue(sheet.contains("selectedVisibility.who"), "la phrase suit l'audience choisie")
        XCTAssertFalse(sheet.contains("MeeshyInfoNote"), "le repère unique d'une feature propre à Meeshy ne passe pas derrière un (i)")
    }
}
