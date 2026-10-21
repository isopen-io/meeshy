import Foundation
import SwiftUI
import MeeshySDK

// MARK: - Le choix du fond et de l'accent d'une conversation (#10631, spec §§ 5.4, 10.1)
//
// OPTIMISTE : chaque choix s'applique au toucher (le fond change aussitôt, par
// le relais `ConversationAppearanceChange`), le réseau confirme, un refus
// rétablit l'état d'avant. Le serveur reste l'autorité (possession, pièce de
// cette conversation) ; l'écho `user:preferences-updated` des autres appareils
// passe par le store.

@MainActor
final class ConversationAppearanceViewModel: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var appearance: ConversationAppearance
    @Published var errorMessage: String?

    let conversationId: String
    private let service: PreferenceServiceProviding
    private let photoMemory: ConversationBackgroundPhotoMemory
    private let store: ConversationStore

    init(
        conversationId: String,
        initial: ConversationAppearance?,
        service: PreferenceServiceProviding = PreferenceService.shared,
        photoMemory: ConversationBackgroundPhotoMemory = ConversationBackgroundPhotoMemory(),
        store: ConversationStore = .shared
    ) {
        self.conversationId = conversationId
        self.service = service
        self.photoMemory = photoMemory
        self.store = store
        self.appearance = ConversationAppearanceChange.latest(for: conversationId) ?? initial ?? .default
    }

    // MARK: Choix

    func selectSignature() {
        commit { $0.background = .signature }
    }

    func selectDesign(pack: String, design: String) {
        commit { $0.background = .design(pack: pack, design: design) }
    }

    func selectSolid(color: String) {
        commit { $0.background = .solid(color: color) }
    }

    func selectPhoto(attachmentId: String, photo: ConversationBackgroundPhoto) {
        photoMemory.remember(photo, for: attachmentId)
        let (veil, blur) = currentPhotoSettings ?? (0.3, 0)
        commit { $0.background = .photo(attachmentId: attachmentId, veil: veil, blur: blur) }
    }

    /// Le voile se règle par pas de 0,05 (le contrat serveur refuse les autres valeurs).
    func setPhotoVeil(_ veil: Double) {
        guard case .photo(let id, let current, let blur) = appearance.background else { return }
        let stepped = (min(max(veil, 0), ConversationBackground.photoVeilMax) / ConversationBackground.photoVeilStep).rounded() * ConversationBackground.photoVeilStep
        // Le même cran, à l'arrondi flottant près, n'est pas un nouveau choix : rien ne repart au serveur.
        guard abs(stepped - current) >= ConversationBackground.photoVeilStep / 2 else { return }
        commit { $0.background = .photo(attachmentId: id, veil: stepped, blur: blur) }
    }

    func setPhotoBlur(_ blur: Int) {
        guard case .photo(let id, let veil, _) = appearance.background else { return }
        commit { $0.background = .photo(attachmentId: id, veil: veil, blur: min(max(blur, 0), ConversationBackground.photoBlurMax)) }
    }

    /// `nil` = l'accent calculé de la conversation (Automatique).
    func setAccent(_ key: String?) {
        commit { $0.accent = key }
    }

    func reset() {
        commit { $0 = .default }
    }

    /// L'écho d'un autre appareil (ou un refus d'ailleurs) : adopté sans réécrire au serveur.
    func adopt(_ remote: ConversationAppearance) {
        guard remote != appearance else { return }
        appearance = remote
    }

    var currentPhotoSettings: (veil: Double, blur: Int)? {
        guard case .photo(_, let veil, let blur) = appearance.background else { return nil }
        return (veil, blur)
    }

    // MARK: Écriture optimiste

    private func commit(_ change: (inout ConversationAppearance) -> Void) {
        var next = appearance
        change(&next)
        guard next != appearance else { return }
        let previous = appearance
        errorMessage = nil
        apply(next)
        Task { [service, conversationId] in
            do {
                try await service.updateConversationPreferences(
                    conversationId: conversationId,
                    request: UpdateConversationPreferencesRequest(appearance: next)
                )
            } catch {
                self.rollback(to: previous, failed: next)
            }
        }
    }

    /// Le fil ouvert l'apprend par le relais, la ligne de liste par le store.
    private func apply(_ value: ConversationAppearance) {
        appearance = value
        ConversationAppearanceChange.post(conversationId: conversationId, appearance: value)
        Task { [store, conversationId] in await store.adoptLocalAppearance(value, for: conversationId) }
    }

    /// Un refus rétablit l'état d'AVANT — sauf si un choix plus récent a déjà remplacé celui qui a échoué.
    private func rollback(to previous: ConversationAppearance, failed: ConversationAppearance) {
        guard appearance == failed else { return }
        apply(previous)
        errorMessage = String(localized: "conversation.appearance.error", defaultValue: "Impossible d'enregistrer le fond. Réessayez.", bundle: .main)
    }
}
