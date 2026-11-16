import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le réglage GLOBAL de l'émetteur (#18737) : prévenir mes Proches si mon téléphone est injoignable. Activé par défaut
/// côté passerelle ; le couper coupe tout le monde (le fantôme), le réglage par personne vit dans sa fiche.
@MainActor
final class PhoneReachabilitySharingSettingsViewModel: ObservableObject {
    @Published private(set) var sharingEnabled: Bool?
    @Published var notice: String?

    private let service: PhoneReachabilityServiceProviding

    nonisolated deinit {}

    init(service: PhoneReachabilityServiceProviding = PhoneReachabilityService.shared) {
        self.service = service
    }

    func load() async {
        guard let settings = try? await service.emitterSettings() else { return }
        sharingEnabled = settings.sharingEnabled
    }

    /// Posé tout de suite, rendu à l'échec.
    func setSharing(_ enabled: Bool) async {
        let previous = sharingEnabled
        sharingEnabled = enabled
        do {
            sharingEnabled = try await service.updateEmitterSettings(sharingEnabled: enabled).sharingEnabled
        } catch {
            sharingEnabled = previous
            notice = PhoneReachabilitySettingsWording.saveFailed
        }
    }
}

struct PhoneReachabilitySharingSettingsSection: View {
    let accentColor: String
    @StateObject private var viewModel = PhoneReachabilitySharingSettingsViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: PhoneReachabilitySettingsWording.sectionTitle,
                icon: "iphone.slash", color: MeeshyColors.tileEmeraldHex
            )
            SettingsCard(tint: MeeshyColors.tileEmeraldHex) {
                SettingsRow(
                    icon: "iphone.slash",
                    title: PhoneReachabilitySettingsWording.globalTitle,
                    subtitle: PhoneReachabilitySettingsWording.globalSubtitle,
                    color: MeeshyColors.tileEmeraldHex
                ) {
                    if let enabled = viewModel.sharingEnabled {
                        Toggle("", isOn: Binding(
                            get: { enabled },
                            set: { value in Task { await viewModel.setSharing(value) } }
                        ))
                        .labelsHidden()
                        .tint(Color(hex: accentColor))
                        .accessibilityLabel(PhoneReachabilitySettingsWording.globalTitle)
                        .accessibilityIdentifier("phoneReachability.share.global")
                    }
                }
            }
        }
        .task { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }
}
