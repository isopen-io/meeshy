import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le réglage GLOBAL de l'émetteur (#14147) : partager ma batterie avec mes Proches et mes Sangs. Activé par défaut
/// côté passerelle ; le couper coupe tout le monde, le réglage par personne vit dans sa fiche.
@MainActor
final class BatterySharingSettingsViewModel: ObservableObject {
    @Published private(set) var sharingEnabled: Bool?
    @Published var notice: String?

    private let service: BatteryServiceProviding

    nonisolated deinit {}

    init(service: BatteryServiceProviding = BatteryService.shared) {
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
            notice = String(localized: "battery.settings.saveFailed", defaultValue: "Réglage non enregistré, réessaie", bundle: .main)
        }
    }
}

struct BatterySharingSettingsSection: View {
    let accentColor: String
    let isPhone: Bool
    @StateObject private var viewModel = BatterySharingSettingsViewModel()
    @ObservedObject private var pullInbox: BatteryPullInbox
    private let send: @MainActor (String) async -> Bool

    init(accentColor: String,
         isPhone: Bool = BatteryCenter.shared.reporter.isAvailable,
         pullInbox: BatteryPullInbox = BatteryCenter.shared.pullInbox,
         send: @escaping @MainActor (String) async -> Bool = { id in await BatteryCenter.shared.send(id) }) {
        self.accentColor = accentColor
        self.isPhone = isPhone
        self._pullInbox = ObservedObject(wrappedValue: pullInbox)
        self.send = send
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: String(localized: "battery.settings.section", defaultValue: "Batterie", bundle: .main),
                icon: "battery.75", color: MeeshyColors.tileEmeraldHex
            )
            SettingsCard(tint: MeeshyColors.tileEmeraldHex) {
                SettingsRow(
                    icon: "battery.25",
                    title: BatterySettingsWording.globalTitle,
                    subtitle: isPhone ? BatterySettingsWording.globalSubtitle : BatterySettingsWording.notAPhone,
                    color: MeeshyColors.tileEmeraldHex
                ) {
                    if let enabled = viewModel.sharingEnabled {
                        Toggle("", isOn: Binding(
                            get: { enabled },
                            set: { value in Task { await viewModel.setSharing(value) } }
                        ))
                        .labelsHidden()
                        .tint(Color(hex: accentColor))
                        .accessibilityLabel(BatterySettingsWording.globalTitle)
                        .accessibilityIdentifier("battery.share.global")
                    }
                }
            }
            BatteryPullRequestsCard(inbox: pullInbox, send: send)
        }
        .task { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }
}

enum BatterySettingsWording {
    static var globalTitle: String {
        String(localized: "battery.settings.global", defaultValue: "Partager ma batterie avec mes proches", bundle: .main)
    }
    static var globalSubtitle: String {
        String(localized: "battery.settings.globalSubtitle", defaultValue: "Tes Proches et tes Sangs voient quand elle est basse. Tu règles chaque personne depuis sa fiche.", bundle: .main)
    }
    /// Ce que la plateforme ne sait pas faire se DIT : une tablette ne suit jamais sa batterie.
    static var notAPhone: String {
        String(localized: "battery.settings.notAPhone", defaultValue: "Seul ton téléphone partage sa batterie : cet appareil n'en envoie jamais.", bundle: .main)
    }
}
