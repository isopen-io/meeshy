import Foundation
import Combine
import MeeshySDK

/// « Voir comme » (#18869) : ma Vitrine au cercle choisi.
///
/// **Jamais de spinner** : chaque cercle se peint aussitôt depuis la loi (`VitrinePreview`, projection de
/// `relation-access`), puis se corrige quand le serveur sert la vue de CE cercle (`?as=`). Ce que le serveur a servi
/// se garde par cercle pour la session de l'aperçu : revenir sur un cran déjà vu le peint servi, et le revalide en
/// silence. Une réponse arrivée après qu'on a changé de cran ne repeint jamais le cran courant.
@MainActor
final class VitrineSeenAsViewModel: ObservableObject {

    @Published private(set) var preview: VitrinePreview

    private let handle: String
    private let ownerRole: PlatformRole?
    private let service: ProfileSeenAsProviding
    private var served: [RelationLevel: PublicProfile] = [:]
    private var revalidation: Task<Void, Never>?

    init(handle: String, ownerRole: PlatformRole?, initial: RelationLevel = .public, service: ProfileSeenAsProviding) {
        self.handle = handle
        self.ownerRole = ownerRole
        self.service = service
        self.preview = VitrinePreview.make(level: initial, served: nil, ownerRole: ownerRole)
    }

    nonisolated deinit {
        revalidation?.cancel()
    }

    var level: RelationLevel { preview.level }

    func start() {
        select(preview.level)
    }

    func select(_ level: RelationLevel) {
        preview = VitrinePreview.make(level: level, served: served[level], ownerRole: ownerRole)
        revalidate(level)
    }

    private func revalidate(_ level: RelationLevel) {
        revalidation?.cancel()
        guard !handle.isEmpty else { return }
        let service = self.service
        let handle = self.handle
        revalidation = Task { [weak self] in
            guard let profile = try? await service.vitrine(handle: handle, seenAs: level), !Task.isCancelled else { return }
            self?.apply(profile, for: level)
        }
    }

    private func apply(_ profile: PublicProfile, for level: RelationLevel) {
        guard profile.viewAs == level else { return }
        served[level] = profile
        guard preview.level == level else { return }
        preview = VitrinePreview.make(level: level, served: profile, ownerRole: ownerRole)
    }
}
