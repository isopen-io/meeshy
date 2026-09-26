import ReplayKit
import SwiftUI
import UIKit
import MeeshyUI

// #8063 — ce que l'écran d'appel montre du partage d'écran : le lanceur du
// sélecteur système de diffusion, la bannière « vous partagez / X partage »,
// et leurs libellés. Hors de `CallView.swift`, qui est hors budget de taille.

enum CallScreenShareCopy {
    /// Identifiant de l'extension Broadcast Upload (`project.yml`) : le
    /// sélecteur système ne propose QU'ELLE, jamais une app tierce.
    static let extensionBundleId = "me.meeshy.app.broadcast"

    static var caption: String {
        String(localized: "call.screenShare.caption", defaultValue: "Écran", bundle: .main)
    }

    static func label(isSharing: Bool) -> String {
        isSharing
            ? String(localized: "call.screenShare.stop", defaultValue: "Arrêter le partage d'écran", bundle: .main)
            : String(localized: "call.screenShare.start", defaultValue: "Partager l'écran", bundle: .main)
    }

    static var hint: String {
        String(localized: "call.screenShare.hint", defaultValue: "Montre votre écran au correspondant pendant l'appel", bundle: .main)
    }

    static var localBanner: String {
        String(localized: "call.screenShare.local.banner", defaultValue: "Vous partagez votre écran", bundle: .main)
    }

    static func remoteBanner(name: String) -> String {
        guard !name.isEmpty else {
            return String(localized: "call.screenShare.remote.banner.generic", defaultValue: "Votre correspondant partage son écran", bundle: .main)
        }
        return String(format: String(localized: "call.screenShare.remote.banner", defaultValue: "%@ partage son écran", bundle: .main), name)
    }

    static var stopCaption: String {
        String(localized: "call.screenShare.stop.caption", defaultValue: "Arrêter", bundle: .main)
    }
}

/// Ouvre la feuille système de diffusion, préréglée sur l'extension Meeshy.
/// `RPSystemBroadcastPickerView` n'a pas d'API d'ouverture : on actionne le
/// bouton qu'elle porte. La vue vit dans la hiérarchie (`host`) — hors
/// hiérarchie, le bouton ne présente rien sur certaines versions d'iOS.
final class ScreenSharePickerLauncher {
    private(set) lazy var picker: RPSystemBroadcastPickerView = {
        let view = RPSystemBroadcastPickerView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        view.preferredExtension = CallScreenShareCopy.extensionBundleId
        view.showsMicrophoneButton = false
        view.isAccessibilityElement = false
        view.accessibilityElementsHidden = true
        return view
    }()

    /// Arrête le partage en cours, sinon ouvre la feuille — après avoir mis
    /// l'app en écoute : l'extension lancée sans app pour la recevoir
    /// s'arrêterait aussitôt.
    func toggle(controller: CallScreenShareController) {
        guard !controller.isSharing else {
            controller.stopSharing()
            return
        }
        guard controller.prepareBroadcast() else { return }
        HapticFeedback.light()
        picker.subviews
            .compactMap { $0 as? UIButton }
            .first?
            .sendActions(for: .touchUpInside)
    }

    var host: some View { ScreenSharePickerHost(picker: picker) }
}

private struct ScreenSharePickerHost: UIViewRepresentable {
    let picker: RPSystemBroadcastPickerView

    func makeUIView(context: Context) -> RPSystemBroadcastPickerView { picker }
    func updateUIView(_ uiView: RPSystemBroadcastPickerView, context: Context) {}
}

/// Bannière d'état du partage. Paramètres primitifs : elle ne se réévalue que
/// si l'un d'eux change. Le bouton Arrêter n'existe que côté partageur.
struct CallScreenShareBanner: View, Equatable {
    let isSharing: Bool
    let remoteSharerName: String?
    let onStop: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.isSharing == rhs.isSharing && lhs.remoteSharerName == rhs.remoteSharerName
    }

    var body: some View {
        if isSharing {
            banner(text: CallScreenShareCopy.localBanner, showsStop: true)
        } else if let remoteSharerName {
            banner(text: CallScreenShareCopy.remoteBanner(name: remoteSharerName), showsStop: false)
        }
    }

    private func banner(text: String, showsStop: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "rectangle.on.rectangle")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(MeeshyColors.error)
                .accessibilityHidden(true)
            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            if showsStop {
                Button(action: onStop) {
                    Text(CallScreenShareCopy.stopCaption)
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(CallScreenShareCopy.label(isSharing: true))
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, showsStop ? 4 : 14)
        .frame(minHeight: 44)
        .adaptiveGlass(in: Capsule(), tint: MeeshyColors.error.opacity(0.35), interactive: showsStop)
        .accessibilityElement(children: .contain)
    }
}
