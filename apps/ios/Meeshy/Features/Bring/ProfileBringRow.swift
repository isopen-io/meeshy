import SwiftUI
import MeeshySDK
import MeeshyUI

/// La ligne du Bring sous le cercle d'une fiche (#13936). Rien tant que la passerelle ne l'ouvre pas.
struct ProfileBringRow: View {
    @StateObject private var viewModel: ProfileBringViewModel
    let displayName: String
    @State private var confirming = false
    private var theme: ThemeManager { ThemeManager.shared }

    init(userId: String, displayName: String) {
        _viewModel = StateObject(wrappedValue: ProfileBringViewModel(userId: userId))
        self.displayName = displayName
    }

    var body: some View {
        Group {
            if let availability = viewModel.availability, availability.available {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    Text(ProfileBringWording.explain)
                        .font(.footnote)
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    content(availability)
                }
                .padding(MeeshySpacing.md)
                .background(theme.error.opacity(MeeshyOpacity.subtle))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
            } else {
                Color.clear.frame(height: 0)
            }
        }
        .task(id: viewModel.userId) { await viewModel.load() }
        .confirmationDialog(
            ProfileBringWording.confirmTitle(name: displayName),
            isPresented: $confirming,
            titleVisibility: .visible
        ) {
            Button(ProfileBringWording.confirmSend, role: .destructive) {
                Task { await viewModel.send(name: displayName) }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: {
            Text(ProfileBringWording.confirmBody(name: displayName))
        }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }

    @ViewBuilder
    private func content(_ availability: BringAvailability) -> some View {
        if viewModel.ringing != nil {
            HStack(spacing: MeeshySpacing.md) {
                Text("🔔 " + ProfileBringWording.ringing(name: displayName))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.textPrimary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityAddTraits(.updatesFrequently)
                Button(ProfileBringWording.cancel) {
                    HapticFeedback.medium()
                    viewModel.cancel()
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(theme.error)
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .accessibilityIdentifier("bring.cancel")
            }
        } else if availability.isExhausted {
            Text(ProfileBringWording.quota(name: displayName))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.textPrimary)
        } else {
            HStack(spacing: MeeshySpacing.md) {
                Text(ProfileBringWording.remaining(availability))
                    .font(.footnote)
                    .foregroundStyle(theme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button {
                    HapticFeedback.medium()
                    confirming = true
                } label: {
                    Text("🔔 " + ProfileBringWording.action)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .frame(minHeight: MeeshyControlSize.tapTarget)
                        .background(Capsule().fill(theme.error))
                }
                .buttonStyle(.plain)
                .disabled(viewModel.isSending)
                .opacity(viewModel.isSending ? 0.6 : 1)
                .accessibilityLabel(ProfileBringWording.confirmTitle(name: displayName))
                .accessibilityIdentifier("bring.send")
            }
        }
    }
}
