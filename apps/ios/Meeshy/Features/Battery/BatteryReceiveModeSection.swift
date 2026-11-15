import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que JE reçois de la batterie d'une personne (#14147) : tout en push, le critique seulement, la SyncPill seule,
/// ou rien. Réglage par personne, servi par la passerelle ; sans lien d'au moins Proche, elle refuse et rien ne
/// s'affiche.
@MainActor
final class BatteryReceiveModeViewModel: ObservableObject {
    let userId: String
    @Published private(set) var settings: BatteryPersonSettings?
    @Published var notice: String?

    private let service: BatteryServiceProviding

    nonisolated deinit {}

    init(userId: String, service: BatteryServiceProviding = BatteryService.shared) {
        self.userId = userId
        self.service = service
    }

    func load() async {
        settings = try? await service.personSettings(userId: userId)
    }

    /// Posé tout de suite, rendu à l'échec.
    func setReceive(_ mode: BatteryReceiveMode) async {
        guard let current = settings, current.receive != mode,
              let update = BatteryPersonSettingsUpdate(receive: mode) else { return }
        settings = BatteryPersonSettings(userId: current.userId, isShared: current.isShared, receive: mode)
        do {
            settings = try await service.updatePersonSettings(userId: userId, update)
        } catch {
            settings = current
            notice = String(localized: "battery.settings.saveFailed", defaultValue: "Réglage non enregistré, réessaie", bundle: .main)
        }
    }
}

struct BatteryReceiveModeSection: View {
    @StateObject private var viewModel: BatteryReceiveModeViewModel
    let tint: String

    init(userId: String, tint: String) {
        _viewModel = StateObject(wrappedValue: BatteryReceiveModeViewModel(userId: userId))
        self.tint = tint
    }

    var body: some View {
        Group {
            if let settings = viewModel.settings {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    Picker(selection: Binding(
                        get: { settings.receive },
                        set: { mode in Task { await viewModel.setReceive(mode) } }
                    )) {
                        ForEach(BatteryReceiveMode.allCases, id: \.self) { mode in
                            Text(BatteryReceiveModeWording.title(mode)).tag(mode)
                        }
                    } label: {
                        Label(BatteryReceiveModeWording.sectionTitle, systemImage: "battery.25")
                    }
                    .pickerStyle(.menu)
                    .tint(Color(hex: tint))
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .accessibilityIdentifier("battery.receive.mode")
                    Text(BatteryReceiveModeWording.explain(settings.receive))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.smPlus)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.lg).fill(Color(hex: tint).opacity(MeeshyOpacity.subtle)))
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

enum BatteryReceiveModeWording {
    static var sectionTitle: String {
        String(localized: "battery.receive.title", defaultValue: "Sa batterie", bundle: .main)
    }

    static func title(_ mode: BatteryReceiveMode) -> String {
        switch mode {
        case .all: return String(localized: "battery.receive.all", defaultValue: "Tout en notification", bundle: .main)
        case .critical: return String(localized: "battery.receive.critical", defaultValue: "Le critique seulement", bundle: .main)
        case .pill: return String(localized: "battery.receive.pill", defaultValue: "Dans l'app seulement", bundle: .main)
        case .none: return String(localized: "battery.receive.none", defaultValue: "Rien", bundle: .main)
        }
    }

    static func explain(_ mode: BatteryReceiveMode) -> String {
        switch mode {
        case .all: return String(localized: "battery.receive.allExplain", defaultValue: "Chaque palier arrive en notification ; app ouverte, la pastille l'annonce.", bundle: .main)
        case .critical: return String(localized: "battery.receive.criticalExplain", defaultValue: "Seuls la zone critique et l'extinction probable notifient ; le reste passe dans la pastille.", bundle: .main)
        case .pill: return String(localized: "battery.receive.pillExplain", defaultValue: "Aucune notification : la pastille l'annonce quand l'app est ouverte.", bundle: .main)
        case .none: return String(localized: "battery.receive.noneExplain", defaultValue: "Ni annonce, ni icône d'état.", bundle: .main)
        }
    }
}
