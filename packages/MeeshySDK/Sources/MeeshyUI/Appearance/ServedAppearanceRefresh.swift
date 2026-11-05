import Combine
import Foundation
import MeeshySDK

// MARK: - Repeindre quand un contrat servi arrive (#16264)

/// **L'écran qui le possède se repeint dès qu'un contrat d'apparence servi arrive** : les
/// résolveurs lisent le magasin sans attendre, ce relais leur redonne la main une fois le
/// contrat sur l'appareil. À poser sur un ÉCRAN (fiche de profil, fil, sélecteur), jamais sur
/// une cellule de liste.
@MainActor
public final class ServedAppearanceRefresh: ObservableObject {
    nonisolated deinit {}

    /// Le magasin d'apparence servie de l'appareil : celui que les écrans du SDK lisent quand on ne leur en donne pas.
    nonisolated public static var store: any ServedAppearanceProviding { ServedAppearanceStore.shared }

    @Published public private(set) var revision = 0

    private let served: any ServedAppearanceProviding
    private var subscription: AnyCancellable?

    public init(served: any ServedAppearanceProviding = ServedAppearanceStore.shared) {
        self.served = served
        subscription = served.changes
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in MainActor.assumeIsolated { self?.revision += 1 } }
    }

    /// Charge les contrats que ce décor désigne et que l'appareil n'a pas encore.
    public func load(decor: ServedProfileDecor?) async {
        let missing = ProfileDecorResolver.missingContracts(decor, served: served)
        let served = self.served
        await withTaskGroup(of: Void.self) { group in
            for src in missing {
                group.addTask { await served.load(src: src) }
            }
        }
    }
}
