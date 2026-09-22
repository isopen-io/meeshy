import XCTest
@testable import Meeshy

/// I3 (#7349) — la fiche « Vu par » (`MessageViewsDetailView`) ne rechargeait
/// le statut de lecture qu'à `.onAppear` (`guard readStatusData == nil` dans
/// `loadReadStatus()`) : une fois ouverte, elle restait figée même si
/// `read-status:updated` annonçait un changement pendant qu'elle était
/// visible — il fallait la refermer puis la rouvrir pour la voir bouger.
///
/// `MessageViewsReadStatusRules.shouldFetch` extrait la garde pure qui décide si un appel
/// (initial ou déclenché par le socket) doit vraiment repartir au réseau —
/// testable sans monter la vue SwiftUI, comme `positionFraction` l'est déjà
/// pour ce même fichier (`MessageViewsDetailMediaConsumptionTests`). Elle a
/// quitté la vue à la revue du lot : la fiche touchait le plafond de 1 200
/// lignes, et une règle pure est ce qui en sort le mieux.
@MainActor
final class MessageViewsDetailReadStatusRefreshTests: XCTestCase {

    func test_shouldFetchReadStatus_noExistingData_fetches() {
        XCTAssertTrue(
            MessageViewsReadStatusRules.shouldFetch(
                hasExisting: false, isLoading: false, force: false, hasServerId: true
            )
        )
    }

    func test_shouldFetchReadStatus_existingData_noForce_doesNotRefetch() {
        XCTAssertFalse(
            MessageViewsReadStatusRules.shouldFetch(
                hasExisting: true, isLoading: false, force: false, hasServerId: true
            ),
            "onAppear must not re-issue a request once data is already loaded"
        )
    }

    /// The fix: a `read-status:updated` for this conversation must be able to
    /// force a refetch even though `readStatusData` is already populated —
    /// otherwise the sheet never updates once open.
    func test_shouldFetchReadStatus_existingData_forced_refetches() {
        XCTAssertTrue(
            MessageViewsReadStatusRules.shouldFetch(
                hasExisting: true, isLoading: false, force: true, hasServerId: true
            ),
            "a live read-status update must be able to refresh an already-open sheet"
        )
    }

    func test_shouldFetchReadStatus_alreadyLoading_neverRefetches() {
        XCTAssertFalse(
            MessageViewsReadStatusRules.shouldFetch(
                hasExisting: false, isLoading: true, force: true, hasServerId: true
            ),
            "a request already in flight must not be duplicated, forced or not"
        )
    }

    func test_shouldFetchReadStatus_noServerId_neverFetches() {
        XCTAssertFalse(
            MessageViewsReadStatusRules.shouldFetch(
                hasExisting: false, isLoading: false, force: true, hasServerId: false
            ),
            "an optimistic message with no server id has no /read-status route to call"
        )
    }
}

/// Revue I3 (#7349) — ce que le rechargement en direct emporte AVEC lui.
///
/// Deux manques que la suite ci-dessus ne pouvait pas voir, parce qu'elle
/// n'interroge que la garde d'appel :
///
/// 1. **Le critère « la fiche ouverte se met à jour » n'avait aucun témoin.**
///    `MessageViewsReadStatusRules.shouldFetch` reste vert si l'abonnement
///    `read-status:updated` disparaît du corps de la vue — la garde pure décide ce qu'on fait quand
///    on est appelé, jamais qu'on est appelé. Le câblage d'un modificateur
///    SwiftUI se garde ici comme partout ailleurs dans ce dossier, par la
///    source (`MessageLanguageDetailViewAdaptiveOnChangeSourceGuardTests`).
///    Ce que cette garde prouve : le relais existe et vise la bonne
///    conversation. Ce qu'elle ne prouve pas : qu'un pixel bouge.
/// 2. **Le spinner mangeait la fiche à chaque événement.** Le rendu branchait
///    sur `isLoadingReadStatus` seul ; tant que la fiche ne chargeait qu'à
///    `onAppear`, « en cours » et « rien à montrer » étaient le même état. Le
///    rechargement en direct les sépare, et sans `showsReadStatusSpinner` une
///    fiche déjà remplie repartait en indicateur d'attente à chaque lecteur
///    qui arrive.
@MainActor
final class MessageViewsDetailLiveRefreshWiringTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(
                "Meeshy/Features/Main/Components/MessageDetail/MessageViewsDetailView.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Isole `body` : une occurrence non liée ailleurs dans ce fichier de 1 200
    /// lignes ne doit ni masquer ni faire échouer cette garde.
    private func bodyContent(in src: String) throws -> String {
        let marker = "var body: some View {"
        guard let start = src.range(of: marker) else {
            XCTFail("Signature de `body` introuvable — MessageViewsDetailView.swift a changé de forme.")
            throw XCTSkip("marker")
        }
        guard let end = src.range(of: "private var viewsTabContent: some View {",
                                  range: start.upperBound..<src.endIndex) else {
            XCTFail("Fin du corps de `body` introuvable — MessageViewsDetailView.swift a changé de forme.")
            throw XCTSkip("marker")
        }
        return String(src[start.upperBound..<end.lowerBound])
    }

    func test_readSourceIsNonEmpty() throws {
        XCTAssertGreaterThan(try source().count, 1000,
            "la garde lit un chemin FAUX si la source revient vide")
    }

    func test_body_subscribesToReadStatusUpdated_forThisConversation_andForcesARefetch() throws {
        let body = try bodyContent(in: try source())

        XCTAssertTrue(body.contains("MessageSocketManager.shared.readStatusUpdated"),
            "sans cet abonnement la fiche ne se met à jour qu'en la refermant — " +
            "c'est le critère de fin de #7349, et la garde pure reste verte sans lui")
        XCTAssertTrue(body.contains("$0.conversationId == conversationId"),
            "l'événement est agrégé par conversation : une fiche ne doit pas repartir " +
            "au réseau pour le fil d'à côté")
        XCTAssertTrue(body.contains("loadReadStatus(force: true)"),
            "un rechargement non forcé serait refusé par shouldFetchReadStatus " +
            "(la fiche a déjà ses données) — le relais existerait sans rien changer")
    }

    func test_readStatusSpinnerNeverBranchesOnTheRawLoadingFlag() throws {
        let src = try source()

        XCTAssertFalse(src.contains("if isLoadingReadStatus {"),
            "brancher le spinner sur le drapeau brut REMPLACE une fiche déjà remplie " +
            "par un indicateur d'attente à chaque read-status:updated — " +
            "« jamais de spinner sur un cache non vide » (Instant App, Cache-First)")
    }

    // MARK: - La règle elle-même

    func test_showsReadStatusSpinner_coldStart_showsSpinner() {
        XCTAssertTrue(
            MessageViewsReadStatusRules.showsSpinner(isLoading: true, hasExisting: false),
            "démarrage à froid : rien à montrer, le spinner est le bon état")
    }

    func test_showsReadStatusSpinner_liveRefreshOverExistingData_staysOnTheData() {
        XCTAssertFalse(
            MessageViewsReadStatusRules.showsSpinner(isLoading: true, hasExisting: true),
            "revalidation silencieuse : la fiche ouverte garde ses lecteurs à l'écran")
    }

    func test_showsReadStatusSpinner_idle_neverShowsSpinner() {
        XCTAssertFalse(
            MessageViewsReadStatusRules.showsSpinner(isLoading: false, hasExisting: false))
        XCTAssertFalse(
            MessageViewsReadStatusRules.showsSpinner(isLoading: false, hasExisting: true))
    }
}
