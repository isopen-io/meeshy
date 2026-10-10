import MeeshySDK
import MeeshyUI
import SwiftUI

// MARK: - La couche « traduction sur l'appareil » de la conversation (#9899)
//
// Une seule vue, posée en ARRIÈRE-PLAN du fond de la conversation : elle ne
// peint rien, ne prend aucun toucher et n'existe pas pour VoiceOver. Elle porte
// deux choses qui doivent vivre aussi longtemps que l'écran :
//
// - le coordinateur (`DeviceTranslationCoordinator`), qui traduit et partage ;
// - l'hôte du moteur (`AppleTranslationHost`, iOS 18+), la vue de 1 pt à qui le
//   système donne ses sessions de traduction.
//
// Le branchement est un `ViewModifier` et une vue NOMINALE, jamais une chaîne de
// modificateurs sur `ConversationView.body` : la garde de profondeur de type
// (`ConversationViewBodyTypeDepthTests`) compte chaque niveau, et celui-ci n'en
// coûte qu'un.
//
// Absente quand elle n'a pas de sens : aperçu de notification (`previewMode`) et
// session anonyme (jeton de session, pas de compte — la passerelle ne partage
// qu'entre membres authentifiés).

extension View {

    /// Monte la traduction sur l'appareil pour la conversation de `viewModel`.
    /// `isEnabled == false` arrête ce qui tournait et ne monte rien d'actif.
    func deviceTranslationLayer(
        viewModel: ConversationViewModel,
        isEnabled: Bool,
        encryptionMode: String?
    ) -> some View {
        modifier(
            DeviceTranslationLayerModifier(
                viewModel: viewModel, isEnabled: isEnabled, encryptionMode: encryptionMode
            )
        )
    }
}

private struct DeviceTranslationLayerModifier: ViewModifier {
    let viewModel: ConversationViewModel
    let isEnabled: Bool
    let encryptionMode: String?

    func body(content: Content) -> some View {
        content.background {
            ConversationDeviceTranslationLayer(
                viewModel: viewModel, isEnabled: isEnabled, encryptionMode: encryptionMode
            )
        }
    }
}

struct ConversationDeviceTranslationLayer: View {
    let viewModel: ConversationViewModel
    let isEnabled: Bool
    let encryptionMode: String?

    @StateObject private var coordinator = DeviceTranslationCoordinator()

    var body: some View {
        DeviceTranslationEngineHost(engine: coordinator.engine)
            .onAppear { engage() }
            .onDisappear { coordinator.stop() }
            .adaptiveOnChange(of: isEnabled) { _, _ in engage() }
            .adaptiveOnChange(of: encryptionMode) { _, newMode in
                coordinator.update(encryptionMode: newMode)
            }
    }

    private func engage() {
        guard isEnabled else {
            coordinator.stop()
            return
        }
        coordinator.start(source: viewModel, encryptionMode: encryptionMode)
    }
}

/// Monte la vue qui sert le moteur de l'appareil, quand ce moteur en demande une.
/// Sous iOS 16 et 17 il n'y a pas de moteur (`UnavailableDeviceTranslationEngine`) :
/// rien n'est monté, et la conversation reçoit encore les traductions partagées.
private struct DeviceTranslationEngineHost: View {
    let engine: any DeviceTranslationEngineProviding

    var body: some View {
        if #available(iOS 18.0, *) {
            AppleEngineHostBridge(engine: engine)
        }
    }
}

@available(iOS 18.0, *)
private struct AppleEngineHostBridge: View {
    let engine: any DeviceTranslationEngineProviding

    var body: some View {
        if let apple = engine as? AppleTranslationEngine {
            AppleTranslationHost(engine: apple)
        }
    }
}
