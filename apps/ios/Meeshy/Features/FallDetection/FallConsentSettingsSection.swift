import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'ACCORD EXPLICITE de la chute détectée (#18748, art. 9 RGPD) : l'interrupteur n'est JAMAIS coché par défaut, le
/// cocher ouvre le texte d'accord (ce qui part, à qui, combien de temps, ce que ce n'est pas, ses limites, comment
/// retirer), et seul « J'accepte » enregistre l'accord sur la version lue. L'autorisation Santé n'est demandée qu'APRÈS ;
/// si elle échoue, l'accord est RETIRÉ côté serveur et l'interrupteur revient à « non » — l'interface ne promet jamais
/// une détection qui ne tourne pas. Accord servi mais observateur bloqué : « Détection inactive » reste affiché. Le
/// décocher retire l'accord : la collecte s'arrête et l'alerte en cours s'efface chez les Sangs ; un retrait en échec
/// rend l'accord ET relance l'observateur.
@MainActor
final class FallConsentSettingsViewModel: ObservableObject {
    @Published private(set) var settings: FallConsentSettings?
    @Published var isConsentSheetPresented = false
    @Published var notice: String?
    @Published private(set) var isObserverBlocked = false

    private let service: FallDetectionServiceProviding
    private let enableObserver: @MainActor () async -> Bool
    private let stopObserver: @MainActor () -> Void
    private let resumeObserver: @MainActor () async -> Void
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        service: FallDetectionServiceProviding = FallDetectionService.shared,
        enableObserver: @escaping @MainActor () async -> Bool = { await FallDetectionCenter.shared.enableAfterConsent() },
        stopObserver: @escaping @MainActor () -> Void = { FallDetectionCenter.shared.stopObserving() },
        resumeObserver: @escaping @MainActor () async -> Void = { await FallDetectionCenter.shared.resumeIfConsented() },
        observerBlocked: AnyPublisher<Bool, Never> = FallDetectionCenter.shared.$isDetectionBlocked.eraseToAnyPublisher()
    ) {
        self.service = service
        self.enableObserver = enableObserver
        self.stopObserver = stopObserver
        self.resumeObserver = resumeObserver
        observerBlocked
            .removeDuplicates()
            .sink { [weak self] blocked in self?.isObserverBlocked = blocked }
            .store(in: &cancellables)
    }

    var isConsented: Bool { settings?.isConsented ?? false }

    /// L'accord est enregistré, mais la détection ne tourne pas sur cet appareil : l'interface le dit, durablement.
    var isDetectionInactive: Bool { isConsented && isObserverBlocked }

    func load() async {
        guard let served = try? await service.consentSettings() else { return }
        settings = served
    }

    /// Le geste sur l'interrupteur : cocher ouvre le texte d'accord, décocher retire l'accord.
    func toggle(_ on: Bool) async {
        guard on else { return await withdraw() }
        isConsentSheetPresented = true
    }

    /// « J'accepte », sur la version lue à l'écran ; puis, seulement alors, l'autorisation Santé.
    func accept() async {
        isConsentSheetPresented = false
        guard let version = settings?.currentVersion else { return }
        switch await service.updateConsent(.consent(version: version)) {
        case .saved(let saved):
            settings = saved
            guard await enableObserver() else { return await withdrawAfterHealthFailure() }
        case .minor:
            notice = FallDetectionWording.consentMinor
        case .staleVersion:
            await load()
        case .failed:
            notice = FallDetectionWording.saveFailed
        }
    }

    /// Depuis « Détection inactive » : redemander Santé.
    func authorizeHealth() async {
        guard !(await enableObserver()) else { return }
        notice = FallDetectionWording.healthDenied
    }

    /// Santé refusée ou en échec juste après l'accord : l'accord se retire, l'interrupteur revient à « non ». Si le
    /// retrait lui-même échoue, l'accord reste servi et l'état « Détection inactive » le dit.
    private func withdrawAfterHealthFailure() async {
        notice = FallDetectionWording.healthUnavailable
        guard case .saved(let withdrawn) = await service.updateConsent(.withdraw) else { return }
        settings = withdrawn
        stopObserver()
    }

    private func withdraw() async {
        let previous = settings
        stopObserver()
        if let current = settings {
            settings = FallConsentSettings(consentedAt: nil, consentVersion: nil, currentVersion: current.currentVersion)
        }
        guard case .saved(let saved) = await service.updateConsent(.withdraw) else {
            settings = previous
            notice = FallDetectionWording.saveFailed
            if previous?.isConsented == true { await resumeObserver() }
            return
        }
        settings = saved
    }
}

struct FallConsentSettingsSection: View {
    let accentColor: String
    @StateObject private var viewModel = FallConsentSettingsViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: FallDetectionWording.sectionTitle,
                icon: FallDetectionWording.stateIconName, color: MeeshyColors.tileRoseHex
            )
            SettingsCard(tint: MeeshyColors.tileRoseHex) {
                SettingsRow(
                    icon: FallDetectionWording.stateIconName,
                    title: FallDetectionWording.globalTitle,
                    subtitle: FallDetectionWording.globalSubtitle,
                    color: MeeshyColors.tileRoseHex
                ) {
                    if viewModel.settings != nil {
                        Toggle("", isOn: Binding(
                            get: { viewModel.isConsented },
                            set: { value in Task { await viewModel.toggle(value) } }
                        ))
                        .labelsHidden()
                        .tint(Color(hex: accentColor))
                        .accessibilityLabel(FallDetectionWording.globalTitle)
                        .accessibilityIdentifier("fall.consent.toggle")
                    }
                }
                if viewModel.isDetectionInactive {
                    FallDetectionInactiveRow(authorize: { Task { await viewModel.authorizeHealth() } })
                }
            }
        }
        .task { await viewModel.load() }
        .sheet(isPresented: $viewModel.isConsentSheetPresented) {
            FallConsentSheet(
                accept: { Task { await viewModel.accept() } },
                cancel: { viewModel.isConsentSheetPresented = false }
            )
        }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }
}

/// « Détection inactive — autorise Santé » : l'accord est servi, l'observateur ne tourne pas. Persistant tant que c'est
/// vrai, avec le geste qui le répare.
private struct FallDetectionInactiveRow: View {
    let authorize: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(MeeshyColors.warning)
                .accessibilityHidden(true)
            Text(FallDetectionWording.detectionInactive)
                .font(.footnote.weight(.semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: authorize) {
                Text(FallDetectionWording.authorizeHealth)
                    .font(.footnote.weight(.bold))
                    .frame(minHeight: MeeshyControlSize.tapTarget)
            }
            .accessibilityIdentifier("fall.consent.authorizeHealth")
        }
        .padding(.horizontal, MeeshySpacing.md)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("fall.consent.inactive")
    }
}

/// Le texte d'accord, lu AVANT d'accepter : chaque paragraphe répond à une question, rien n'est coché d'avance.
private struct FallConsentSheet: View {
    let accept: () -> Void
    let cancel: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                    Image(systemName: FallDetectionWording.stateIconName)
                        .font(.largeTitle)
                        .foregroundStyle(MeeshyColors.error)
                        .accessibilityHidden(true)
                    Text(FallDetectionWording.consentTitle)
                        .font(.title2.weight(.bold))
                        .accessibilityAddTraits(.isHeader)
                    ForEach(paragraphs, id: \.self) { paragraph in
                        Text(paragraph)
                            .font(.body)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(MeeshySpacing.xl)
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: MeeshySpacing.sm) {
                    Button(action: accept) {
                        Text(FallDetectionWording.consentAccept)
                            .font(.headline)
                            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
                    }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("fall.consent.accept")
                    Button(action: cancel) {
                        Text(FallDetectionWording.consentCancel)
                            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
                    }
                    .accessibilityIdentifier("fall.consent.cancel")
                }
                .padding(MeeshySpacing.lg)
                .background(.bar)
            }
        }
        .accessibilityIdentifier("fall.consent.sheet")
    }

    private var paragraphs: [String] {
        [
            FallDetectionWording.consentWhat,
            FallDetectionWording.consentWho,
            FallDetectionWording.consentHowLong,
            FallDetectionWording.consentNotEmergency,
            FallDetectionWording.consentLockedLimit,
            FallDetectionWording.consentWithdraw,
        ]
    }
}
