import Combine
import Foundation
import MeeshySDK

/// Lecture du plancher de version applicatif servi par le gateway
/// (`GET /app/min-version`, route PUBLIQUE — la porte doit pouvoir se montrer
/// AVANT tout login).
@MainActor
protocol AppVersionFloorProviding {
    func minVersion() async throws -> String
}

@MainActor
final class AppVersionFloorService: AppVersionFloorProviding {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    func minVersion() async throws -> String {
        let response: APIResponse<Floor> = try await api.request(
            AppEndpoint.minVersion,
            method: "GET",
            body: nil,
            queryItems: nil
        )
        return response.data.minVersion ?? ""
    }

    private struct Floor: Decodable {
        let minVersion: String?
    }
}

/// C4b — l'état « ce binaire n'a plus le droit de parler au serveur ».
///
/// Deux entrées, une seule sortie d'état :
/// 1. **le 426 vécu** — `APIClient` poste `.meeshyUpgradeRequired` dès qu'une
///    requête se fait refuser pour cause de binaire périmé ;
/// 2. **le plancher lu au démarrage** — sans lui, un binaire périmé qui ne fait
///    que LIRE ne rencontre jamais de 426 et se croit à jour indéfiniment.
///
/// La seconde entrée emprunte la MÊME notification que la première : il n'y a
/// qu'un chemin vers l'état bloqué, donc qu'un chemin à éprouver.
///
/// Le bootstrap est **best-effort et silencieux**. Un avion, un tunnel ou un
/// gateway en redéploiement ne sont pas des raisons de barrer une app qui, par
/// contrat Instant App, fonctionne hors ligne en lecture.
@MainActor
final class UpgradeGateController: ObservableObject {

    @Published private(set) var requirement: UpgradeRequirement?

    var isBlocked: Bool { requirement != nil }

    private let floor: AppVersionFloorProviding
    private let currentVersion: String
    private let center: NotificationCenter
    /// Combine plutôt que des jetons `NotificationCenter` : ceux-ci exigeraient
    /// un `deinit` qui touche l'état isolé, ce que Swift 6 refuse. Même
    /// arbitrage que `ImpressionBatcher`.
    private var cancellables = Set<AnyCancellable>()

    /// `nonisolated` — pas un choix de style : AVANT ce correctif, cette classe
    /// n'écrivait AUCUNE `deinit` (implicite, synthétisée par le compilateur) ;
    /// c'est cette forme précise — `@MainActor` + `Set<AnyCancellable>` + zéro
    /// `deinit` écrite — qui double-libérait sur le simulateur iOS 26.1 dès
    /// qu'elle s'exécutait hors de tout contexte de tâche (`malloc: pointer
    /// being freed was not allocated`, signal abrt). Mesuré sur
    /// `test_requirement_auDemarrage_estNil` — le seul test SYNCHRONE de la
    /// suite, donc le seul sans tâche courante ; les 6 tests `async` voisins,
    /// eux, restaient verts ; iOS 18.2 ne montrait rien. Rien d'isolé n'est
    /// touché ici : `cancellables` se démonte tout seul.
    ///
    /// Cette observation ne s'étend PAS à toute classe `@MainActor` : une
    /// `deinit` ÉCRITE explicitement (même sans `nonisolated`) reste
    /// non-isolée par défaut — `GlobalSearchViewModel.swift:146`,
    /// `MessageListViewController.swift:380` et `PresenceManager.swift:211`
    /// en dépendent et n'ont montré aucune erreur malloc sur ce même runtime
    /// (`GlobalSearchViewModelTests`, tests synchrones inclus, 28/28,
    /// malloc-errors=0, mesuré 2026-08-25). La vingtaine de classes
    /// `@MainActor` restantes qui portent `Set<AnyCancellable>` SANS aucune
    /// `deinit` écrite (`grep -L deinit` sur les sites `Set<AnyCancellable>`)
    /// partagent la forme qui a crashé ici et restent à auditer — suivi noté
    /// dans `wave1/planche-deltas.md`, pas encore fait.
    nonisolated deinit {}

    init(
        floor: AppVersionFloorProviding = AppVersionFloorService(),
        currentVersion: String = AppVersionHeader.value(),
        center: NotificationCenter = .default
    ) {
        self.floor = floor
        self.currentVersion = currentVersion
        self.center = center

        center.publisher(for: .meeshyUpgradeRequired)
            .sink { [weak self] notification in
                guard let requirement = UpgradeRequirement(notification: notification) else { return }
                Task { @MainActor in self?.requirement = requirement }
            }
            .store(in: &cancellables)
    }

    /// Amorce de la porte, appelée depuis le `.task` des DEUX racines.
    func checkFloor() async {
        guard let floorValue = try? await floor.minVersion() else { return }
        guard AppVersionHeader.isBelow(currentVersion, floor: floorValue) else { return }
        UpgradeRequirement(minVersion: floorValue, storeUrl: nil).post(via: center)
    }
}
