import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Scanner un QR » (planches `Moi-Liens`, `Carte-Profil`, `Sans-Contact`) : la caméra lit un QR ; un lien Meeshy —
/// `meeshy.me/@pseudo`, un lien de partage, de communauté, de suivi — s'ouvre dans l'app, par le même routeur que les
/// liens universels. Un QR qui ne mène pas à Meeshy le dit, et la caméra reprend : rien ne part vers un site inconnu.
/// Une invitation (`meeshy.me/@pseudo?ce=<jeton>`, #19487) ouvre la fiche et accepte le jeton : la demande d'ami part.
struct ProfileQRScannerSheet: View {
    var onOpened: () -> Void = {}

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var access: AVAuthorizationStatus = AVCaptureDevice.authorizationStatus(for: .video)
    @State private var foreign = false
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            HStack(spacing: MeeshySpacing.md) {
                MeeshyGlassButton(systemImage: "xmark", label: ProfileLinksCopy.close, size: .s44, action: { dismiss() })
                Text(ProfileLinksCopy.scan)
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold, design: .rounded))
                    .foregroundStyle(theme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            MeeshyNote(foreign ? ProfileLinksCopy.scannerForeign : ProfileLinksCopy.scannerHint,
                       kind: foreign ? .warn : .neutral, lead: .systemImage("qrcode.viewfinder"),
                       announces: foreign)
            camera
                .frame(maxWidth: .infinity)
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
            Spacer(minLength: 0)
        }
        .padding(MeeshySpacing.lg)
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .task { await requestAccessIfNeeded() }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
    }

    @ViewBuilder
    private var camera: some View {
        switch access {
        case .authorized where AVCaptureDevice.default(for: .video) != nil:
            QRCodeCameraView(isPaused: false) { payload in scanned(payload) }
                .accessibilityLabel(ProfileLinksCopy.scannerHint)
        case .denied, .restricted:
            MeeshyStateBlock(kind: .denied,
                             title: String(localized: "e2ee.devices.scanner.denied", defaultValue: "Meeshy n’a pas accès à la caméra. Autorisez-la dans Réglages pour lire le code.", bundle: .main),
                             primary: MeeshyStateBlockAction(
                                title: String(localized: "e2ee.devices.scanner.openSettings", defaultValue: "Ouvrir Réglages", bundle: .main),
                                systemImage: "gear", perform: { openSettings() }),
                             art: .none, size: .compact)
        case .notDetermined:
            MeeshySkeleton(shape: .card(aspect: 1, radius: Double(MeeshyRadius.lg)))
        default:
            MeeshyStateBlock(kind: .empty, title: ProfileLinksCopy.scannerHint, art: .none, size: .compact)
        }
    }

    private func scanned(_ payload: String) {
        guard let url = URL(string: payload.trimmingCharacters(in: .whitespacesAndNewlines)),
              DeepLinkParser.isMeeshyDeepLink(url) else {
            foreign = true
            HapticFeedback.warning()
            return
        }
        foreign = false
        HapticFeedback.success()
        dismiss()
        onOpened()
        guard let invitation = ProfileInvitationLink.invitation(in: url) else {
            _ = DeepLinkRouter.shared.handle(url: url)
            return
        }
        _ = DeepLinkRouter.shared.handle(url: invitation.profile)
        Task { @MainActor in
            let outcome = await ProfileInvitationAcceptance.accept(invitation.token)
            ProfileInvitationAcceptance.announce(outcome)
        }
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        openURL(url)
    }

    private func requestAccessIfNeeded() async {
        guard access == .notDetermined else { return }
        let granted = await AVCaptureDevice.requestAccess(for: .video)
        access = granted ? .authorized : .denied
    }
}
