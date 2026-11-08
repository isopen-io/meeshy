import Foundation
import MeeshySDK
import MeeshyUI

/// Une préférence de RÉCEPTION posée pour une personne, sur la fiche d'un lien : « Bloquer ses Bring » (#13936, dès Ami)
/// et « Couper son talkie » (#16673, dès Proche), iso `circle-reception-block.tsx`. Ouverte par défaut ; son réglage
/// par personne est un BLOCAGE de ce que JE reçois de cette personne.
///
/// - `GET|PUT /relations/:userId/settings { bringBlocked | talkieBlocked }`, corps strict, un seul champ.
/// - Optimiste : basculé au geste, rendu à l'état d'avant sur un refus, qui se dit.
/// - L'autre n'en est pas prévenu.
@MainActor
final class CircleReceptionBlockViewModel: ObservableObject {

    let userId: String
    let setting: RelationReceptionSetting

    @Published private(set) var blocked = false
    @Published private(set) var isSaving = false
    @Published var notice: String?

    private let service: BringProviding

    nonisolated deinit {}

    init(userId: String, setting: RelationReceptionSetting, service: BringProviding) {
        self.userId = userId
        self.setting = setting
        self.service = service
    }

    func load() async {
        guard let served = try? await service.personSettings(userId: userId) else { return }
        blocked = served.isBlocked(setting)
    }

    /// Instantané -> local -> réseau -> retour arrière.
    @discardableResult
    func setBlocked(_ next: Bool) async -> Bool {
        guard !isSaving, next != blocked else { return false }
        let before = blocked
        blocked = next
        isSaving = true
        defer { isSaving = false }
        do {
            blocked = try await service.setReceptionBlocked(setting, userId: userId, blocked: next).isBlocked(setting)
            return true
        } catch {
            blocked = before
            notice = String(localized: "circles.notice.lowerFailed", defaultValue: "La modification n'a pas pu être enregistrée.", bundle: .main)
            HapticFeedback.error()
            return false
        }
    }
}
