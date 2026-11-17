import Foundation
import Combine
import UIKit
import MeeshySDK

// MARK: - L'anneau des actes du jour, nourri (#17768)
//
// MIROIR de `useActsRing` (`apps/web/src/lib/view/use-acts-ring.ts`). L'anneau autour du bouton du menu se lit dans
// le CACHE du bloc `game`, sous la clé que le bandeau du joueur, Progression et le profil tiennent à jour
// (`EngagementPlayerBannerSource.cached()`). AUCUNE requête ne part pour lui : il relit le cache quand quelqu'un
// vient de l'écrire (`engagementSnapshotPersisted`) et au retour de l'app au premier plan.
//
// « Jeu masqué » : la loi rend `nil` — et le magasin ne relit rien tant que le jeu est masqué.
//
// La MÊME lecture sert le point du barreau « Ma Légende » (#18165) : l'Offrande prête et la Flamme en danger, lues par
// `GameAttention` (#17796) dans le même bloc. Le magasin du bandeau ne se revalide que pendant son ouverture ; celui-ci
// suit chaque écriture du cache, donc le point reste juste sur tout écran à menus.

@MainActor
final class MenuActsRingStore: ObservableObject {
    nonisolated deinit {}

    /// Les actes du jour lus dans le dernier bloc connu, MÊME périmé — `nil` sans bloc ou sans acte ouvert.
    @Published private(set) var ring: GameActsRing?
    /// Ce que le jeu signale au barreau « Ma Légende » — `.none` sans bloc, ou sous « Jeu masqué ».
    @Published private(set) var attention: GameAttention = .none

    private let source: PlayerBannerSourcing
    private var subscriptions = Set<AnyCancellable>()
    private var subscribed = false
    /// La relecture en cours : une nouvelle écriture du cache la remplace, jamais deux lectures en parallèle.
    private var pendingRead: Task<Void, Never>?

    init(source: PlayerBannerSourcing = EngagementPlayerBannerSource()) {
        self.source = source
    }

    /// Lit le cache, puis suit ses écritures. Idempotent : les abonnements ne se posent qu'une fois.
    func activate(hidden: Bool) async {
        guard !hidden else {
            ring = nil
            attention = .none
            return
        }
        subscribeOnce()
        await readCache()
    }

    /// Le dernier bloc connu ; un cache vide ne retire rien de ce qui est montré.
    func readCache() async {
        guard let game = await source.cached() else { return }
        let next = GameActsRing.of(game, hidden: false)
        if next != ring { ring = next }
        let signaled = GameAttention.of(game, hidden: false)
        if signaled != attention { attention = signaled }
    }

    /// Une écriture du cache vient d'être annoncée : relire, en remplaçant la relecture précédente.
    private func scheduleRead() {
        pendingRead?.cancel()
        pendingRead = Task { [weak self] in await self?.readCache() }
    }

    private func subscribeOnce() {
        guard !subscribed else { return }
        subscribed = true
        // Le saut vers le fil principal PRÉCÈDE le sink : sa fermeture est isolée au MainActor, et le runtime vérifie
        // l'exécuteur à son entrée (cf. `AgeGate`).
        NotificationCenter.default.publisher(for: .engagementSnapshotPersisted)
            .merge(with: NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification))
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.scheduleRead() }
            .store(in: &subscriptions)
    }
}
