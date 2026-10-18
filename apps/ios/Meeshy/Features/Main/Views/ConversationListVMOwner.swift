import SwiftUI

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

    init(make: () -> ConversationListViewModel = { ConversationListViewModel() }) {
        let shared = Self.live ?? make()
        Self.live = shared
        viewModel = shared
    }
}
