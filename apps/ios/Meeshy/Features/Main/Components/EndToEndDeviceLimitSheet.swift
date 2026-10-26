import Combine
import MeeshyE2EE
import MeeshySDK
import MeeshyUI
import SwiftUI

/// Ce que l'écran de retrait sait des appareils chiffrés de mon compte.
enum EndToEndDeviceLimitState: Equatable {
    case loading
    case loaded([E2EEDeviceListing])
    case failed
    /// Cet appareil s'est enrôlé : l'envoi chiffré peut reprendre.
    case enrolled
}

/// `E2EE_DEVICE_LIMIT_REACHED` (#3707) : le compte a déjà le nombre maximal
/// d'appareils chiffrés. L'écran les liste et en retire un ; cet appareil
/// retente alors de s'enrôler. Retirer un appareil RÉVOQUE son identité : il ne
/// lira plus les nouveaux messages chiffrés tant qu'il ne s'est pas réenrôlé
/// sous une identité neuve.
@MainActor
final class EndToEndDeviceLimitViewModel: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var state: EndToEndDeviceLimitState = .loading
    @Published private(set) var retiringDeviceId: UInt32?
    /// La place visée a changé d'occupant depuis la liste lue (409
    /// `E2EE_DEVICE_CHANGED`, #13036) : rien n'a été retiré, la liste relue le dit.
    @Published private(set) var listChangedSinceReading = false

    private let devices: any EndToEndDeviceManaging
    private let userId: @MainActor () -> String?

    init(
        devices: any EndToEndDeviceManaging = EndToEndMessagingRuntime.shared,
        userId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.devices = devices
        self.userId = userId
    }

    func load() async {
        guard let userId = userId() else {
            state = .failed
            return
        }
        state = .loading
        do {
            state = .loaded(try await devices.ownDevices(of: userId))
        } catch {
            state = .failed
        }
    }

    func retire(_ device: E2EEDeviceListing) async {
        guard let userId = userId() else { return }
        retiringDeviceId = device.deviceId
        listChangedSinceReading = false
        defer { retiringDeviceId = nil }
        do {
            try await devices.retire(deviceId: device.deviceId, registrationId: device.registrationId)
            try await devices.enroll(userId)
            state = .enrolled
        } catch E2EEDeviceRetirementError.deviceChanged {
            await load()
            listChangedSinceReading = true
        } catch {
            await load()
        }
    }
}

struct EndToEndDeviceLimitSheet: View {
    @StateObject private var model: EndToEndDeviceLimitViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var pendingRetirement: E2EEDeviceListing?
    @State private var showsMyDevices = false

    init(model: @autoclosure @escaping () -> EndToEndDeviceLimitViewModel = EndToEndDeviceLimitViewModel()) {
        _model = StateObject(wrappedValue: model())
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(String(localized: "e2ee.deviceLimit.explanation",
                                defaultValue: "Votre compte utilise déjà le nombre maximal d’appareils pour le chiffrement de bout en bout. Retirez-en un pour écrire depuis celui-ci. Un appareil retiré ne lit plus les nouveaux messages chiffrés.",
                                bundle: .main))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                content
                Section {
                    Button(String(localized: "e2ee.deviceLimit.manage", defaultValue: "Voir mes appareils chiffrés", bundle: .main)) { showsMyDevices = true }
                        .frame(minHeight: MeeshyControlSize.tapTarget)
                }
            }
            .sheet(isPresented: $showsMyDevices) { EncryptedDevicesView() }
            .navigationTitle(String(localized: "e2ee.deviceLimit.title", defaultValue: "Trop d’appareils chiffrés", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { dismiss() }
                }
            }
            .confirmationDialog(
                String(localized: "e2ee.deviceLimit.confirm", defaultValue: "Retirer cet appareil ?", bundle: .main),
                isPresented: Binding(get: { pendingRetirement != nil }, set: { if !$0 { pendingRetirement = nil } }),
                titleVisibility: .visible
            ) {
                Button(String(localized: "e2ee.deviceLimit.retire", defaultValue: "Retirer", bundle: .main), role: .destructive) {
                    guard let device = pendingRetirement else { return }
                    Task { await model.retire(device) }
                }
            }
            .task { await model.load() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .loading:
            Section { ProgressView().frame(maxWidth: .infinity) }
        case .failed:
            Section {
                Button(String(localized: "e2ee.deviceLimit.retry", defaultValue: "Réessayer", bundle: .main)) {
                    Task { await model.load() }
                }
            } header: {
                Text(String(localized: "e2ee.deviceLimit.failed", defaultValue: "Impossible de lire vos appareils.", bundle: .main))
            }
        case .loaded(let devices):
            Section {
                ForEach(devices, id: \.deviceId) { device in row(device) }
            } header: {
                if model.listChangedSinceReading {
                    Text(String(localized: "e2ee.devices.notice.deviceChanged.message",
                                defaultValue: "Un autre appareil a pris cette place depuis l’affichage de la liste. Rien n’a été retiré. Vérifiez la liste à jour avant de retirer un appareil.",
                                bundle: .main))
                }
            }
        case .enrolled:
            Section {
                Label(String(localized: "e2ee.deviceLimit.enrolled", defaultValue: "Cet appareil chiffre de nouveau. Vous pouvez renvoyer votre message.", bundle: .main),
                      systemImage: "lock.shield.fill")
                    .foregroundStyle(MeeshyColors.success)
            }
        }
    }

    private func row(_ device: E2EEDeviceListing) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "iphone").accessibilityHidden(true)
            Text(String(format: String(localized: "e2ee.deviceLimit.device", defaultValue: "Appareil n° %d", bundle: .main), Int(device.deviceId)))
            Spacer()
            if model.retiringDeviceId == device.deviceId {
                ProgressView()
            } else {
                Button(String(localized: "e2ee.deviceLimit.retire", defaultValue: "Retirer", bundle: .main), role: .destructive) {
                    pendingRetirement = device
                }
                .disabled(model.retiringDeviceId != nil)
            }
        }
    }
}

/// L'écran de retrait s'ouvre où que l'on soit, quand un envoi chiffré bute sur la limite.
struct EndToEndDeviceLimitPresenter: ViewModifier {
    @State private var presented = false

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(for: .endToEndDeviceLimitReached).receive(on: DispatchQueue.main)) { _ in
                presented = true
            }
            .sheet(isPresented: $presented) { EndToEndDeviceLimitSheet() }
    }
}
