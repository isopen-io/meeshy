import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'interrupteur ACTIF « Bloquer ses Bring » de la fiche d'un lien (#13936). Les trois autres réglages restent derrière
/// leur drapeau tant que leur lot n'est pas livré.
struct CircleBringBlockToggle: View {
    @StateObject private var viewModel: CircleBringBlockViewModel
    let title: String

    init(userId: String, title: String) {
        _viewModel = StateObject(wrappedValue: CircleBringBlockViewModel(userId: userId))
        self.title = title
    }

    var body: some View {
        Toggle(title, isOn: Binding(
            get: { viewModel.blocked },
            set: { next in Task { await viewModel.setBlocked(next) } }
        ))
        .disabled(viewModel.isSaving)
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .task(id: viewModel.userId) { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
        .accessibilityIdentifier("circles.settings.blockBring")
    }
}
