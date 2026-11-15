import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que JE reçois de la batterie d'une personne (#14147) : tout en push, le critique seulement, la SyncPill seule,
/// ou rien. Réglage par personne, servi par la passerelle. Il n'existe qu'à partir de Proche (`device.battery`), par
/// le lien ou par le verdict servi (l'équipe, #16623) : la route des réglages répond à n'importe qui, c'est donc le
/// niveau lu ici qui décide si la section s'affiche — sous Proche, rien, comme le web et Android.
@MainActor
final class BatteryReceiveModeViewModel: ObservableObject {
    let userId: String
    @Published private(set) var settings: BatteryPersonSettings?
    @Published var notice: String?

    private let service: BatteryServiceProviding
    private let relations: RelationsProviding

    nonisolated deinit {}

    init(
        userId: String,
        service: BatteryServiceProviding = BatteryService.shared,
        relations: RelationsProviding = RelationsService.shared
    ) {
        self.userId = userId
        self.service = service
        self.relations = relations
    }

    func load() async {
        guard await offersBattery() else {
            settings = nil
            return
        }
        settings = try? await service.personSettings(userId: userId)
    }

    private func offersBattery() async -> Bool {
        guard let link = try? await relations.link(userId: userId),
              link.userId.lowercased() == userId.lowercased() else { return false }
        return max(link.effectiveLevel, link.toolLevel) >= RelationFeature.deviceBattery.minimumLevel
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
        case .all: return String(localized: "battery.receive.allExplain", defaultValue: "Le critique, l'extinction, le rallumage et la recharge arrivent en notification ; les paliers bas s'annoncent dans la pastille pendant la conversation.", bundle: .main)
        case .critical: return String(localized: "battery.receive.criticalExplain", defaultValue: "Seule l'entrée en zone critique notifie ; le reste passe dans la pastille, app ouverte.", bundle: .main)
        case .pill: return String(localized: "battery.receive.pillExplain", defaultValue: "Aucune notification : la pastille l'annonce quand l'app est ouverte.", bundle: .main)
        case .none: return String(localized: "battery.receive.noneExplain", defaultValue: "Ni annonce, ni icône d'état.", bundle: .main)
        }
    }
}
