// apps/ios/MeeshyTests/Unit/Views/MessageListSnapshotPrepTests.swift

import XCTest
import GRDB
import UIKit
@testable import Meeshy
@testable import MeeshySDK

/// **La liste ne reconstruit plus tout son snapshot à chaque événement (#4944).**
///
/// `applySnapshot` ne distinguait pas « la COMPOSITION de la fenêtre a changé »
/// de « une ligne a bougé de VERSION » : un accusé de lecture, une réaction,
/// une transcription ou une réémission de frappe rebâtissaient `reversed` + les
/// items + le regroupement par jour + la carte `serverId → localId` — les
/// ~75 ms mesurées sur device, payées sur le main thread pendant que le doigt
/// défile.
///
/// Deux affirmations sont gardées ici, et la seconde est celle qui protège la
/// première d'être « juste et fausse » :
/// 1. une empreinte INCHANGÉE réutilise la préparation (le gain) ;
/// 2. tout ce qui change la composition — un message qui arrive, un `serverId`
///    qui atterrit, une date corrigée, une permutation — la fait rebâtir (la
///    sûreté). Une empreinte trop grossière servirait un flux périmé, ce qui
///    est un défaut PIRE que la dépense qu'elle évite.
@MainActor
final class MessageListSnapshotPrepTests: XCTestCase {

    // MARK: - Harnais

    private func makeCalendar() -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = Locale(identifier: "fr_FR")
        cal.timeZone = TimeZone(identifier: "Europe/Paris")!
        return cal
    }

    private func date(_ year: Int, _ month: Int, _ day: Int, _ hour: Int = 12) -> Date {
        makeCalendar().date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    private func makeRecord(
        localId: String,
        serverId: String? = nil,
        createdAt: Date,
        changeVersion: Int64 = 0
    ) -> MessageRecord {
        MessageRecord(
            localId: localId, serverId: serverId,
            conversationId: "c1", senderId: "user_other",
            content: "Bonjour", originalLanguage: "fr",
            messageType: "text", messageSource: "user", contentType: "text",
            state: .sent, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: nil, storyReplyToId: nil,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: nil, forwardedFromJson: nil,
            expiresAt: nil, effectFlags: 0,
            maxViewOnceCount: nil, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: nil, senderUsername: nil,
            senderColor: nil, senderAvatarURL: nil,
            deliveredCount: 1, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: createdAt, sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: createdAt,
            attachmentsJson: nil, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: changeVersion
        )
    }

    /// L'ordre du STORE (plus ancien d'abord) en entrée ; la préparation reçoit
    /// la fenêtre renversée, comme `applySnapshot` la lui donne.
    private func makePrep(_ records: [MessageRecord]) -> MessageListSnapshotPrep {
        MessageListSnapshotPrep(
            reversedRecords: Array(records.reversed()),
            fingerprint: MessageListSnapshotPrep.Fingerprint(records: records),
            calendar: makeCalendar()
        )
    }

    private func threeMessages() -> [MessageRecord] {
        [
            makeRecord(localId: "m1", serverId: "s1", createdAt: date(2026, 5, 18, 9)),
            makeRecord(localId: "m2", serverId: "s2", createdAt: date(2026, 5, 18, 14)),
            makeRecord(localId: "m3", serverId: "s3", createdAt: date(2026, 5, 19, 10)),
        ]
    }

    // MARK: - L'empreinte réutilise (le gain)

    /// LE témoin du lot : une version qui bouge — l'immense majorité du trafic
    /// d'un fil vivant (accusés, réactions, traductions) — laisse l'empreinte
    /// IDENTIQUE, donc ne fait rien reconstruire.
    func test_uneVersionQuiBouge_neChangePasLEmpreinte() {
        let records = threeMessages()
        var bumped = records
        bumped[1].changeVersion = 42

        XCTAssertEqual(
            MessageListSnapshotPrep.Fingerprint(records: records),
            MessageListSnapshotPrep.Fingerprint(records: bumped),
            "La `changeVersion` ne décrit AUCUNE composition : la faire entrer dans l'empreinte "
            + "rendrait la mémoïsation inutile pile sur le trafic qu'elle existe pour absorber."
        )
    }

    func test_deuxPreparationsSurLaMemeEmpreinte_neCalculentQuUneFois() {
        let records = threeMessages()
        var builds = 0
        var memo: MessageListSnapshotPrep?

        for _ in 0..<5 {
            let fingerprint = MessageListSnapshotPrep.Fingerprint(records: records)
            if let current = memo, current.fingerprint == fingerprint { continue }
            memo = makePrep(records)
            builds += 1
        }

        XCTAssertEqual(builds, 1, "cinq poses sur la même fenêtre ⇒ UNE construction")
        XCTAssertEqual(memo?.messageItems.count, 3)
    }

    // MARK: - L'empreinte rebâtit (la sûreté)

    func test_unMessageQuiArrive_changeLEmpreinte() {
        let records = threeMessages()
        let grown = records + [makeRecord(localId: "m4", createdAt: date(2026, 5, 19, 11))]

        XCTAssertNotEqual(
            MessageListSnapshotPrep.Fingerprint(records: records),
            MessageListSnapshotPrep.Fingerprint(records: grown)
        )
    }

    /// L'accusé du gateway pose un `serverId` sur une ligne optimiste SANS
    /// toucher à l'ordre. Sans lui dans l'empreinte, la carte mémoïsée
    /// ignorerait le message qu'on vient d'envoyer — et le saut vers une
    /// citation ne le trouverait plus.
    func test_unServerIdQuiAtterrit_changeLEmpreinte() {
        let optimistic = [makeRecord(localId: "m1", serverId: nil, createdAt: date(2026, 5, 18, 9))]
        let acked = [makeRecord(localId: "m1", serverId: "s1", createdAt: date(2026, 5, 18, 9))]

        XCTAssertNotEqual(
            MessageListSnapshotPrep.Fingerprint(records: optimistic),
            MessageListSnapshotPrep.Fingerprint(records: acked)
        )
        XCTAssertEqual(makePrep(acked).serverIdToLocalId["s1"], "m1")
        XCTAssertTrue(makePrep(optimistic).serverIdToLocalId.isEmpty)
    }

    /// Le découpage par jour est fonction des DATES : une date corrigée par le
    /// serveur doit refaire les séparateurs, même à composition d'ids égale.
    func test_uneDateQuiChange_changeLEmpreinte() {
        let records = threeMessages()
        var moved = records
        moved[2].createdAt = date(2026, 5, 25, 10)

        XCTAssertNotEqual(
            MessageListSnapshotPrep.Fingerprint(records: records),
            MessageListSnapshotPrep.Fingerprint(records: moved)
        )
    }

    /// Bornes et comptes identiques, ORDRE inversé : sans le combiné ordonné,
    /// l'empreinte servirait un flux à l'envers.
    func test_unePermutationInterne_changeLEmpreinte() {
        let records = threeMessages()
        var swapped = records
        swapped.swapAt(0, 1)

        XCTAssertNotEqual(
            MessageListSnapshotPrep.Fingerprint(records: records),
            MessageListSnapshotPrep.Fingerprint(records: swapped),
            "count, premier et dernier `localId` sont ici IDENTIQUES — seule la combinaison "
            + "ordonnée distingue les deux fenêtres."
        )
    }

    // MARK: - Ce que la préparation produit

    func test_lesItemsMessage_sontDansLOrdreInverse() {
        XCTAssertEqual(
            makePrep(threeMessages()).messageItems,
            [.message(localId: "m3"), .message(localId: "m2"), .message(localId: "m1")],
            "liste inversée : index 0 = bas visuel = message le plus récent"
        )
    }

    /// Le séparateur de jour est poussé APRÈS son groupe — il se retrouve
    /// visuellement AU-DESSUS de ses messages dans le flux inversé.
    func test_leCorps_pousseLeSeparateurApresChaqueGroupe() {
        let calendar = makeCalendar()
        XCTAssertEqual(
            makePrep(threeMessages()).bodyItems,
            [
                .message(localId: "m3"),
                .dayHeader(dayStart: calendar.startOfDay(for: date(2026, 5, 19, 10))),
                .message(localId: "m2"),
                .message(localId: "m1"),
                .dayHeader(dayStart: calendar.startOfDay(for: date(2026, 5, 18, 9))),
            ]
        )
    }

    func test_lePlusAncien_estLaQueueDeLaFenetre() {
        XCTAssertEqual(makePrep(threeMessages()).oldestLocalId, "m1")
        XCTAssertNil(makePrep([]).oldestLocalId)
    }

    func test_uneFenetreVide_neProduitAucunItem() {
        let prep = makePrep([])
        XCTAssertTrue(prep.messageItems.isEmpty)
        XCTAssertTrue(prep.bodyItems.isEmpty)
        XCTAssertTrue(prep.serverIdToLocalId.isEmpty)
    }

    // MARK: - La version, elle, se lit sur les records VIVANTS

    func test_changedItems_neRendQueLesLignesDontLaVersionABouge() {
        var records = threeMessages()
        let baseline = MessageListSnapshotPrep.baseline(of: records)
        records[1].changeVersion = 7
        let present: Set<MessageListItem> = [
            .message(localId: "m1"), .message(localId: "m2"), .message(localId: "m3"),
        ]

        XCTAssertEqual(
            MessageListSnapshotPrep.changedItems(
                records: records, baseline: baseline, presentIn: present
            ),
            [.message(localId: "m2")]
        )
    }

    /// Reconfigurer un identifiant que le même `apply` INSÈRE n'est pas
    /// supporté par UIKit — et peut faire disparaître la bulle fraîchement
    /// insérée. L'item absent du snapshot appliqué est donc écarté.
    func test_changedItems_ecarteCeQueLeSnapshotNaPasEncore() {
        let records = threeMessages()
        let present: Set<MessageListItem> = [.message(localId: "m1")]

        XCTAssertEqual(
            MessageListSnapshotPrep.changedItems(
                records: records, baseline: [:], presentIn: present
            ),
            [.message(localId: "m1")],
            "m2 et m3 ont bien une version inconnue de la base, mais ils ne sont pas encore posés."
        )
    }

    func test_baseline_porteLaVersionDeChaqueLigne() {
        var records = threeMessages()
        records[0].changeVersion = 3
        XCTAssertEqual(
            MessageListSnapshotPrep.baseline(of: records),
            ["m1": 3, "m2": 0, "m3": 0]
        )
    }

    // MARK: - Le chemin court de la frappe (loi pure)

    func test_laFrappeQuiCommence_insere_memeSousLeDoigt() {
        XCTAssertEqual(
            TypingIndicatorSnapshotLaw.change(
                showTyping: true, wasShowing: false, rosterChanged: true, isMoving: true
            ),
            .insert,
            "une INSERTION n'affecte que le bas du flux : elle reste immédiate, comme dans la pose complète"
        )
    }

    func test_laFrappeQuiSArrete_retire() {
        XCTAssertEqual(
            TypingIndicatorSnapshotLaw.change(
                showTyping: false, wasShowing: true, rosterChanged: true, isMoving: false
            ),
            .remove
        )
    }

    /// La réémission `typing:start` toutes les trois secondes, roster inchangé :
    /// c'est exactement l'événement que ce chemin existe pour rendre gratuit.
    func test_unRosterInchange_neFaitRien() {
        XCTAssertEqual(
            TypingIndicatorSnapshotLaw.change(
                showTyping: true, wasShowing: true, rosterChanged: false, isMoving: false
            ),
            .unchanged
        )
    }

    func test_unRosterQuiChange_reconfigureAuRepos_etAttendSousLeDoigt() {
        XCTAssertEqual(
            TypingIndicatorSnapshotLaw.change(
                showTyping: true, wasShowing: true, rosterChanged: true, isMoving: false
            ),
            .reconfigure
        )
        XCTAssertEqual(
            TypingIndicatorSnapshotLaw.change(
                showTyping: true, wasShowing: true, rosterChanged: true, isMoving: true
            ),
            .deferReconfigure,
            "§4.7ter — re-mesurer une cellule VISIBLE en plein défilement décale tout ce qui la surplombe"
        )
    }

    func test_pasDeFrappe_pasDeCellule_rienAFaire() {
        XCTAssertEqual(
            TypingIndicatorSnapshotLaw.change(
                showTyping: false, wasShowing: false, rosterChanged: true, isMoving: false
            ),
            .unchanged
        )
    }

    // MARK: - Le contrôleur, montré à l'œuvre

    /// La preuve de bout en bout : deux poses de plus sur la MÊME fenêtre ne
    /// construisent aucune préparation supplémentaire.
    func test_leControleur_neReconstruitPasCeQuIlADeja() async throws {
        let vc = try await makeMountedSUT()
        XCTAssertEqual(vc.snapshotPrepBuildsForTesting, 1,
                       "le montage construit la première préparation")

        vc.update(isDark: true, accentColor: "#111111")
        vc.update(isDark: false, accentColor: "#222222")

        XCTAssertEqual(
            vc.snapshotPrepBuildsForTesting, 1,
            "un thème et une couleur d'accent ne changent RIEN à la composition de la fenêtre : "
            + "ces poses reconfigurent des cellules, elles ne rebâtissent pas le flux."
        )
    }

    func test_uneVersionQuiBouge_neFaitRienReconstruireAuControleur() async throws {
        let vc = try await makeMountedSUT()
        var bumped = try XCTUnwrap(vc.store.messages.first)
        bumped.changeVersion += 1
        vc.store.apply(records: [bumped])

        vc.update(isDark: true, accentColor: "#111111")

        XCTAssertEqual(vc.snapshotPrepBuildsForTesting, 1)
    }

    func test_unMessageQuiArrive_faitReconstruire_etEntreDansLeFlux() async throws {
        let vc = try await makeMountedSUT()
        let newer = makeRecord(
            localId: "m2", serverId: "server_m2",
            createdAt: Date().addingTimeInterval(60)
        )
        vc.store.apply(records: vc.store.messages + [newer])

        vc.update(isDark: true, accentColor: "#111111")

        XCTAssertEqual(vc.snapshotPrepBuildsForTesting, 2,
                       "la composition a changé : la préparation DOIT être refaite")
        XCTAssertTrue(vc.dataSource.snapshot().itemIdentifiers.contains(.message(localId: "m2")))
    }

    /// Le chemin court ne peut pas trancher avant que la vue soit chargée — il
    /// le DIT, et l'appelant retombe sur la pose complète. Un chemin court qui
    /// échouerait en silence laisserait la bulle « écrit… » absente jusqu'au
    /// message suivant.
    func test_leCheminCourt_avantLeMontage_rendFalse() async throws {
        let vc = makeSUT(store: try await makeSeededStore())
        XCTAssertFalse(vc.applyTypingIndicatorFastPath())
    }

    /// Monté et sans personne qui écrit : le chemin court tranche (il rend
    /// `true`), ne touche pas au flux, et surtout ne rebâtit RIEN.
    func test_leCheminCourt_sansFrappeur_neCouteRien() async throws {
        let vc = try await makeMountedSUT()
        let before = vc.dataSource.snapshot().numberOfItems

        XCTAssertTrue(vc.applyTypingIndicatorFastPath())

        XCTAssertEqual(vc.dataSource.snapshot().numberOfItems, before)
        XCTAssertEqual(vc.snapshotPrepBuildsForTesting, 1,
                       "la frappe ne passe JAMAIS par la préparation de la fenêtre")
    }

    /// **Le filtre « JAMAIS de reconfigure HORS ÉCRAN » du chemin court.**
    ///
    /// Re-héberger une cellule invisible fait transitoirement retomber sa
    /// hauteur à l'ESTIMÉE par le chemin self-sizing : le contentSize
    /// s'effondre et l'offset est re-clampé vers le bas — le « rappel au
    /// bas » de l'audit 2026-08-18. `applySnapshot` filtre déjà sa portée sur
    /// les cellules visibles ; le chemin court ne peut pas s'en dispenser, et
    /// ce témoin garde le prédicat qui l'applique.
    func test_sansCelluleDeFrappe_rienNestVisibleAReconfigurer() async throws {
        let vc = try await makeMountedSUT()
        XCTAssertFalse(
            vc.isTypingIndicatorVisible,
            "personne n'écrit : la cellule n'est pas dans le flux, donc rien à reconfigurer"
        )
    }

    /// Avant le montage il n'y a ni data source ni cellule réalisée — le
    /// prédicat doit répondre `false` sans toucher au `collectionView`, qui
    /// n'existe pas encore.
    func test_avantLeMontage_leTemoinDeVisibiliteNeTouchePasALaVue() async throws {
        let vc = makeSUT(store: try await makeSeededStore())
        XCTAssertFalse(vc.isTypingIndicatorVisible)
    }

    // MARK: - Montage

    private func makeSUT(store: MessageStore) -> MessageListViewController {
        MessageListViewController(
            store: store,
            currentUserId: "user_me",
            accentColor: "#6366F1",
            isDirect: false,
            isDark: false,
            router: Router(),
            storyViewModel: StoryViewModel(),
            statusViewModel: StatusViewModel(),
            conversationListViewModel: ConversationListViewModel()
        )
    }

    private func makeMountedSUT() async throws -> MessageListViewController {
        let vc = makeSUT(store: try await makeSeededStore())
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
        vc.stopSeenTracking()
        return vc
    }

    /// Un message unique, confirmé — même forme que
    /// `MessageListDataSourceQuiescenceTests.makeSeededStore` (privée à son fichier).
    private func makeSeededStore() async throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let seeded = makeRecord(localId: "m1", serverId: "server_m1", createdAt: Date())
        try await pool.write { db in
            try seeded.insert(db)
        }
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()
        return store
    }
}
