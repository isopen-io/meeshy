import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'interrupteur ACTIF d'un réglage par personne, sur la fiche d'un lien : « Bloquer ses Bring » (#13936), « Couper
/// son talkie » (#16673), « Ce que j'écoute » (#16803). Les autres réglages restent derrière leur drapeau tant
/// que leur lot n'est pas livré.
struct CircleReceptionBlockToggle: View {
    @StateObject private var viewModel: CircleReceptionBlockViewModel
    let title: String
    let detail: String?
    let identifier: String

    init(userId: String, personSwitch: CirclePersonSwitch, title: String, detail: String? = nil, identifier: String) {
        _viewModel = StateObject(wrappedValue: CircleReceptionBlockViewModel(userId: userId, personSwitch: personSwitch))
        self.title = title
        self.detail = detail
        self.identifier = identifier
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            Toggle(title, isOn: Binding(
                get: { viewModel.isOn },
                set: { next in Task { await viewModel.setOn(next) } }
            ))
            .disabled(viewModel.isSaving)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .accessibilityHint(detail ?? "")
            .accessibilityIdentifier(identifier)
            if let detail {
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
        }
        .task(id: viewModel.userId) { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }
}
