import SwiftUI
import MeeshySDK
import MeeshyUI

// L'aperçu avant décroché à l'écran (#8480). Trois pièces qui observent le
// coordinateur elles-mêmes : l'écran de sonnerie ne se redessine pas à chaque
// changement du lien d'aperçu, seules elles le font.

/// Chez l'appelé : la vidéo de l'appelant, derrière la sonnerie.
struct CallPreviewBackdrop: View {
    @ObservedObject var preview: CallPreviewCoordinator

    var body: some View {
        ZStack {
            if let track = preview.previewVideoTrack {
                ZStack {
                    CallVideoView(track: track, contentMode: .scaleAspectFill)
                    Color.black.opacity(0.35)
                }
                .ignoresSafeArea()
                .accessibilityHidden(true)
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: preview.previewVideoTrack != nil)
    }
}

/// Chez l'appelé : entendre l'appelant avant de décrocher. N'apparaît qu'une
/// fois le lien d'aperçu établi — avant, il n'y a rien à entendre.
struct CallPreviewSoundButton: View {
    @ObservedObject var preview: CallPreviewCoordinator

    var body: some View {
        ZStack {
            if preview.isPreviewConnected {
                let audible = preview.isPreviewAudible
                Button {
                    preview.toggleSound()
                } label: {
                    Label(
                        audible
                            ? String(localized: "call.preview.sound.off", defaultValue: "Couper le son", bundle: .main)
                            : String(localized: "call.preview.sound.on", defaultValue: "Activer le son", bundle: .main),
                        systemImage: audible ? "speaker.wave.2.fill" : "speaker.slash.fill"
                    )
                    .font(.callout.weight(.medium))
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .frame(minHeight: 44)
                    .adaptiveGlass(in: Capsule())
                }
                .pressable()
                .accessibilityHint(String(localized: "call.preview.sound.hint", defaultValue: "Écoute l'appelant avant de décrocher", bundle: .main))
                .accessibilityAddTraits(audible ? .isSelected : [])
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: preview.isPreviewConnected)
    }
}

/// Chez l'appelant : l'appelé le voit, ou l'entend, avant de décrocher.
struct CallPreviewSeenLabel: View {
    @ObservedObject var preview: CallPreviewCoordinator
    let peerName: String
    let isVideo: Bool
    let isMuted: Bool

    var body: some View {
        ZStack {
            if preview.isSeenByCallee, let text = Self.text(peerName: peerName, isVideo: isVideo, isMuted: isMuted) {
                Label(text, systemImage: isVideo ? "eye.fill" : "ear.fill")
                    .font(.caption.weight(.medium))
                    .foregroundColor(.white.opacity(0.85))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .adaptiveGlass(in: Capsule())
                    .accessibilityElement(children: .combine)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: preview.isSeenByCallee)
    }

    /// Un micro coupé en audio seul : l'appelé ne reçoit rien, rien à annoncer.
    static func text(peerName: String, isVideo: Bool, isMuted: Bool) -> String? {
        if isVideo {
            return String(format: String(localized: "call.preview.seenBy", defaultValue: "%@ vous voit avant de décrocher", bundle: .main), peerName)
        }
        guard !isMuted else { return nil }
        return String(format: String(localized: "call.preview.heardBy", defaultValue: "%@ peut vous entendre avant de décrocher", bundle: .main), peerName)
    }
}
