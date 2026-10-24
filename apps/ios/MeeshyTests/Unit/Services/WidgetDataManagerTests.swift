import XCTest
import MeeshySDK
@testable import Meeshy
import MeeshySDK

@MainActor
final class WidgetDataManagerTests: XCTestCase {

    // MARK: - #11558 — l'environnement API part hors du fil principal

    /// Ouvrir le groupe d'app et y écrire sont des XPC synchrones, et seules les
    /// extensions lisent la valeur : l'écriture part sur la file `AppGroupIO`.
    func test_publishAPIBaseURL_writesTheAppGroupOnItsQueue_notOnTheCallingThread() throws {
        let suite = "group.test.meeshy.apibase.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let io = AppGroupIO(label: "WidgetDataManagerTests.apiBase")
        let gate = DispatchSemaphore(value: 0)
        io.enqueue { gate.wait() }
        let sut = WidgetDataManager(suiteName: suite)

        sut.publishAPIBaseURL("https://staging.meeshy.me", io: io)

        XCTAssertNil(defaults.string(forKey: "meeshy_api_base_url"), "rien ne s'écrit avant le tour de la file")
        gate.signal()
        io.drain()
        XCTAssertEqual(defaults.string(forKey: "meeshy_api_base_url"), "https://staging.meeshy.me")
    }

    /// L'assertion d'arrière-plan qui garantit l'écriture (`beginBackgroundTask`)
    /// est elle-même un XPC synchrone vers le démon d'exécution. Ouverte dans
    /// `prepareProcess`, elle tombait sur le fil principal avant la liste ; la
    /// publication attend donc que l'écran de lancement se soit levé, liste rendue.
    func test_coldStart_publishesTheAPIEnvironmentOnlyOnceTheSplashHasLifted() throws {
        let sequence = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/MeeshyApp+LaunchSequence.swift")
        let source = DeclarationBodyScanner.mask(try String(contentsOf: sequence, encoding: .utf8))
        let prepare = try XCTUnwrap(DeclarationBodyScanner.body(containing: "func prepareProcess()", in: source))
        let finish = try XCTUnwrap(DeclarationBodyScanner.body(containing: "func finishLaunch()", in: source))

        XCTAssertFalse(prepare.contains("publishAPIBaseURL"), "prepareProcess précède le premier rendu : aucune assertion d'arrière-plan n'y part")
        XCTAssertFalse(prepare.contains("beginBackgroundTask"))
        let ready = try XCTUnwrap(finish.range(of: "launchSplash.markReady()"))
        let publish = try XCTUnwrap(finish.range(of: "publishAPIBaseURL()"), "l'environnement API reste publié à chaque démarrage")
        XCTAssertLessThan(ready.upperBound, publish.lowerBound, "la publication suit la levée de l'écran de lancement")
    }

    // MARK: - appgroup-01 — wipeAll (wipe de logout)

    private func makeWipeSUT() throws -> (WidgetDataManager, UserDefaults, [URL]) {
        let suite = "group.test.meeshy.widgetwipe.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let fm = FileManager.default
        let dirs = try (0..<3).map { i -> URL in
            let dir = fm.temporaryDirectory.appendingPathComponent("wipe-staging-\(i)-\(UUID().uuidString)", isDirectory: true)
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
            try Data("{}".utf8).write(to: dir.appendingPathComponent("blob.json"))
            return dir
        }
        let sut = WidgetDataManager(suiteName: suite, stagingDirectories: dirs)
        return (sut, defaults, dirs)
    }

    /// Les fiches de relais et de studio de l'extension portent le texte et les
    /// fichiers du compte sortant : le wipe de logout les purge avec le reste.
    func test_theLogoutWipe_purgesTheShareRelaysAndStudioHandoffs() throws {
        let relays = try XCTUnwrap(ShareRelayHandoff.directoryURL(), "le conteneur App Group est accessible à l'hôte des tests")
        let composes = try XCTUnwrap(ShareComposeHandoffConsumer.directoryURL())
        let purged = WidgetDataManager.accountStagingDirectories()
        XCTAssertTrue(purged.contains(relays))
        XCTAssertTrue(purged.contains(composes))
    }

    /// Ce que l'app tient EN MÉMOIRE d'une fiche de l'extension part avec la
    /// déconnexion : un studio armé pour le compte sortant ne s'ouvre pas sous
    /// le suivant (#10986).
    func test_theLogoutForget_dropsTheStudioComposeHeldInMemory() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("wipe-compose-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        let fiche = ShareComposeHandoff(shareId: "cid_a", createdAt: Date(timeIntervalSince1970: 1_000), text: "Texte",
                                        media: [], ownerUserId: "alice")
        try JSONEncoder.meeshyShareCompose.encode(fiche).write(to: dir.appendingPathComponent("cid_a.json"))
        let compose = ShareComposeHandoffConsumer(directory: { dir }, mediaRoot: { nil }, currentUserId: { "alice" })
        await compose.consumeNext()
        XCTAssertNotNil(compose.pending)

        WidgetDataManager.forgetHeldShares(
            relay: ShareRelayConsumer(directory: { nil }, mediaRoot: { nil }, currentUserId: { nil }),
            compose: compose
        )

        XCTAssertNil(compose.pending)
    }

    func test_wipeAll_removesWidgetKeysAndStagingDirs() throws {
        let (sut, defaults, dirs) = try makeWipeSUT()
        let keys = [
            "recent_conversations", "conversation_snapshots", "favorite_contacts",
            "widget_last_updated", "unread_count", "pending_mark_read",
        ]
        for key in keys { defaults.set(Data("seed".utf8), forKey: key) }
        // Clés d'ENVIRONNEMENT — le wipe ne doit PAS les toucher.
        defaults.set("http://localhost:3000", forKey: "meeshy_api_base_url")

        sut.wipeAll()

        for key in keys {
            XCTAssertNil(defaults.object(forKey: key), "\(key) must be removed by the logout wipe")
        }
        XCTAssertEqual(
            defaults.string(forKey: "meeshy_api_base_url"), "http://localhost:3000",
            "environment keys are NOT account data — the wipe must leave them alone"
        )
        for dir in dirs {
            XCTAssertFalse(
                FileManager.default.fileExists(atPath: dir.path),
                "staging dir \(dir.lastPathComponent) must be removed — its blobs would replay under the next account"
            )
        }
    }

    // MARK: - B1 (Prisme Linguistique) — l'aperçu PUBLIÉ dans l'App Group

    /// Le texte publié ici quitte l'app : il s'affiche sur l'écran d'accueil,
    /// hors de portée de toute résolution ultérieure. `publishConversations`
    /// est donc le dernier endroit où le Prisme peut encore s'appliquer — et
    /// il ne l'appliquait pas, pendant que la ligne de liste in-app, elle, le
    /// faisait depuis `resolvedLastMessagePreview`.
    private func makePrismSUT(
        preferredLanguages: [String]
    ) throws -> (WidgetDataManager, UserDefaults) {
        let suite = "group.test.meeshy.widgetprism.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let sut = WidgetDataManager(
            suiteName: suite,
            stagingDirectories: [],
            preferredContentLanguages: { preferredLanguages }
        )
        return (sut, defaults)
    }

    private func makeConversation(
        id: String = "conv-1",
        type: MeeshyConversation.ConversationType = .direct,
        title: String = "Alice",
        lastMessagePreview: String?,
        lastMessageOriginalLanguage: String?,
        lastMessageTranslations: [String: String]?,
        lastMessageSenderName: String? = nil
    ) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: id,
            identifier: id,
            type: type,
            title: title,
            lastMessagePreview: lastMessagePreview,
            lastMessageSenderName: lastMessageSenderName
        )
        conversation.lastMessageOriginalLanguage = lastMessageOriginalLanguage
        conversation.lastMessageTranslations = lastMessageTranslations
        return conversation
    }

    private func publishedPreviews(from defaults: UserDefaults) throws -> [String] {
        let data = try XCTUnwrap(
            defaults.data(forKey: "recent_conversations"),
            "publishConversations doit écrire la clé recent_conversations"
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode([WidgetConversation].self, from: data).map(\.lastMessage)
    }

    func test_publishConversations_publishesTheTranslationMatchingTheViewerPrism_notTheSenderLanguage() throws {
        let (sut, defaults) = try makePrismSUT(preferredLanguages: ["fr"])
        sut.publishConversations([
            makeConversation(
                lastMessagePreview: "Hello there",
                lastMessageOriginalLanguage: "en",
                lastMessageTranslations: ["fr": "Bonjour"]
            )
        ])

        XCTAssertEqual(
            try publishedPreviews(from: defaults), ["Bonjour"],
            "le widget doit afficher l'aperçu dans la langue du LECTEUR, comme la liste in-app"
        )
    }

    /// Règle #1 du Prisme (CLAUDE.md) : l'absence de traduction vers une langue
    /// du prisme fait afficher l'ORIGINAL — jamais `translations.first`.
    func test_publishConversations_withNoPreferredLanguageServed_publishesTheOriginal_neverAnUnrelatedTranslation() throws {
        let (sut, defaults) = try makePrismSUT(preferredLanguages: ["fr"])
        sut.publishConversations([
            makeConversation(
                lastMessagePreview: "Hello there",
                lastMessageOriginalLanguage: "en",
                lastMessageTranslations: ["de": "Hallo"]
            )
        ])

        XCTAssertEqual(try publishedPreviews(from: defaults), ["Hello there"])
    }

    /// Règle #3 du Prisme : la langue d'origine concourt à son RANG. Prisme
    /// `["fr", "en"]`, message anglais, traduction française disponible →
    /// « Bonjour », jamais « Hello ».
    func test_publishConversations_originalLanguageRanksInThePrism_itNeverShortCircuitsThePrimaryLanguage() throws {
        let (sut, defaults) = try makePrismSUT(preferredLanguages: ["fr", "en"])
        sut.publishConversations([
            makeConversation(
                lastMessagePreview: "Hello there",
                lastMessageOriginalLanguage: "en",
                lastMessageTranslations: ["fr": "Bonjour"]
            )
        ])

        XCTAssertEqual(try publishedPreviews(from: defaults), ["Bonjour"])
    }

    /// Le préfixe d'expéditeur des conversations de groupe doit précéder le
    /// texte RÉSOLU — sinon la ligne mélange le nom traduit et le corps brut.
    func test_publishConversations_groupPrefix_wrapsTheResolvedPreview() throws {
        let (sut, defaults) = try makePrismSUT(preferredLanguages: ["fr"])
        sut.publishConversations([
            makeConversation(
                type: .group,
                title: "Équipe",
                lastMessagePreview: "Hello there",
                lastMessageOriginalLanguage: "en",
                lastMessageTranslations: ["fr": "Bonjour"],
                lastMessageSenderName: "Alice"
            )
        ])

        XCTAssertEqual(try publishedPreviews(from: defaults), ["Alice: Bonjour"])
    }

    // MARK: - #9622 — le texte d'un message qui disparaît ne sort pas sur l'écran d'accueil

    /// Le serveur sert le TEXTE d'une flamme à durée dans l'aperçu de liste
    /// (avec son décompte) ; le widget l'affichait sur l'écran d'accueil, hors
    /// de toute couche sécurisée, et le gardait après la destruction du message
    /// tant que sa frise n'était pas rafraîchie.
    private func makeDisappearingConversation(
        type: MeeshyConversation.ConversationType = .direct,
        senderName: String? = nil,
        protect: (inout MeeshyConversation) -> Void
    ) -> MeeshyConversation {
        var conversation = makeConversation(
            type: type,
            lastMessagePreview: "Rendez-vous à 18 h au quai",
            lastMessageOriginalLanguage: "fr",
            lastMessageTranslations: nil,
            lastMessageSenderName: senderName
        )
        protect(&conversation)
        return conversation
    }

    func test_publishConversations_timedFlame_publishesItsProtectionLabel_neverItsText() throws {
        let (sut, defaults) = try makePrismSUT(preferredLanguages: ["fr"])
        sut.publishConversations([
            makeDisappearingConversation {
                $0.lastMessageNature = LastMessageNature(
                    effectFlags: Int(MessageEffectFlags.ephemeral.rawValue), ephemeralDuration: 30
                )
            }
        ])

        XCTAssertEqual(
            try publishedPreviews(from: defaults),
            [try XCTUnwrap(OutsidePreview.protectionLabel(for: .timedFlame))],
            "une flamme à durée ne laisse sur l'écran d'accueil que son libellé de protection"
        )
    }

    func test_publishConversations_viewOnceAndAfterReadFlame_publishTheirProtectionLabels() throws {
        let (sut, defaults) = try makePrismSUT(preferredLanguages: ["fr"])
        sut.publishConversations([
            makeDisappearingConversation { $0.lastMessageIsViewOnce = true },
        ])
        XCTAssertEqual(
            try publishedPreviews(from: defaults),
            [try XCTUnwrap(OutsidePreview.protectionLabel(for: .viewOnce))]
        )

        sut.publishConversations([
            makeDisappearingConversation {
                $0.lastMessageNature = LastMessageNature(
                    effectFlags: Int(MessageEffectFlags.ephemeral.rawValue | MessageEffectFlags.ephemeralAfterRead.rawValue)
                )
            },
        ])
        XCTAssertEqual(
            try publishedPreviews(from: defaults),
            [try XCTUnwrap(OutsidePreview.protectionLabel(for: .afterReadFlame))]
        )
    }

    /// Fermé par défaut : une échéance servie SANS nature (serveur antérieur,
    /// cache ancien) déclare un éphémère dont la durée ne se lit pas.
    func test_publishConversations_servedDeadlineWithoutNature_isTreatedAsDisappearing() throws {
        let (sut, defaults) = try makePrismSUT(preferredLanguages: ["fr"])
        sut.publishConversations([
            makeDisappearingConversation { $0.lastMessageExpiresAt = Date().addingTimeInterval(60) }
        ])

        let published = try XCTUnwrap(try publishedPreviews(from: defaults).first)
        XCTAssertFalse(published.contains("Rendez-vous"), "aucun mot du texte ne sort : \(published)")
    }

    func test_publishConversations_disappearingInAGroup_keepsTheSenderPrefixOverTheLabel() throws {
        let (sut, defaults) = try makePrismSUT(preferredLanguages: ["fr"])
        sut.publishConversations([
            makeDisappearingConversation(type: .group, senderName: "Alice") {
                $0.lastMessageNature = LastMessageNature(
                    effectFlags: Int(MessageEffectFlags.ephemeral.rawValue), ephemeralDuration: 30
                )
            }
        ])

        XCTAssertEqual(
            try publishedPreviews(from: defaults),
            ["Alice: \(try XCTUnwrap(OutsidePreview.protectionLabel(for: .timedFlame)))"]
        )
    }

    func test_outsidePreview_ordinaryMessage_keepsTheResolvedPreview() {
        XCTAssertNil(OutsidePreview.protectionLabel(for: .ordinary))
        XCTAssertEqual(
            OutsidePreview.lastMessage(
                of: makeConversation(
                    lastMessagePreview: "Hello there",
                    lastMessageOriginalLanguage: "en",
                    lastMessageTranslations: ["fr": "Bonjour"]
                ),
                preferredLanguages: ["fr"]
            ),
            "Bonjour"
        )
    }

    // MARK: - WidgetConversation Data Model

    func test_widgetConversation_encodesAndDecodes() throws {
        let conversation = WidgetConversation(
            id: "conv123",
            contactName: "Alice",
            contactAvatar: "person.circle.fill",
            lastMessage: "Hey there!",
            timestamp: Date(timeIntervalSince1970: 1700000000),
            isUnread: true,
            isPinned: false,
            accentColor: "6366F1"
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(conversation)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(WidgetConversation.self, from: data)

        XCTAssertEqual(decoded.id, "conv123")
        XCTAssertEqual(decoded.contactName, "Alice")
        XCTAssertEqual(decoded.contactAvatar, "person.circle.fill")
        XCTAssertEqual(decoded.lastMessage, "Hey there!")
        XCTAssertTrue(decoded.isUnread)
        XCTAssertFalse(decoded.isPinned)
        XCTAssertEqual(decoded.accentColor, "6366F1")
    }

    func test_widgetConversation_identifiableById() {
        let conversation = WidgetConversation(
            id: "unique-id",
            contactName: "Bob",
            contactAvatar: "person.fill",
            lastMessage: "",
            timestamp: Date(),
            isUnread: false,
            isPinned: true,
            accentColor: "4ECDC4"
        )

        XCTAssertEqual(conversation.id, "unique-id")
    }

    // MARK: - WidgetFavoriteContact Data Model

    func test_widgetFavoriteContact_encodesAndDecodes() throws {
        let contact = WidgetFavoriteContact(
            id: "fav1",
            name: "Charlie",
            avatar: "person.crop.circle.fill",
            presence: "online",
            accentColor: "34D399"
        )

        let data = try JSONEncoder().encode(contact)
        let decoded = try JSONDecoder().decode(WidgetFavoriteContact.self, from: data)

        XCTAssertEqual(decoded.id, "fav1")
        XCTAssertEqual(decoded.name, "Charlie")
        XCTAssertEqual(decoded.avatar, "person.crop.circle.fill")
        XCTAssertEqual(decoded.presence, "online")
        XCTAssertEqual(decoded.accentColor, "34D399")
    }

    func test_widgetFavoriteContact_identifiableById() {
        let contact = WidgetFavoriteContact(
            id: "contact-id",
            name: "Dana",
            avatar: "person.fill",
            presence: "offline",
            accentColor: "6366F1"
        )

        XCTAssertEqual(contact.id, "contact-id")
    }

    // MARK: - Multiple Conversations Serialization

    func test_multipleWidgetConversations_encodeAsArray() throws {
        let conversations = [
            WidgetConversation(id: "1", contactName: "A", contactAvatar: "", lastMessage: "a", timestamp: Date(), isUnread: false, isPinned: false, accentColor: "6366F1"),
            WidgetConversation(id: "2", contactName: "B", contactAvatar: "", lastMessage: "b", timestamp: Date(), isUnread: true, isPinned: true, accentColor: "4ECDC4")
        ]

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(conversations)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode([WidgetConversation].self, from: data)

        XCTAssertEqual(decoded.count, 2)
        XCTAssertEqual(decoded[0].contactName, "A")
        XCTAssertEqual(decoded[1].contactName, "B")
        XCTAssertEqual(decoded[0].accentColor, "6366F1")
    }

    // MARK: - publishFavoriteContacts (SSOT des raccourcis Siri)

    /// `favorite_contacts` est LA clé que `MeeshyAppIntents.ContactQuery` lit
    /// pour ré-hydrater les raccourcis enregistrés. Ces tests épinglent la clé
    /// et le contenu — une dérive rendrait tout raccourci silencieusement
    /// orphelin (le défaut historique de la clé `contacts`, jamais écrite).

    private func makeFavoritesSUT() throws -> (WidgetDataManager, UserDefaults) {
        let suite = "group.test.meeshy.favorites.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return (WidgetDataManager(suiteName: suite, stagingDirectories: []), defaults)
    }

    private func makeDirectConversation(
        id: String, title: String, isPinned: Bool = true,
        type: MeeshyConversation.ConversationType = .direct
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: "ident-\(id)",
            type: type,
            title: title,
            isPinned: isPinned
        )
    }

    func test_publishFavoriteContacts_writesInCorrectKey() throws {
        let (sut, defaults) = try makeFavoritesSUT()

        sut.publishFavoriteContacts([makeDirectConversation(id: "conv-1", title: "Alice")])

        let data = try XCTUnwrap(
            defaults.data(forKey: "favorite_contacts"),
            "favorite_contacts key should be written"
        )
        let decoded = try JSONDecoder().decode([WidgetFavoriteContact].self, from: data)
        XCTAssertEqual(decoded.count, 1)
        XCTAssertEqual(decoded[0].id, "conv-1")
        XCTAssertEqual(decoded[0].name, "Alice")
    }

    func test_publishFavoriteContacts_limitsToEightAndDirectPinnedOnly() throws {
        let (sut, defaults) = try makeFavoritesSUT()
        let pinnedDirect = (0..<10).map {
            makeDirectConversation(id: "direct-\($0)", title: "Contact \($0)")
        }
        let noise = [
            makeDirectConversation(id: "group-1", title: "Groupe", type: .group),
            makeDirectConversation(id: "unpinned-1", title: "Pas épinglée", isPinned: false),
        ]

        sut.publishFavoriteContacts(noise + pinnedDirect)

        let data = try XCTUnwrap(defaults.data(forKey: "favorite_contacts"))
        let decoded = try JSONDecoder().decode([WidgetFavoriteContact].self, from: data)
        XCTAssertEqual(decoded.count, 8, "cap à 8 contacts")
        XCTAssertTrue(
            decoded.allSatisfy { $0.id.hasPrefix("direct-") },
            "seules les conversations directes épinglées sont publiées, got \(decoded.map(\.id))"
        )
    }
}


/// P2 (revue local-first 2026-08-01, fiche appgroup-05, appariée au wipe P0
/// appgroup-01) — les providers des widgets retournaient des jeux de données
/// fabriqués (« John Doe », « Jane Smith ») sur clé App Group absente OU sur
/// échec de décodage : toute lecture morte devenait indétectable (le pattern
/// exact qui a masqué la panne de la share extension), et le wipe de logout
/// aurait rempli l'écran d'accueil de conversations fictives crédibles.
///
/// Motifs cherchés APRÈS retrait des commentaires (piège connu du dépôt).
final class MeeshyWidgetsSourceGuardTests: XCTestCase {

    private var widgetsSourceURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Services
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("MeeshyWidgets/MeeshyWidgets.swift")
    }

    private func strippedSource() throws -> String {
        strippingComments(try String(contentsOf: widgetsSourceURL, encoding: .utf8))
    }

    /// Corps d'une fonction : de son en-tête jusqu'à l'ancre structurelle
    /// suivante (pas de fenêtre de découpe fixe — elles pourrissent).
    private func body(of header: String, until nextAnchor: String, in source: String) -> String? {
        guard let start = source.range(of: header) else { return nil }
        guard let end = source.range(of: nextAnchor, range: start.upperBound..<source.endIndex) else { return nil }
        return String(source[start.upperBound..<end.lowerBound])
    }

    func test_loadConversations_hasNoFabricatedFallback() throws {
        let source = try strippedSource()
        guard let body = body(
            of: "private func loadConversations()",
            until: "private func",
            in: source
        ) else {
            XCTFail("Could not locate loadConversations body in MeeshyWidgets.swift")
            return
        }
        XCTAssertFalse(
            body.contains("sampleConversations"),
            "loadConversations must return [] on missing key or decode failure — a fabricated " +
            "fallback hides every dead read and fills the home screen after the logout wipe."
        )
    }

    func test_loadFavorites_hasNoFabricatedFallback() throws {
        let source = try strippedSource()
        guard let body = body(
            of: "private func loadFavorites()",
            until: "\nstruct ",
            in: source
        ) else {
            XCTFail("Could not locate loadFavorites body in MeeshyWidgets.swift")
            return
        }
        XCTAssertFalse(
            body.contains("sampleContacts"),
            "loadFavorites must return [] on missing key or decode failure — same fabricated-fallback " +
            "trap as the share extension outage."
        )
    }

    func test_getSnapshot_reservesSamplesToPreviewContext() throws {
        let source = try strippedSource()
        for (header, anchor) in [
            ("func getSnapshot(in context: Context, completion: @escaping (ConversationEntry) -> ())", "func getTimeline"),
            ("func getSnapshot(in context: Context, completion: @escaping (FavoriteContactsEntry) -> ())", "func getTimeline"),
        ] {
            guard let body = body(of: header, until: anchor, in: source) else {
                XCTFail("Could not locate getSnapshot body for \(header)")
                continue
            }
            XCTAssertTrue(
                body.contains("context.isPreview"),
                "getSnapshot must serve samples ONLY in the widget-gallery preview (context.isPreview) " +
                "and real (possibly empty) data everywhere else."
            )
        }
    }

    // MARK: - Comment stripping (miroir de ShareExtensionSourceGuardTests)

    private func strippingComments(_ source: String) -> String {
        var output = ""
        var iterator = source.startIndex
        var inLineComment = false
        var inBlockComment = false

        while iterator < source.endIndex {
            let remaining = source[iterator...]
            if inLineComment {
                if source[iterator] == "\n" { inLineComment = false; output.append("\n") }
                iterator = source.index(after: iterator)
                continue
            }
            if inBlockComment {
                if remaining.hasPrefix("*/") {
                    inBlockComment = false
                    iterator = source.index(iterator, offsetBy: 2)
                    continue
                }
                iterator = source.index(after: iterator)
                continue
            }
            if remaining.hasPrefix("//") {
                inLineComment = true
                iterator = source.index(iterator, offsetBy: 2)
                continue
            }
            if remaining.hasPrefix("/*") {
                inBlockComment = true
                iterator = source.index(iterator, offsetBy: 2)
                continue
            }
            output.append(source[iterator])
            iterator = source.index(after: iterator)
        }
        return output
    }
}


/// Fiche appgroup-05 — test de contrat app↔widget : `WidgetConversation`
/// (côté app, encodé par `WidgetDataManager`) et `Conversation` (miroir
/// dupliqué dans MeeshyWidgets.swift, non compilable dans ce bundle) doivent
/// rester décodables l'un depuis l'autre. Le miroir STRICT local reproduit le
/// struct widget champ à champ ; toute dérive du contrat JSON casse ce test
/// au lieu de rendre le widget silencieusement vide (pattern
/// `SharePendingSendContractTests`).
final class WidgetConversationContractTests: XCTestCase {

    /// Miroir exact du struct `Conversation` de MeeshyWidgets.swift.
    private struct WidgetMirrorConversation: Decodable {
        let id: String
        let contactName: String
        let contactAvatar: String
        let lastMessage: String
        let timestamp: Date
        let isUnread: Bool
        let isPinned: Bool
        let accentColor: String
    }

    func test_appEncodedConversations_decodeWithWidgetMirror() throws {
        let reference = Date(timeIntervalSince1970: 1_754_000_000)
        let appSide = WidgetConversation(
            id: "conv-42",
            contactName: "Alice",
            contactAvatar: "person.circle.fill",
            lastMessage: "Bonjour !",
            timestamp: reference,
            isUnread: true,
            isPinned: true,
            accentColor: "6366F1"
        )

        // Même configuration d'encodeur que WidgetDataManager (ISO 8601).
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let payload = try encoder.encode([appSide])

        // Même configuration de décodeur que les providers du widget.
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode([WidgetMirrorConversation].self, from: payload)

        let mirror = try XCTUnwrap(decoded.first)
        XCTAssertEqual(mirror.id, "conv-42")
        XCTAssertEqual(mirror.contactName, "Alice")
        XCTAssertEqual(mirror.contactAvatar, "person.circle.fill")
        XCTAssertEqual(mirror.lastMessage, "Bonjour !")
        XCTAssertEqual(mirror.timestamp.timeIntervalSince1970, reference.timeIntervalSince1970, accuracy: 1)
        XCTAssertTrue(mirror.isUnread)
        XCTAssertTrue(mirror.isPinned)
        XCTAssertEqual(mirror.accentColor, "6366F1")
    }

    // MARK: - #11387 — une conversation verrouillée ne sort pas son contenu

    @MainActor
    private final class LockedIds {
        nonisolated deinit {}
        var ids: Set<String> = []
    }

    private func makeLockSUT(locked: LockedIds) throws -> (WidgetDataManager, UserDefaults) {
        let suite = "group.test.meeshy.widgetlock.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let sut = WidgetDataManager(
            suiteName: suite,
            stagingDirectories: [],
            preferredContentLanguages: { ["fr"] },
            shareDirectoryOwner: { "000000000000000000000u01" },
            shareDirectoryPeople: { _ in [] },
            contentLocks: { locked.ids }
        )
        return (sut, defaults)
    }

    private func makeSecretConversation() -> MeeshyConversation {
        makeConversation(
            lastMessagePreview: "Mot de passe: 1234",
            lastMessageOriginalLanguage: "fr",
            lastMessageTranslations: nil
        )
    }

    func test_publishConversations_lockedConversation_publishesTheLockLabel_neverItsLastMessage() throws {
        let locked = LockedIds()
        locked.ids = ["conv-1"]
        let (sut, defaults) = try makeLockSUT(locked: locked)

        sut.publishConversations([makeSecretConversation()])

        XCTAssertEqual(try publishedPreviews(from: defaults), [ConversationLockedPreviewLine.label])
    }

    /// L'extension de notification lit le verrou dans ce cliché : sans lui, la
    /// bannière d'une conversation verrouillée montrerait le message en clair.
    func test_publishConversationSnapshots_lockedConversation_declaresTheLockToTheNotificationExtension() throws {
        let locked = LockedIds()
        locked.ids = ["conv-1"]
        let (sut, defaults) = try makeLockSUT(locked: locked)

        sut.publishConversationSnapshots([makeSecretConversation()], categoryNamesById: [:])

        let data = try XCTUnwrap(defaults.data(forKey: "conversation_snapshots"))
        let snapshots = try JSONDecoder().decode([String: ConversationSnapshotPayload].self, from: data)
        XCTAssertEqual(snapshots["conv-1"]?.isLocked, true)
    }

    /// Verrouiller ne touche pas la liste : sans republication, le widget et
    /// l'extension garderaient le clair jusqu'au prochain message.
    func test_republishForContentLocks_rewritesWhatWasPublished() throws {
        let locked = LockedIds()
        let (sut, defaults) = try makeLockSUT(locked: locked)
        sut.publishConversations([makeSecretConversation()])
        XCTAssertEqual(try publishedPreviews(from: defaults), ["Mot de passe: 1234"])

        locked.ids = ["conv-1"]
        sut.republishForContentLocks()
        XCTAssertEqual(try publishedPreviews(from: defaults), [ConversationLockedPreviewLine.label])

        locked.ids = []
        sut.republishForContentLocks()
        XCTAssertEqual(try publishedPreviews(from: defaults), ["Mot de passe: 1234"])
    }

    /// Sans compte connecté (la déconnexion lève tous les verrous), un
    /// changement de verrou ne republie rien.
    func test_republishForContentLocks_withoutAConnectedAccount_publishesNothing() throws {
        let suite = "group.test.meeshy.widgetlock.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        let sut = WidgetDataManager(
            suiteName: suite,
            stagingDirectories: [],
            preferredContentLanguages: { ["fr"] },
            shareDirectoryOwner: { nil },
            contentLocks: { [] }
        )
        sut.publishConversations([makeSecretConversation()])
        defaults.removeObject(forKey: "recent_conversations")

        sut.republishForContentLocks()

        XCTAssertNil(defaults.data(forKey: "recent_conversations"))
    }

    /// Après la déconnexion, un changement de verrou ne republie JAMAIS les
    /// conversations du compte sortant.
    func test_republishForContentLocks_afterTheLogoutWipe_publishesNothing() throws {
        let locked = LockedIds()
        let (sut, defaults) = try makeLockSUT(locked: locked)
        sut.publishConversations([makeSecretConversation()])
        sut.wipeAll()

        sut.republishForContentLocks()

        XCTAssertNil(defaults.data(forKey: "recent_conversations"))
    }
}
