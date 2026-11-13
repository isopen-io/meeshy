import XCTest
import MeeshyUI
import MeeshySDK
@testable import Meeshy

/// L'épure des cercles, des contacts, du profil, des appels et des états vides (#17584, lot iOS 1/3, #18088).
///
/// Un libellé NOMME ; un état vide tient en une ligne ; ce qui est PROPRE À MEESHY garde SA phrase, lisible au repos
/// (règle 7) ; le détail secondaire passe derrière un (i) dont le nom est la QUESTION. Aucun texte n'est perdu : une
/// clé sans lecteur est supprimée des sept langues, un libellé raccourci est traduit, jamais copié du français.
///
/// Les textes se testent dans le catalogue (c'est lui qui s'affiche), les vues par leur source, les modèles par leur
/// comportement.
@MainActor
final class EpureCerclesContactsTests: XCTestCase {

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

    /// Tout le texte Swift que l'application et le kit livrent, commentaires retirés : ce que « aucun lecteur » mesure.
    private func shippedSources() throws -> String {
        let roots = ["apps/ios/Meeshy", "packages/MeeshySDK/Sources"].map { Self.repoRoot.appendingPathComponent($0) }
        return try roots.flatMap { root -> [String] in
            let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
            return try (walker?.allObjects as? [URL] ?? [])
                .filter { $0.pathExtension == "swift" }
                .map { AppSourceGuard.stripComments(try String(contentsOf: $0, encoding: .utf8)) }
        }.joined(separator: "\n")
    }

    // MARK: - Le nouveau français de chaque libellé (règles 1, 2, 4, 5 et 7)

    private static let appFrench: [String: String] = [
        "circles.intro": "Tes liens, classés par proximité : plus le cercle est proche, plus la personne voit de toi.",
        "circles.empty.title": "Tes cercles se remplissent à mesure que tu échanges",
        "circles.offline.banner": "Hors ligne",
        "circles.level.blood.opens": "Présence, talkie, écoute avec titre et position en direct, selon ton accord.",
        "circles.level.close.opens": "Ta présence complète, le talkie et la catégorie de ce que tu écoutes.",
        "circles.level.friend.opens": "Ta présence « en ligne », sans l'heure, et le Bring.",
        "circles.level.acquaintance.opens": "Vous pouvez vous écrire ; cette personne voit tes stories « Connaissances ».",
        "circles.level.community.opens": "Ce que voient les membres de tes communautés.",
        "circles.level.public.opens": "Ce que tout le monde voit de toi.",
        "circles.settings.shareListening.detail": "Cette personne voit que vous écoutez de la musique ; le titre, seulement si vous le lui avez accordé au rituel du Sang.",
        "circles.settings.shareListening.question": "Quand cette personne voit-elle ce que j'écoute ?",
        "circles.settings.shareListening.note": "Apple Music joué sur cet iPhone, Meeshy ouvert. Messages vocaux jamais partagés.",
        "feed.empty.title": "Aucune publication de vos contacts",
        "starred.messages.empty.subtitle": "Appui long sur un message, puis « Ajouter aux favoris ».",
        "profile.language.intro": "Meeshy te montre tout dans ta langue principale, sinon dans la suivante.",
        "profile.language.regional.rank": "2e choix",
        "profile.language.custom.rank": "3e choix",
    ]

    private static let kitFrench: [String: String] = [
        "profile.connection.context.received": "%@ souhaite entrer en contact avec vous.",
        "profile.connection.context.sent": "Demande envoyée à %@ · en attente",
    ]

    func test_catalogs_shortenedAndRevealedLabels_sayTheirNewFrench() throws {
        let app = try app(), kit = try kit()
        for (key, expected) in Self.appFrench { XCTAssertEqual(app[key]?["fr"], expected, key) }
        for (key, expected) in Self.kitFrench { XCTAssertEqual(kit[key]?["fr"], expected, key) }
    }

    func test_catalogs_shortenedAndRevealedLabels_areTranslatedInTheSixOtherLanguages_neverCopiedFromFrench() throws {
        let app = try app(), kit = try kit()
        let sameInEveryLanguage: Set<String> = []
        let entries = Self.appFrench.keys.map { (app, $0) } + Self.kitFrench.keys.map { (kit, $0) }
        for (catalog, key) in entries {
            let values = catalog[key] ?? [:]
            let french = try XCTUnwrap(values["fr"], key)
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(values[language], "\(key) [\(language)]")
                XCTAssertFalse(value.isEmpty, "\(key) [\(language)]")
                if !sameInEveryLanguage.contains(key) {
                    XCTAssertNotEqual(value, french, "\(key) [\(language)] : copié du français")
                }
                XCTAssertEqual(specifiers(in: value), specifiers(in: french), "\(key) [\(language)] : mêmes marqueurs que le français")
            }
        }
    }

    /// Un libellé tient en une ligne ou deux ; un repère rendu visible reste une phrase, pas un paragraphe.
    func test_catalogs_shortenedLabels_holdInOneOrTwoLines() throws {
        let app = try app(), kit = try kit()
        for key in ["circles.empty.title", "circles.offline.banner", "feed.empty.title", "starred.messages.empty.subtitle", "profile.language.intro"] {
            XCTAssertLessThanOrEqual(try XCTUnwrap(app[key]?["fr"]).count, 90, key)
        }
        XCTAssertLessThanOrEqual(try XCTUnwrap(app["circles.settings.shareListening.detail"]?["fr"]).count, 130)
        XCTAssertLessThanOrEqual(try XCTUnwrap(kit["profile.connection.context.received"]?["fr"]).count, 60)
        XCTAssertLessThanOrEqual(try XCTUnwrap(kit["profile.connection.context.sent"]?["fr"]).count, 60)
    }

    // MARK: - Ce qui sort : la redite, jamais la conséquence (règles 2, 4, 5)

    private static let removedFromApp = [
        "circles.empty.subtitle", "circles.sheet.settings.unavailable", "circles.sheet.settings.none",
        "contacts.requests.received.intent", "contacts.requests.empty.received.subtitle", "contacts.requests.empty.sent.subtitle",
        "friends.requests.empty.subtitle", "contacts.blocked.empty-subtitle", "calls.empty.subtitle",
        "community.posts.empty.subtitle", "community.posts.failed.subtitle", "community.posts.offline.subtitle",
        "community.links.empty.subtitle", "profile.posts.empty.subtitle", "feed.empty.subtitle",
        "story.viewer.empty.subtitle", "viewer.engagement.empty.subtitle", "story.mine.queue.empty.subtitle",
        "story.mine.archive.empty.subtitle", "search.try_other_terms", "sessions.offline.subtitle",
        "sessions.error.subtitle", "profile.language.primary.subtitle",
    ]

    private static let removedFromKit = [
        "notifications.empty.subtitle", "notifications.error.subtitle", "community.list.empty.subtitle",
        "community.members.empty.subtitle", "community.detail.channels.empty.subtitle", "community.invite.empty.subtitle",
        "community.detail.loadFailed.body", "community.detail.serverFailed.body",
    ]

    func test_removedKeys_areGoneFromEveryLanguage_andNoSourceReadsThemAnymore() throws {
        let app = try app(), kit = try kit(), sources = try shippedSources()
        for key in Self.removedFromApp { XCTAssertNil(app[key], "\(key) : encore au catalogue de l'app") }
        for key in Self.removedFromKit { XCTAssertNil(kit[key], "\(key) : encore au catalogue du kit") }
        for key in Self.removedFromApp + Self.removedFromKit {
            XCTAssertFalse(sources.contains("\"\(key)\""), "\(key) : une source la lit encore")
        }
    }

    /// Les phrases qui EXPLIQUENT restent : « Elle n'existe pas… » dit pourquoi, et aucun bouton ne le dit à sa place.
    func test_communityRefusedBody_staysBecauseItExplains() throws {
        XCTAssertNotNil(try kit()["community.detail.refused.body"]?["fr"])
        XCTAssertNotNil(try app()["story.mine.drafts.empty.subtitle"]?["fr"])
    }

    func test_communityLoadFailure_onlyTheRefusalExplains_theTwoRetryableCausesAreJustTitleAndButton() {
        XCTAssertNotNil(CommunityLoadFailure.refused.message)
        XCTAssertNil(CommunityLoadFailure.network.message)
        XCTAssertNil(CommunityLoadFailure.server.message)
        XCTAssertNotEqual(CommunityLoadFailure.network.title, CommunityLoadFailure.server.title)
        XCTAssertTrue(CommunityLoadFailure.network.offersRetry)
        XCTAssertFalse(CommunityLoadFailure.network.actionLabel.isEmpty)
    }

    func test_emptyStateView_withoutSubtitle_carriesNone() {
        XCTAssertEqual(EmptyStateView(icon: "tray", title: "Aucun appel récent").subtitle, "")
    }

    func test_deadKitKeys_haveNoReader_andAreGoneFromEveryLanguage() throws {
        let kit = try kit()
        XCTAssertTrue(kit.keys.filter { $0.hasPrefix("voiceProfile.") }.isEmpty, "l'assistant vocal vit dans l'app (voice.profile.wizard.*)")
        for key in [
            "community.detail.posts.empty.action", "community.detail.posts.empty.subtitle", "community.detail.posts.empty.title",
            "community.settings.avatar", "community.settings.avatar.change", "community.settings.banner",
            "community.settings.banner.change", "community.settings.emoji", "community.settings.section.appearance",
            "profile.presence.online", "profile.stats.achievements", "profile.stats.languagesUsed", "profile.stats.memberDays",
            "profile.stats.messagesSent", "profile.stats.translations", "profile.tab.profile", "profile.tab.stats",
        ] {
            XCTAssertNil(kit[key], key)
        }
    }

    // MARK: - Les repères restent lisibles au repos (règle 7)

    func test_circlesList_saysWhatACircleIs_underTheTabBar_withoutAnInfoButton() throws {
        let tab = try code("apps/ios/Meeshy/Features/Contacts/CirclesTab.swift")
        XCTAssertTrue(tab.contains("circles.intro"), "la phrase de la liste se lit sans rien ouvrir")
        XCTAssertFalse(tab.contains("MeeshyInfoNote"), "le repère unique d'une feature propre à Meeshy ne passe pas derrière un (i)")
        XCTAssertFalse(tab.contains("circles.empty.subtitle"))
    }

    func test_circlesEmptyState_isOneLineAndAnAction() throws {
        let tab = try code("apps/ios/Meeshy/Features/Contacts/CirclesTab.swift")
        XCTAssertTrue(tab.contains("circles.empty.action"), "l'action « Trouver des contacts » reste")
        XCTAssertFalse(tab.contains("subtitle: String(localized: \"circles.empty"))
    }

    func test_pendingRaise_saysWhoSentIt_onTheRowAndTheProfile_withTheWebWord() throws {
        let rows = try code("apps/ios/Meeshy/Features/Contacts/CircleRows.swift")
        let profile = try code("apps/ios/Meeshy/Features/Contacts/ProfileCircleSection.swift")
        XCTAssertTrue(rows.contains("\"circles.pending\""), "hors du bloc des demandes, « En attente » ne dit pas qui attend qui")
        XCTAssertTrue(profile.contains("\"circles.pending\""), "la section du profil lit le même mot que le web")
        let app = try app()
        XCTAssertEqual(app["circles.pending"]?["fr"], "Demande envoyée · %@")
        XCTAssertEqual(app["circles.pending"]?["en"], "Request sent · %@")
        XCTAssertEqual(app["circles.requests.outgoing"]?["fr"], "En attente · %@", "sous le titre « Envoyées », le mot court reste")
    }

    func test_circleSheet_namesWhatTheLevelOpens_belowItsName_withoutAnInfoButton() throws {
        let sheet = try code("apps/ios/Meeshy/Features/Contacts/CircleLinkSheet.swift")
        XCTAssertTrue(sheet.contains("CircleLevelNames.opens(of: level)"))
        XCTAssertFalse(sheet.contains("circles.sheet.settings.unavailable"))
        XCTAssertFalse(sheet.contains("circles.sheet.settings.none"))
        XCTAssertFalse(sheet.contains(".constant(false)"), "un interrupteur sans effet est un mensonge : il n'est pas rendu")
    }

    func test_levelOpens_everyLevelHasItsOwnSentence() {
        let levels: [RelationLevel] = [.blood, .close, .friend, .acquaintance, .community, .public]
        let sentences = levels.map { CircleLevelNames.opens(of: $0) }
        XCTAssertEqual(Set(sentences).count, levels.count, "une phrase par niveau, aucune ne se répète")
        for sentence in sentences { XCTAssertFalse(sentence.isEmpty) }
    }

    func test_levelOpens_isTranslatedInEveryLanguage_withoutCopyingTheFrench() throws {
        let app = try app()
        for level in ["blood", "close", "friend", "acquaintance", "community", "public"] {
            let values = try XCTUnwrap(app["circles.level.\(level).opens"])
            for language in Self.otherLanguages {
                XCTAssertNotEqual(values[language], values["fr"], "\(level) [\(language)]")
                XCTAssertFalse((values[language] ?? "").isEmpty, "\(level) [\(language)]")
            }
        }
    }

    // MARK: - Un réglage sans effet n'est pas rendu ; la section vide non plus

    func test_personSettings_shown_areOnlyTheOnesWithAnEffect() {
        XCTAssertTrue(CirclePersonSetting.shown(at: .acquaintance).isEmpty, "rien à régler : la section n'est pas rendue")
        XCTAssertEqual(CirclePersonSetting.shown(at: .friend), [.blockBring])
        XCTAssertEqual(CirclePersonSetting.shown(at: .close), [.blockBring, .talkie, .listening])
        XCTAssertEqual(CirclePersonSetting.shown(at: .blood), [.blockBring, .talkie, .listening], "la position en direct attend son lot")
    }

    func test_listeningSetting_saysItsOneSentenceAtRest_andTheDetailBehindAQuestion() throws {
        let note = try XCTUnwrap(CirclePersonSetting.listening.infoNote)
        XCTAssertTrue(note.question.hasSuffix("?"), "le nom du (i) est la QUESTION : « \(note.question) »")
        XCTAssertFalse(note.question.localizedCaseInsensitiveContains("Plus d"))
        XCTAssertFalse(note.text.isEmpty)
        XCTAssertNotEqual(note.text, CirclePersonSetting.listening.detail, "le (i) apporte le détail, il ne répète pas la phrase")
        XCTAssertNil(CirclePersonSetting.blockBring.infoNote, "un libellé qui se comprend seul ne reçoit pas de (i)")
        XCTAssertNil(CirclePersonSetting.talkie.infoNote)
    }

    func test_listeningDetail_keepsTheTitleConsentVisible_andNotTheLongSentence() throws {
        let catalog = try app()
        let detail = try XCTUnwrap(catalog["circles.settings.shareListening.detail"]?["fr"])
        XCTAssertTrue(detail.contains("rituel du Sang"), "le consentement au titre reste visible")
        XCTAssertFalse(detail.contains("Apple Music"), "le cas limite est derrière le (i)")
        XCTAssertTrue(try XCTUnwrap(catalog["circles.settings.shareListening.note"]?["fr"]).contains("Messages vocaux jamais partagés"))
    }

    // MARK: - Les demandes de contact : les boutons disent le reste

    func test_receivedAndSentRequests_readFromTheShortKeys() throws {
        let kit = try kit()
        XCTAssertFalse(try XCTUnwrap(kit["profile.connection.context.received"]?["fr"]).contains("Acceptez"))
        XCTAssertTrue(try XCTUnwrap(kit["profile.connection.context.sent"]?["fr"]).contains("en attente"))
        let receivedRow = try code("apps/ios/Meeshy/Features/Contacts/RequestsTab.swift")
        XCTAssertFalse(receivedRow.contains("contacts.requests.received.intent"), "le filtre « Reçues » le dit")
        let friends = try code("apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift")
        XCTAssertFalse(friends.contains("contacts.requests.received.intent"))
    }

    // MARK: - Les états vides tiennent en une ligne, plus une action quand il y en a une (règle 4)

    func test_emptyStates_readNoSubtitle() throws {
        let sources: [String: [String]] = [
            "apps/ios/Meeshy/Features/Contacts/RequestsTab.swift": ["contacts.requests.empty.received\"", "contacts.requests.empty.sent\""],
            "apps/ios/Meeshy/Features/Main/Views/FriendRequestListView.swift": ["friends.requests.empty.title"],
            "apps/ios/Meeshy/Features/Contacts/BlockedTab.swift": ["contacts.blocked.empty\""],
            "apps/ios/Meeshy/Features/Contacts/CallsTab.swift": ["calls.empty.title"],
            "packages/MeeshySDK/Sources/MeeshyUI/Notifications/NotificationListScreen.swift": [],
            "apps/ios/Meeshy/Features/Community/CommunityPostsTab.swift": ["community.posts.empty.title", "community.posts.failed.title", "community.posts.offline.title"],
            "apps/ios/Meeshy/Features/Links/Views/CommunityLinksView.swift": ["community.links.empty.title"],
            "apps/ios/Meeshy/Features/Profile/Views/ProfileUserPostsList.swift": ["profile.posts.empty\""],
            "apps/ios/Meeshy/Features/Main/Views/FeedView.swift": ["feed.empty.title"],
            "apps/ios/Meeshy/Features/Main/Views/PublicationViewersSheet.swift": ["story.viewer.empty.title"],
            "apps/ios/Meeshy/Features/Stories/Views/MyStoriesView.swift": ["story.mine.queue.empty.title", "story.mine.archive.empty.title"],
            "apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift": ["search.no_results"],
            "apps/ios/Meeshy/Features/Settings/Views/ActiveSessionsView.swift": ["sessions.offline.title", "sessions_load_error"],
        ]
        for (path, titles) in sources {
            let source = try code(path)
            for title in titles { XCTAssertTrue(source.contains(title), "\(path) : le titre « \(title) » reste") }
        }
        let communityPosts = try code("apps/ios/Meeshy/Features/Community/CommunityPostsTab.swift")
        XCTAssertTrue(communityPosts.contains("community.posts.empty.action"), "« Créer une publication » reste, l'action de l'état")
        XCTAssertTrue(communityPosts.contains("common.retry"))
    }

    func test_searchNoResults_isTheTitleAlone_forTheVoiceOverLabelToo() throws {
        let search = try code("apps/ios/Meeshy/Features/Main/Views/GlobalSearchView.swift")
        XCTAssertFalse(search.contains(".accessibilityLabel(String(localized: \"search.no_results\", defaultValue: \"Aucun résultat\") + \". \""))
        let list = try code("apps/ios/Meeshy/Features/Main/Views/ConversationListView+EmptyState.swift")
        XCTAssertFalse(list.contains("search.try_other_terms"))
    }

    func test_feedEmptyTitle_namesWhoseFeedItIs_inEveryLanguage() throws {
        let title = try XCTUnwrap(try app()["feed.empty.title"])
        let contacts: [String: String] = ["fr": "contacts", "en": "contacts", "es": "contactos", "pt-BR": "contatos", "de": "Kontakte", "it": "contatti", "ar": "جهات اتصالك"]
        for (language, noun) in contacts {
            XCTAssertTrue((title[language] ?? "").contains(noun), "\(language) : « \(title[language] ?? "") »")
        }
    }

    // MARK: - Le profil dit où va chaque langue (règle 7)

    func test_profileLanguages_sayTheirOrderAtRest_underTheSectionTitle() throws {
        let profile = try code("apps/ios/Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(profile.contains("profile.language.intro"))
        XCTAssertFalse(profile.contains("profile.language.primary.subtitle"))
        XCTAssertTrue(profile.contains("profile.language.regional.rank"))
        XCTAssertTrue(profile.contains("profile.language.custom.rank"))
    }

    // MARK: - La conséquence irréversible et les titres des états ne s'en vont pas

    func test_whatStays_theConsequences_theSessionsDatesAndTheCurrentDevice() throws {
        let sessions = try code("apps/ios/Meeshy/Features/Settings/Views/ActiveSessionsView.swift")
        XCTAssertTrue(sessions.contains("sessions.retry"), "« Réessayer » reste")
        XCTAssertTrue(try app()["circles.unlink.confirm.body"]?["fr"]?.contains("30 jours") ?? false, "la conséquence d'un geste irréversible reste")
        XCTAssertTrue(try app()["circles.demote.confirm.body"]?["fr"]?.contains("30 jours") ?? false)
    }

    // MARK: - Les états vides tiennent en une ligne (#18088, constats 1 à 9)

    private static let emptyStateSubtitlesRemoved = [
        "keypad.prompt.subtitle", "keypad.no-match.subtitle", "conversations.empty.subtitle",
        "conversations.error.subtitle", "story.mine.empty.subtitle",
        "notifications.story.expired.subtitle",
    ]

    func test_emptyStateSubtitles_areGoneFromEveryLanguage_andNoSourceReadsThem() throws {
        let app = try app(), sources = try shippedSources()
        for key in Self.emptyStateSubtitlesRemoved {
            XCTAssertNil(app[key], "\(key) : encore au catalogue")
            XCTAssertFalse(sources.contains("\"\(key)\""), "\(key) : une source la lit encore")
        }
    }

    func test_conversationsError_isOneLine_theFailureItself_inEveryLanguage() throws {
        let app = try app()
        XCTAssertEqual(app["conversations.error.title"]?["fr"], "Impossible de charger vos conversations.")
        let french = try XCTUnwrap(app["conversations.error.title"]?["fr"])
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(app["conversations.error.title"]?[language])
            XCTAssertNotEqual(value, french, "\(language) : copié du français")
        }
    }

    func test_progressionEmpty_keepsItsOrientation_theFirstGestureLightsTheFirstMedal_inEveryLanguage() throws {
        let app = try app()
        let empty = try XCTUnwrap(app["progression.empty"]?["fr"])
        XCTAssertTrue(empty.contains("première médaille"), "règle 7 : le jeu dit au repos ce qui allume la première médaille")
        XCTAssertEqual(app["progression.offline.empty"]?["fr"], "Hors ligne — aucune progression en mémoire")
        for key in ["progression.empty", "progression.offline.empty"] {
            let french = try XCTUnwrap(app[key]?["fr"])
            for language in Self.otherLanguages {
                let value = try XCTUnwrap(app[key]?[language])
                XCTAssertFalse(value.isEmpty, "\(key) \(language)")
                XCTAssertNotEqual(value, french, "\(key) \(language) : copié du français")
            }
        }
    }

    func test_progressionNotice_empty_saysWhatLightsTheFirstMedal() {
        let text = ProgressionNotice(kind: .empty).text
        XCTAssertTrue(text.contains("médaille"), "l'avis lu à l'écran oriente vers le premier geste : « \(text) »")
    }

    func test_filteredPostsEmptyState_keepsTheOnlyHintOfHowToClearTheFilter_inEveryLanguage() throws {
        let app = try app()
        let french = try XCTUnwrap(app["profile.posts.empty.filter.subtitle"]?["fr"])
        XCTAssertTrue(french.contains("tuile"), "le seul indice du geste qui retire le filtre reste lisible")
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(app["profile.posts.empty.filter.subtitle"]?[language], language)
            XCTAssertNotEqual(value, french, "\(language) : copié du français")
        }
        XCTAssertTrue(try code("apps/ios/Meeshy/Features/Profile/Views/ProfileUserPostsList.swift").contains("profile.posts.empty.filter.subtitle"))
    }

    func test_emptyStateSites_passNoSubtitle() throws {
        let sites: [(String, [String])] = [
            ("apps/ios/Meeshy/Features/Contacts/KeypadTab.swift", ["keypad.prompt.subtitle", "keypad.no-match.subtitle"]),
            ("apps/ios/Meeshy/Features/Main/Views/ConversationListView+EmptyState.swift", ["conversations.error.subtitle", "conversations.empty.subtitle"]),
            ("apps/ios/Meeshy/Features/Stories/Views/MyStoriesView.swift", ["story.mine.empty.subtitle"]),
            ("apps/ios/Meeshy/Features/Stories/Notifications/StoryExpiredContent.swift", ["notifications.story.expired.subtitle"]),
        ]
        for (path, keys) in sites {
            let source = try code(path)
            for key in keys { XCTAssertFalse(source.contains(key), "\(path) lit encore \(key)") }
        }
    }

    // MARK: - Le Bring dit, au repos, ce que fait son blocage (règle 7) ; deux états vides sans note (règle 4)

    func test_blockBring_saysWhatItDoesAtRest_withoutAnInfoNote() throws {
        let detail = try XCTUnwrap(CirclePersonSetting.blockBring.detail, "le Bring est propre à Meeshy : sa phrase est visible")
        XCTAssertFalse(detail.isEmpty)
        XCTAssertNil(CirclePersonSetting.blockBring.infoNote, "la phrase suffit : pas de (i) qui répète")
        let catalog = try app()
        let values = try XCTUnwrap(catalog["circles.settings.blockBring.detail"])
        let french = try XCTUnwrap(values["fr"])
        XCTAssertTrue(french.contains("Bring"))
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(values[language])
            XCTAssertFalse(value.isEmpty, language)
            XCTAssertNotEqual(value, french, "\(language) : copié du français")
        }
    }

    func test_callsSearchEmpty_saysTheLogCoversThreeMonths_theOnlyPlaceThatLimitIsTold() throws {
        let app = try app()
        let french = try XCTUnwrap(app["calls.search.empty.hint"]?["fr"])
        XCTAssertTrue(french.contains("trois derniers mois"))
        for language in Self.otherLanguages {
            XCTAssertNotEqual(try XCTUnwrap(app["calls.search.empty.hint"]?[language], language), french, "\(language) : copié du français")
        }
        XCTAssertTrue(try code("apps/ios/Meeshy/Features/Contacts/CallsTab.swift").contains("calls.search.empty.hint"))
    }

    func test_addChannelEmpty_saysToCreateAConversationFirst_theOnlyWayOut_inEveryLanguage() throws {
        let kit = try kit()
        let french = try XCTUnwrap(kit["community.addChannel.empty.hint"]?["fr"])
        for language in Self.otherLanguages {
            let value = try XCTUnwrap(kit["community.addChannel.empty.hint"]?[language], language)
            XCTAssertNotEqual(value, french, "\(language) : copié du français")
        }
        XCTAssertTrue(try XCTUnwrap(kit["community.addChannel.empty.hint"]?["de"]).contains("hier"), "l'allemand dit où la conversation s'ajoutera")
        XCTAssertTrue(try code("packages/MeeshySDK/Sources/MeeshyUI/Community/CommunityAddChannelScreen.swift").contains("community.addChannel.empty.hint"))
    }
}
