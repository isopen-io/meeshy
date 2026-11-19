import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le réglage GLOBAL de l'émetteur (#18753) : « Montrer à mes Sangs que je suis en appel ». Activé par défaut côté
/// passerelle ; le couper coupe tout le monde, collecte comprise. Le partage par personne vit dans sa fiche.
@MainActor
final class PhoneCallSharingSettingsViewModel: ObservableObject {
    @Published private(set) var sharingEnabled: Bool?
    @Published var notice: String?

    private let service: PhoneCallServiceProviding

    nonisolated deinit {}

    init(service: PhoneCallServiceProviding = PhoneCallService.shared) {
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
            notice = PhoneCallWording.saveFailed
        }
    }
}

struct PhoneCallSharingSettingsSection: View {
    let accentColor: String
    @StateObject private var viewModel = PhoneCallSharingSettingsViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: PhoneCallWording.sectionTitle,
                icon: PhoneCallWording.stateIconName, color: MeeshyColors.tileEmeraldHex
            )
            SettingsCard(tint: MeeshyColors.tileEmeraldHex) {
                SettingsRow(
                    icon: PhoneCallWording.stateIconName,
                    title: PhoneCallWording.globalTitle,
                    subtitle: PhoneCallWording.globalSubtitle,
                    color: MeeshyColors.tileEmeraldHex
                ) {
                    if let enabled = viewModel.sharingEnabled {
                        Toggle("", isOn: Binding(
                            get: { enabled },
                            set: { value in Task { await viewModel.setSharing(value) } }
                        ))
                        .labelsHidden()
                        .tint(Color(hex: accentColor))
                        .accessibilityLabel(PhoneCallWording.globalTitle)
                        .accessibilityIdentifier("phoneCall.share.global")
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
