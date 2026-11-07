import Foundation
import MeeshySDK
import MeeshyUI

/// « Bloquer ses Bring », sur la fiche d'un lien (#13936, iso `circle-bring-block.tsx`). Le Bring est disponible par
/// défaut dès Ami (D-3) : son réglage par personne est un BLOCAGE, des Brings que JE reçois de cette personne.
///
/// - `GET|PUT /relations/:userId/settings { bringBlocked }`, corps strict.
/// - Optimiste : basculé au geste, rendu à l'état d'avant sur un refus, qui se dit.
/// - L'autre n'en est pas prévenu : il lit seulement « Bring indisponible ».
@MainActor
final class CircleBringBlockViewModel: ObservableObject {

    let userId: String

    @Published private(set) var blocked = false
    @Published private(set) var isSaving = false
    @Published var notice: String?

    private let service: BringProviding

    nonisolated deinit {}

    init(userId: String, service: BringProviding) {
        self.userId = userId
        self.service = service
    }

    func load() async {
        guard let served = try? await service.personSettings(userId: userId) else { return }
        blocked = served.bringBlocked
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
            blocked = try await service.setBringBlocked(userId: userId, blocked: next).bringBlocked
            return true
        } catch {
            blocked = before
            notice = String(localized: "circles.notice.lowerFailed", defaultValue: "La modification n'a pas pu être enregistrée.", bundle: .main)
            HapticFeedback.error()
            return false
        }
    }
}
