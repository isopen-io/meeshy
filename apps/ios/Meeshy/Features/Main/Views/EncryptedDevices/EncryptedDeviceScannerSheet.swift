import AVFoundation
import SwiftUI
import MeeshyUI

/// « Lire le code d'un appareil » (#13009) : la caméra lit le QR, l'appareil
/// qu'il désigne est NOMMÉ, et rien ne s'approuve sans le geste « Approuver ».
/// Un code qui ne correspond à aucun de mes appareils le dit, et la caméra
/// reprend.
struct EncryptedDeviceScannerSheet: View {
    @ObservedObject var model: EncryptedDevicesViewModel
    /// L'appareil qu'on approuve, si le lecteur a été ouvert depuis sa feuille.
    let expected: EndToEndOwnDevice?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var access: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        NavigationStack {
            VStack(spacing: MeeshySpacing.lg) {
                Text(String(localized: "e2ee.devices.scanner.instruction", defaultValue: "Visez le code affiché par votre autre appareil, dans « Mes appareils chiffrés » › « Montrer mon code ».", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundStyle(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                camera
                    .frame(maxWidth: .infinity)
                    .aspectRatio(1, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                EncryptedDeviceSimulatorEntry { payload in Task { await model.scanned(payload, expecting: expected?.deviceId) } }
                Spacer(minLength: 0)
            }
            .padding(MeeshySpacing.lg)
            .background(theme.backgroundPrimary.ignoresSafeArea())
            .navigationTitle(String(localized: "e2ee.devices.scan", defaultValue: "Lire le code d’un appareil", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { dismiss() }
                }
            }
        }
        .task { await requestAccessIfNeeded() }
        // Les liaisons ne font RIEN quand l'alerte se ferme : seuls ses deux
        // boutons décident, avec la confirmation qu'ils ont présentée (audit
        // #13009 — une liaison qui annulait vidait l'état avant la tâche
        // « Approuver »).
        .alert(
            approvalTitle,
            isPresented: Binding(get: { model.pendingApproval != nil }, set: { _ in }),
            presenting: model.pendingApproval,
            actions: { pending in
                Button(String(localized: "e2ee.devices.approve", defaultValue: "Approuver", bundle: .main)) {
                    guard let accepted = model.acceptApproval(pending) else { return }
                    Task { await model.approve(accepted) }
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { model.cancelApproval() }
            },
            message: { pending in Text(approvalMessage(pending)) }
        )
        .alert(
            EncryptedDeviceNoticeText.title(model.notice, devices: model.devices),
            isPresented: Binding(get: { model.notice != nil }, set: { _ in }),
            presenting: model.notice,
            actions: { notice in
                Button(String(localized: "common.ok", defaultValue: "OK", bundle: .main), role: .cancel) {
                    model.notice = nil
                    if case .approved = notice { dismiss() }
                }
            },
            message: { notice in Text(EncryptedDeviceNoticeText.message(notice)) }
        )
    }

    private var approvalTitle: String {
        let name = model.pendingApproval.map { pending in
            pending.device.map(EncryptedDevicePresentation.title(of:))
                ?? String(format: String(localized: "e2ee.devices.numbered", defaultValue: "Appareil n° %d", bundle: .main), Int(pending.candidate.deviceId))
        } ?? ""
        let number = model.pendingApproval.map { Int($0.candidate.deviceId) } ?? 0
        return String(format: String(localized: "e2ee.devices.approve.title", defaultValue: "Approuver « %@ » (n° %d) ?", bundle: .main), name, number)
    }

    /// Le numéro et l'heure d'inscription disent QUEL appareil on approuve : le
    /// nom, lui, est annoncé par l'appareil et peut mentir.
    private func approvalMessage(_ pending: EncryptedDevicesViewModel.PendingApproval) -> String {
        let warning = String(localized: "e2ee.devices.approve.message", defaultValue: "N’approuvez qu’un appareil qui est à vous et devant vous, jamais un code reçu par message ou montré par quelqu’un d’autre. Il pourra lire les messages chiffrés que vous écrivez depuis celui-ci.", bundle: .main)
        guard let enrolled = pending.device?.enrolledAt else { return warning }
        let when = String(
            format: String(localized: "e2ee.devices.approve.enrolled", defaultValue: "Inscrit le %@.", bundle: .main),
            enrolled.formatted(date: .abbreviated, time: .shortened)
        )
        return when + "\n\n" + warning
    }

    @ViewBuilder
    private var camera: some View {
        switch access {
        case .authorized where AVCaptureDevice.default(for: .video) != nil:
            QRCodeCameraView(isPaused: model.pendingApproval != nil || model.notice != nil) { payload in
                Task { await model.scanned(payload, expecting: expected?.deviceId) }
            }
            .accessibilityLabel(String(localized: "e2ee.devices.scanner.camera.a11y", defaultValue: "Caméra, en attente d’un code", bundle: .main))
        case .denied, .restricted:
            cameraUnavailable(
                text: String(localized: "e2ee.devices.scanner.denied", defaultValue: "Meeshy n’a pas accès à la caméra. Autorisez-la dans Réglages pour lire le code.", bundle: .main),
                showsSettings: true
            )
        case .notDetermined:
            ProgressView()
        default:
            cameraUnavailable(
                text: String(localized: "e2ee.devices.scanner.noCamera", defaultValue: "Cet appareil n’a pas de caméra. Lisez plutôt le code de cet appareil depuis l’autre.", bundle: .main),
                showsSettings: false
            )
        }
    }

    private func cameraUnavailable(text: String, showsSettings: Bool) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: "camera.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.xxxl))
                .foregroundStyle(theme.textMuted)
                .accessibilityHidden(true)
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundStyle(theme.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if showsSettings, let url = URL(string: UIApplication.openSettingsURLString) {
                Button(String(localized: "e2ee.devices.scanner.openSettings", defaultValue: "Ouvrir Réglages", bundle: .main)) { openURL(url) }
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                    .frame(minHeight: MeeshyControlSize.tapTarget)
            }
        }
        .padding(MeeshySpacing.lg)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.inputBackground)
    }

    private func requestAccessIfNeeded() async {
        guard access == .notDetermined else { return }
        _ = await AVCaptureDevice.requestAccess(for: .video)
        access = AVCaptureDevice.authorizationStatus(for: .video)
    }
}

/// Le simulateur n'a pas de caméra : sa SEULE entrée est un champ où coller le
/// texte du code, pour la recette. Le champ n'existe pas sur un appareil.
private struct EncryptedDeviceSimulatorEntry: View {
    let onSubmit: (String) -> Void
    @State private var text = ""

    var body: some View {
        #if targetEnvironment(simulator)
        HStack(spacing: MeeshySpacing.sm) {
            TextField(String(localized: "e2ee.devices.scanner.simulator", defaultValue: "Code (simulateur)", bundle: .main), text: $text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityIdentifier("e2ee.devices.scanner.simulator.field")
            Button(String(localized: "e2ee.devices.scanner.simulator.submit", defaultValue: "Lire", bundle: .main)) {
                onSubmit(text.trimmingCharacters(in: .whitespacesAndNewlines))
                text = ""
            }
            .accessibilityIdentifier("e2ee.devices.scanner.simulator.submit")
            .frame(minHeight: MeeshyControlSize.tapTarget)
        }
        #else
        EmptyView()
        #endif
    }
}
