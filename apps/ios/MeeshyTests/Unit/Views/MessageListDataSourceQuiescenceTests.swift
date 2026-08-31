// apps/ios/MeeshyTests/Unit/Views/MessageListDataSourceQuiescenceTests.swift

import XCTest
import GRDB
import UIKit
@testable import Meeshy
@testable import MeeshySDK

/// **La liste n'APPLIQUE plus rien sous ce qui la recouvre (#3947).**
///
/// Deux suites gardent déjà les deux premières dépenses d'un fil couvert par
/// un pane opaque : `MessageListDormantRenderingSourceGuardTests` pour le
/// RENDU (`isHidden`), `MessageListTimerQuiescenceGuardTests` pour l'HORLOGE
/// (le réveil 4 Hz du suivi de lecture). Cette suite garde la troisième, que
/// la seconde avait explicitement écartée en écrivant : « les abonnements
/// Combine d'`observeStore()` sont dirigés par événement et ne coûtent rien
/// tant que rien n'arrive ».
///
/// C'est vrai À L'IDLE — et c'est précisément le régime que la mesure de
/// #3940 lisait. Dans une conversation VIVANTE, qui est le cas nominal de la
/// Rivière, tout arrive : un message, une traduction du Prisme, une
/// transcription, une réaction, un accusé. Chacun rebâtissait un snapshot
/// ENTIER puis le diffait, réalisant les `UIHostingConfiguration` de cellules
/// que personne ne regarde.
///
/// > Une veille de RENDU n'est pas une veille d'HORLOGE, et aucune des deux
/// > n'est une veille de DONNÉES. La question à poser à toute mise en sommeil
/// > n'est pas « qu'est-ce qui se réveille tout seul ? » mais aussi
/// > « qu'est-ce qui se réveille quand quelque chose ARRIVE ? ».
@MainActor
final class MessageListDataSourceQuiescenceTests: XCTestCase {

    // MARK: - La veille (comportement)

    /// LE témoin. Le store porte un message ; monté sous la Rivière, le data
    /// source reste VIDE — la construction O(n) et le diff n'ont pas eu lieu.
    func test_sousLaRiviere_aucunSnapshotNAtteintLeDataSource() async throws {
        let vc = try await makeMountedSUT(initialMode: .river)

        XCTAssertEqual(
            vc.dataSource.snapshot().numberOfItems, 0,
            "La Rivière couvre le fil d'un pane OPAQUE : rebâtir puis diffuser un snapshot "
            + "n'y montre rien à personne."
        )
    }

    func test_sousLeResume_aucunSnapshotNonPlus() async throws {
        let vc = try await makeMountedSUT(initialMode: .summary)

        XCTAssertEqual(vc.dataSource.snapshot().numberOfItems, 0,
                       "Le Résumé couvre le fil autant que la Rivière.")
    }

    /// **Contre-épreuve, sans laquelle les deux témoins ci-dessus passeraient
    /// au vert pour n'importe quelle raison** — store vide, montage raté, data
    /// source non configuré. Le MÊME montage, dans un mode RENDU, peuple.
    func test_dansUnModeRendu_laListeEstPeupleeDesLeMontage() async throws {
        let vc = try await makeMountedSUT(initialMode: .bubbles)

        XCTAssertTrue(
            vc.dataSource.snapshot().itemIdentifiers.contains(.message(localId: "m1")),
            "En Bulles, le fil s'applique comme avant — la veille ne coûte rien à qui regarde."
        )
    }

    /// **L'aller ET le retour.** Ne garder que l'aller livrerait un défaut
    /// PIRE que celui qu'on corrige : une liste éternellement vide au retour
    /// vers un mode rendu. Le réveil réapplique `.allItems` depuis
    /// `store.messages`, qui n'a jamais été suspendu.
    func test_leReveilReappliqueCeQueLaVeilleAvaitSaute() async throws {
        let vc = try await makeMountedSUT(initialMode: .river)
        XCTAssertEqual(vc.dataSource.snapshot().numberOfItems, 0)

        vc.readingMode = .script

        XCTAssertTrue(
            vc.dataSource.snapshot().itemIdentifiers.contains(.message(localId: "m1")),
            "Au retour, le fil porte ce qui est arrivé pendant qu'il dormait — sinon la veille "
            + "aurait effacé la conversation."
        )
    }

    /// Passer d'un pane à l'autre ne réveille rien, et le retour reste entier.
    func test_dUnPaneALAutre_puisRetour() async throws {
        let vc = try await makeMountedSUT(initialMode: .river)
        vc.readingMode = .summary
        XCTAssertEqual(vc.dataSource.snapshot().numberOfItems, 0)

        vc.readingMode = .bubbles
        XCTAssertTrue(vc.dataSource.snapshot().itemIdentifiers.contains(.message(localId: "m1")))
    }

    // MARK: - La porte est UNIQUE (garde de source)

    /// Gater les quatre appliers un par un aurait tenu aujourd'hui et menti
    /// demain : une énumération de sites affirme « ces sites appliquent la
    /// règle » (vérifiable) ET « ce sont les sites où elle s'applique »
    /// (jamais vérifiée). Cette garde rend la seconde affirmation inutile.
    ///
    /// `AppSourceGuard.unit` agrège le type ET toutes ses extensions
    /// `MessageListViewController+…` — l'entonnoir en fait donc partie, et
    /// c'est LUI l'unique occurrence attendue. Compter (plutôt qu'interdire)
    /// est ce qui distingue « une seule porte » de « aucune porte », qui
    /// serait tout aussi vert et ne protégerait rien.
    func test_uneSeulePorteAtteintLeDataSourceDansToutLUnite() throws {
        let unite = try Self.stripped("Meeshy/Features/Main/Views/MessageListViewController.swift")
        let entonnoir = try Self.stripped(
            "Meeshy/Features/Main/Views/MessageListViewController+ThreadQuiescence.swift")

        XCTAssertEqual(
            unite.components(separatedBy: "dataSource.apply(").count - 1, 1,
            "Une seule porte atteint le data source dans toute l'unité. Un applicateur qui "
            + "court-circuite l'entonnoir rouvre le défaut sans qu'aucun autre témoin ne tombe."
        )
        XCTAssertEqual(
            entonnoir.components(separatedBy: "dataSource.apply(").count - 1, 1,
            "Et cette porte est l'entonnoir — sans quoi le compte de 1 ci-dessus serait satisfait "
            + "par n'importe quel site resté en direct."
        )
    }

    /// **Ancre de la garde négative ci-dessus** : sans elle, effacer les cinq
    /// appels la ferait passer au vert en perdant sa protection.
    func test_lesCinqAppliersPassentBienParLEntonnoir() throws {
        let host = try Self.stripped("Meeshy/Features/Main/Views/MessageListViewController.swift")

        XCTAssertGreaterThanOrEqual(
            host.components(separatedBy: "applyToDataSource(").count - 1, 5,
            "Cinq sites appliquaient au data source (snapshot, surlignage, reconfiguration des "
            + "cellules visibles, reconfiguration par serverId, items Focal) : ils doivent tous "
            + "être là, sinon la garde négative garde le vide."
        )
    }

    func test_lEntonnoirRefuseSousUnPaneEtLaisseSaCompletion() throws {
        let funnel = try Self.stripped(
            "Meeshy/Features/Main/Views/MessageListViewController+ThreadQuiescence.swift")

        XCTAssertTrue(funnel.contains("guard rendersThread else {"),
                      "La condition n'est pas réécrite : `rendersThread` est déjà la loi.")
        XCTAssertTrue(
            funnel.contains("completion()"),
            "La complétion s'exécute MÊME quand rien n'est appliqué : elle désarme des verrous "
            + "(`focalReconfigureInFlight`, `focalDetailsPendingAfterApply`) qu'un entonnoir "
            + "muet laisserait armés pour toujours."
        )
    }

    /// La PRÉPA coûte autant que l'application (O(n) : `reversed` + `map` +
    /// `groupByDay` + carte `serverId`). Sortir seulement à l'entonnoir
    /// l'aurait payée à chaque événement.
    func test_applySnapshotSortAvantSaConstruction() throws {
        let body = try Self.body(of: "private func applySnapshot(", in: Self.stripped(
            "Meeshy/Features/Main/Views/MessageListViewController.swift"))
        let garde = try XCTUnwrap(body.range(of: "guard rendersThread else { return }"))
        let prepa = try XCTUnwrap(body.range(of: "store.messages.reversed()"))

        XCTAssertTrue(garde.lowerBound < prepa.lowerBound,
                      "La garde précède la construction, sinon on paye la prépa pour rien.")
    }

    // MARK: - Le mode avant tout ordre positionnel

    /// Le saut de la Rivière (« répondre à cette personne ») pose
    /// `select(.script)` PUIS `scrollToMessageId`, et les deux arrivent dans le
    /// MÊME passage de `updateUIViewController`. Servir le saut avant le
    /// réveil viserait un data source qui n'a pas encore repris les messages
    /// arrivés sous le pane.
    func test_leModeEstPoseAvantLeSautVersUnMessage() throws {
        let body = try Self.body(of: "func updateUIViewController(", in: Self.stripped(
            "Meeshy/Features/Main/Views/MessageListView.swift"))
        let mode = try XCTUnwrap(body.range(of: "vc.readingMode = readingMode"))
        let saut = try XCTUnwrap(body.range(of: "vc.scrollToMessageFast(localId:"))

        XCTAssertTrue(
            mode.lowerBound < saut.lowerBound,
            "Le RÉVEIL (`readingMode.didSet`, qui réapplique `.allItems`) doit précéder tout "
            + "ordre POSITIONNEL, sinon on saute vers un message que la liste n'a pas encore."
        )
    }

    // MARK: - Harnais

    private static func stripped(_ relative: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relative))
    }

    /// Corps d'une fonction, accolades équilibrées depuis sa signature.
    private static func body(of signature: String, in source: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: signature), "signature introuvable : \(signature)")
        var depth = 0
        var opened = false
        var out = ""
        for character in source[start.lowerBound...] {
            out.append(character)
            if character == "{" { depth += 1; opened = true }
            if character == "}" {
                depth -= 1
                if opened && depth == 0 { return out }
            }
        }
        throw XCTSkip("corps non refermé pour \(signature)")
    }

    private func makeMountedSUT(initialMode: ConversationReadingMode) async throws -> MessageListViewController {
        let store = try await makeSeededStore()
        let vc = MessageListViewController(
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
        // Posé AVANT le chargement de la vue — scénario nominal : le mode
        // arrive avant `viewDidLoad`, et le `didSet` y sort sur `isViewLoaded`.
        // L'ouverture DIRECTE en Résumé (décision auto au-delà de 25 non-lus)
        // est justement le cas de masse.
        vc.readingMode = initialMode
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()
        vc.stopSeenTracking()
        return vc
    }

    /// Un message unique, confirmé — mêmes champs que
    /// `MessageListSeenTrackingModeGateTests.makeSeededStore` (privée à son fichier).
    private func makeSeededStore() async throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            let record = MessageRecord(
                localId: "m1", serverId: "server_m1",
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
                createdAt: Date(), sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: Date(),
                attachmentsJson: nil, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0
            )
            try record.insert(db)
        }
        let persistence = MessagePersistenceActor(dbWriter: pool)
        let store = MessageStore(conversationId: "c1", persistence: persistence)
        await store.loadInitial()
        return store
    }
}
