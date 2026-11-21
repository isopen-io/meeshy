import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le réglage GLOBAL de la personne (#18738) : après combien d'heures sans activité son téléphone demande « Tout va
/// bien ? » (6, 12 ou 24 h, 12 par défaut), ou la coupure pour tous. Le partage par personne vit dans sa fiche.
@MainActor
final class InactivityCheckSettingsViewModel: ObservableObject {
    @Published private(set) var delay: InactivityCheckDelay?
    @Published var notice: String?

    private let service: InactivityCheckServiceProviding

    nonisolated deinit {}

    init(service: InactivityCheckServiceProviding = InactivityCheckService.shared) {
        self.service = service
    }

    func load() async {
        guard let settings = try? await service.settings() else { return }
        delay = settings.delay
    }

    /// Posé tout de suite, rendu à l'échec.
    func setDelay(_ next: InactivityCheckDelay) async {
        let previous = delay
        delay = next
        do {
            delay = try await service.updateSettings(delay: next).delay
        } catch {
            delay = previous
            notice = InactivityCheckWording.saveFailed
        }
    }
}

struct InactivityCheckSettingsSection: View {
    let accentColor: String
    @StateObject private var viewModel = InactivityCheckSettingsViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: InactivityCheckWording.sectionTitle,
                icon: "hand.wave.fill", color: MeeshyColors.tileEmeraldHex
            )
            SettingsCard(tint: MeeshyColors.tileEmeraldHex) {
                SettingsRow(
                    icon: "hand.wave.fill",
                    title: InactivityCheckWording.delayTitle,
                    subtitle: InactivityCheckWording.delaySubtitle,
                    color: MeeshyColors.tileEmeraldHex
                ) {
                    if let delay = viewModel.delay {
                        Picker(InactivityCheckWording.delayTitle, selection: Binding(
                            get: { delay },
                            set: { value in Task { await viewModel.setDelay(value) } }
                        )) {
                            ForEach(InactivityCheckDelay.allCases, id: \.self) { option in
                                Text(InactivityCheckWording.delayLabel(option)).tag(option)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                        .tint(Color(hex: accentColor))
                        .accessibilityIdentifier("inactivity.settings.delay")
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
