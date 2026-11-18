import Combine
import Foundation
import MeeshySDK
import MeeshyUI

/// Les deux gestes de la carte d'un lien de fiche — chacun REPREND un chemin existant de l'app (#19519).
@MainActor
protocol ProfileLinkCardActionPerforming {
    /// « Voir la vitrine » : la même voie qu'un lien `/u/<pseudo>` tapé.
    func openProfile(username: String)
    /// « Écrire » : la conversation directe, ouverte ou créée comme depuis l'annuaire.
    func write(to userId: String) async
}

@MainActor
final class ProfileLinkCardViewModel: ObservableObject {
    nonisolated deinit {}

    enum Phase: Equatable {
        case loading
        case card(ProfileLinkCardFace)
        case closed
        case unavailable
    }

    @Published private(set) var phase: Phase

    let handle: String
    private let service: ProfileLinkCardProviding
    private let performer: ProfileLinkCardActionPerforming
    private let prism: [String]
    private var needsRefresh: Bool

    /// Les sources s'injectent toutes : l'hôte (`BubbleProfileLinkCard`) pose le service partagé, les gestes de
    /// l'app et le Prisme du lecteur connecté.
    init(handle: String, service: ProfileLinkCardProviding, performer: ProfileLinkCardActionPerforming,
         prism readerPrism: [String]) {
        self.handle = handle
        self.service = service
        self.performer = performer
        self.prism = readerPrism
        switch service.cached(handle: handle) {
        case .fresh(let resolution, _):
            phase = ProfileLinkCardViewModel.phase(of: resolution, prism: readerPrism)
            needsRefresh = false
        case .stale(let resolution, _):
            phase = ProfileLinkCardViewModel.phase(of: resolution, prism: readerPrism)
            needsRefresh = true
        case .expired, .empty:
            phase = .loading
            needsRefresh = true
        }
    }

    /// Relit la carte une fois : en silence derrière une carte périmée, derrière le squelette sur cache vide.
    func load() async {
        guard needsRefresh else { return }
        needsRefresh = false
        let resolution = await service.refresh(handle: handle)
        let next = Self.phase(of: resolution, prism: prism)
        if next != phase { phase = next }
    }

    func open() {
        guard case .card(let face) = phase else { return }
        performer.openProfile(username: face.username)
    }

    func write() async {
        guard case .card(let face) = phase, face.offersWrite else { return }
        await performer.write(to: face.userId)
    }

    private static func phase(of resolution: ProfileLinkCardResolution, prism: [String]) -> Phase {
        switch resolution {
        case .card(let card): return .card(ProfileLinkCardFace(card: card, prism: prism))
        case .closed: return .closed
        case .unavailable: return .unavailable
        }
    }
}
