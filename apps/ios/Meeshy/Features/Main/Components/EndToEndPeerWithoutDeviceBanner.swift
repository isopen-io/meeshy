import SwiftUI
import MeeshySDK
import MeeshyUI

/// Au-dessus du compositeur d'un tête-à-tête chiffré de bout en bout dont le
/// pair n'a aucun appareil chiffré (#20074) : la phrase qui le dit, et l'action
/// qui ouvre le tête-à-tête lisible de la paire (#12966).
struct EndToEndPeerWithoutDeviceBanner: View {
    let title: String
    let accentColor: String
    let isOpening: Bool
    let onWritePlain: () -> Void

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "lock.slash")
                .foregroundStyle(MeeshyColors.warning)
                .accessibilityHidden(true)
            Text(title)
                .font(.footnote)
                .foregroundStyle(Color.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: MeeshySpacing.xs)
            Button(action: onWritePlain) {
                if isOpening {
                    ProgressView().controlSize(.small)
                } else {
                    Text(String(localized: "conversation.e2ee.peerWithoutDevice.writePlain",
                                defaultValue: "Écrire sans chiffrement",
                                bundle: .main))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color(hex: accentColor))
                }
            }
            .frame(minHeight: 44)
            .disabled(isOpening)
            .accessibilityIdentifier("conversation.e2ee.peerWithoutDevice.writePlain")
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.xs)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("conversation.e2ee.peerWithoutDevice")
    }
}

/// Pose le bandeau au-dessus du compositeur quand la règle le veut. Le
/// scelleur se lit une fois par conversation ouverte, jamais à chaque rendu ;
/// la liste des appareils du pair se relit en silence, et le bandeau ne paraît
/// que sur ce qui est SU (cache-first : aucun indicateur d'attente).
struct EndToEndPeerWithoutDeviceBannerHost: ViewModifier {
    let conversationId: String
    let accentColor: String
    let sealer: () -> EndToEndSendSealer
    @ObservedObject var reach: EndToEndPeerDeviceReach

    @State private var redirect: EndToEndReadableRedirect?
    @State private var sealsEndToEnd = false
    @State private var isDirect = false
    @State private var isOpening = false

    private var shows: Bool {
        guard let redirect else { return false }
        return EndToEndPeerWithoutDeviceBannerRule.shows(
            sealsEndToEnd: sealsEndToEnd, isDirect: isDirect, peerLacksDevice: reach.lacksEncryptedDevice(redirect.peerUserId)
        )
    }

    func body(content: Content) -> some View {
        VStack(spacing: 0) {
            if shows, let redirect {
                EndToEndPeerWithoutDeviceBanner(
                    title: EndToEndPeerWithoutDeviceBannerRule.title(peerName: redirect.peerName),
                    accentColor: accentColor,
                    isOpening: isOpening,
                    onWritePlain: { Task { await open(redirect) } }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            content
        }
        .meeshyAnimation(MeeshyAnimation.springFast, reduced: MeeshyMotion.reducedFade, value: shows)
        .task(id: conversationId) { await learn() }
    }

    private func learn() async {
        let current = sealer()
        sealsEndToEnd = current.requiresSeal
        isDirect = current.isDirect
        redirect = current.readableRedirect
        guard sealsEndToEnd, let readable = redirect else { return }
        await reach.refresh(readable.peerUserId)
    }

    private func open(_ redirect: EndToEndReadableRedirect) async {
        guard !isOpening else { return }
        isOpening = true
        defer { isOpening = false }
        guard redirect.isOnline() else {
            HapticFeedback.error()
            return redirect.toast.showError(String(localized: "conversation.encryption.detail.plaintextDirectOffline",
                                                   defaultValue: "Hors connexion : reconnectez-vous pour l’ouvrir.",
                                                   bundle: .main))
        }
        guard await redirect.open() else {
            HapticFeedback.error()
            return redirect.toast.showError(String(localized: "conversation.encryption.detail.plaintextDirectFailed",
                                                   defaultValue: "Ouverture impossible. Réessayez.",
                                                   bundle: .main))
        }
    }
}
