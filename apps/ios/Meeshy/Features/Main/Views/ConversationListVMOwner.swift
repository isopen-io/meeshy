import SwiftUI
import Combine
import MeeshySDK

/// Détient un `ConversationListViewModel` sans JAMAIS republier.
///
/// `RootView`/`iPadRootView` doivent POSSÉDER le VM (durée de vie + injection
/// `.environmentObject` vers la liste) mais ne doivent PAS se ré-évaluer à chaque
/// churn du VM — presence refresh, `reloadFromCache` (count=100) répété, unread
/// counts. Or `RootView.body` ne lit AUCUN @Published du VM (seulement des
/// `.environmentObject()` + des accès dans des closures) : l'observation venait
/// uniquement du `@StateObject`, générant des re-render inutiles à l'idle (Instant
/// App Principles : « Zero Unnecessary Re-render »). Ce owner n'a pas de
/// @Published → son `objectWillChange` ne fire jamais → RootView ne re-render
/// jamais à cause de lui. Les vues enfants observent le VM via `@EnvironmentObject`.
@MainActor
final class ConversationListVMOwner: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    let viewModel: ConversationListViewModel

    /// La liste VIVANTE, partagée par tous ses propriétaires. Sur iPad, une fenêtre détachée — ou la racine
    /// qui remplace l'autre au passage compact ↔ regular (Stage Manager, Split View) — créait un second VM
    /// complet : abonnements socket, push et lus doublés, et un GET par push pour une conversation absente de
    /// sa liste vide. Faible : la liste meurt avec son dernier propriétaire.
    private static weak var live: ConversationListViewModel?
    /// #10927 — la réparation au retour du serveur, UNE par liste vivante : deux propriétaires (iPad) ne
    /// relancent pas deux rafraîchissements sur le même front montant du socket.
    private static var liveRepair: AnyCancellable?
    /// #10927 — le chargement lancé dès la session restaurée, et le compte pour lequel il l'a été. Il tient
    /// la liste en vie jusqu'à ce qu'une racine l'adopte : `live` étant faible, elle mourrait avant.
    private static var launch: Launch?

    private struct Launch {
        let viewModel: ConversationListViewModel
        let userId: String
        let load: Task<Void, Never>
    }

    init(
        make: () -> ConversationListViewModel = { ConversationListViewModel() },
        currentUserId: String? = AuthManager.shared.currentUser?.id
    ) {
        if let launch = Self.launch, launch.userId != currentUserId {
            Self.drop(launch)
        }
        viewModel = Self.liveList(make: make)
    }

    private static func liveList(make: () -> ConversationListViewModel) -> ConversationListViewModel {
        if let live { return live }
        let made = make()
        live = made
        liveRepair = made.repairsFailedLoadOnReconnect(MessageSocketManager.shared.$isConnected.eraseToAnyPublisher())
        return made
    }

    /// La liste d'un compte quitté avant qu'une racine l'adopte ne s'affiche jamais au suivant.
    private static func drop(_ stale: Launch) {
        stale.load.cancel()
        if live === stale.viewModel {
            live = nil
            liveRepair = nil
        }
        launch = nil
    }
}

// MARK: - Le lancement (#10927)
//
// Mesuré au simulateur sur staging : la session était restaurée à +1,1 s du lancement, et la liste n'était lue
// qu'au `.task` de la racine, 0,6 à 2,2 s plus tard — le voile tombait sur une liste encore vide. Elle se lit
// désormais dès la session restaurée, et la racine REJOINT ce chargement au lieu d'en relancer un second.

extension ConversationListVMOwner {

    /// Crée la liste vivante et lance sa lecture (cache d'abord) pour `userId`. Sans effet sans compte, ou si
    /// un lancement est déjà en cours.
    static func prewarm(
        userId: String,
        make: () -> ConversationListViewModel = { ConversationListViewModel() }
    ) {
        guard !userId.isEmpty, launch == nil else { return }
        let list = liveList(make: make)
        launch = Launch(viewModel: list, userId: userId, load: Task { @MainActor in await list.loadConversations() })
    }

    /// Le chargement d'une racine ou de la liste au démarrage : celui du lancement s'il vise CETTE liste,
    /// fini ou non ; un chargement ordinaire sinon.
    static func loadAtLaunch(_ viewModel: ConversationListViewModel) async {
        guard let launch, launch.viewModel === viewModel else { return await viewModel.loadConversations() }
        await launch.load.value
    }

    /// La racine a fini de démarrer : les chargements suivants relisent la liste normalement.
    static func endLaunch() {
        launch = nil
    }

    #if DEBUG
    static func resetForTesting() {
        launch?.load.cancel()
        launch = nil
        live = nil
        liveRepair = nil
    }
    #endif
}
