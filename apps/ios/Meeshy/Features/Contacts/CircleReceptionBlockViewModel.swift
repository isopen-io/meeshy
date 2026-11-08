import Foundation
import MeeshySDK
import MeeshyUI

/// UN interrupteur de la fiche d'un lien, posé pour CETTE personne et écrit seul (`PUT /relations/:userId/settings`,
/// corps strict) :
/// - une préférence de RÉCEPTION, ouverte par défaut, dont l'interrupteur allumé est un BLOCAGE : « Bloquer ses
///   Bring » (#13936, dès Ami), « Couper son talkie » (#16673, dès Proche) ;
/// - un PARTAGE de mon activité, refusé par défaut, dont l'interrupteur allumé est un ACCORD : « Partager ce que
///   j'écoute » (#16803, dès Proche).
nonisolated enum CirclePersonSwitch: Equatable, Sendable {
    case reception(RelationReceptionSetting)
    case share(RelationShareGrant)

    func isOn(in settings: RelationPersonSettings) -> Bool {
        switch self {
        case .reception(let setting): return settings.isBlocked(setting)
        case .share(let grant): return settings.isGranted(grant)
        }
    }
}

/// L'état d'un `CirclePersonSwitch`, iso `circle-reception-block.tsx`.
///
/// - Optimiste : basculé au geste, rendu à l'état d'avant sur un refus, qui se dit.
/// - L'autre n'en est pas prévenu.
/// - Un partage accordé déclenche `afterGrant` (l'émetteur s'allume, l'autorisation du système est demandée) ; la
///   phrase qu'il rend, s'il en rend une, se dit.
@MainActor
final class CircleReceptionBlockViewModel: ObservableObject {

    let userId: String
    let personSwitch: CirclePersonSwitch

    @Published private(set) var isOn = false
    @Published private(set) var isSaving = false
    @Published var notice: String?

    private let service: BringProviding
    private let afterGrant: @MainActor () async -> String?

    nonisolated deinit {}

    init(
        userId: String,
        personSwitch: CirclePersonSwitch,
        service: BringProviding,
        afterGrant: @escaping @MainActor () async -> String? = { nil }
    ) {
        self.userId = userId
        self.personSwitch = personSwitch
        self.service = service
        self.afterGrant = afterGrant
    }

    convenience init(userId: String, setting: RelationReceptionSetting, service: BringProviding) {
        self.init(userId: userId, personSwitch: .reception(setting), service: service)
    }

    func load() async {
        guard let served = try? await service.personSettings(userId: userId) else { return }
        isOn = personSwitch.isOn(in: served)
    }

    /// Instantané -> local -> réseau -> retour arrière.
    @discardableResult
    func setOn(_ next: Bool) async -> Bool {
        guard !isSaving, next != isOn else { return false }
        let before = isOn
        isOn = next
        isSaving = true
        defer { isSaving = false }
        do {
            isOn = personSwitch.isOn(in: try await write(next))
        } catch {
            isOn = before
            notice = String(localized: "circles.notice.lowerFailed", defaultValue: "La modification n'a pas pu être enregistrée.", bundle: .main)
            HapticFeedback.error()
            return false
        }
        if case .share = personSwitch, isOn, let said = await afterGrant() {
            notice = said
        }
        return true
    }

    private func write(_ next: Bool) async throws -> RelationPersonSettings {
        switch personSwitch {
        case .reception(let setting):
            return try await service.setReceptionBlocked(setting, userId: userId, blocked: next)
        case .share(let grant):
            return try await service.setShareGranted(grant, userId: userId, granted: next)
        }
    }
}
