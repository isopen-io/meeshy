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
                    Color.black.opacity(MeeshyOpacity.medium)
                }
                .ignoresSafeArea()
                .accessibilityHidden(true)
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: preview.previewVideoTrack != nil)
    }
}

/// Chez l'appelé : entendre l'appelant avant de décrocher. Proposé dès que
/// l'appel 1:1 sonne (#8627) : un bouton plein, qu'on ne peut pas manquer,
/// tant que le son est coupé ; le choix s'applique dès que l'appelant arrive.
struct CallPreviewSoundButton: View {
    @ObservedObject var preview: CallPreviewCoordinator

    var body: some View {
        ZStack {
            if preview.offersSound {
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
                    .font(.body.weight(.semibold))
                    .foregroundColor(audible ? .white : .black)
                    .padding(.horizontal, MeeshySpacing.xxl)
                    .frame(minHeight: 50)
                    .background(Capsule().fill(audible ? Color.clear : Color.white))
                    .adaptiveGlass(in: Capsule())
                }
                .pressable()
                .accessibilityHint(String(localized: "call.preview.sound.hint", defaultValue: "Écoute l'appelant avant de décrocher", bundle: .main))
                .accessibilityAddTraits(audible ? .isSelected : [])
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: preview.offersSound)
    }
}

/// Chez l'appelant : ce que l'appelé reçoit VRAIMENT avant de décrocher
/// (#8795) — « vous voit » dès que la caméra de l'aperçu l'atteint, « vous
/// entend » seulement quand il a lui-même activé le son.
struct CallPreviewSeenLabel: View {
    @ObservedObject var preview: CallPreviewCoordinator
    let peerName: String

    var body: some View {
        let exposure = preview.calleeExposure
        ZStack {
            if let text = Self.text(peerName: peerName, exposure: exposure) {
                Label(text, systemImage: exposure == .seen ? "eye.fill" : "ear.fill")
                    .font(.caption.weight(.medium))
                    .foregroundColor(MeeshyColors.mediaChromeSecondary)
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.xsPlus)
                    .adaptiveGlass(in: Capsule())
                    .accessibilityElement(children: .combine)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: exposure)
    }

    static func text(peerName: String, exposure: CallPreviewExposure) -> String? {
        switch exposure {
        case .nothing:
            return nil
        case .seen:
            return String(format: String(localized: "call.preview.seenBy", defaultValue: "%@ vous voit avant de décrocher", bundle: .main), peerName)
        case .heard:
            return String(format: String(localized: "call.preview.heardBy", defaultValue: "%@ vous entend avant de décrocher", bundle: .main), peerName)
        case .seenAndHeard:
            return String(format: String(localized: "call.preview.heardAndSeenBy", defaultValue: "%@ vous entend et vous voit avant de décrocher", bundle: .main), peerName)
        }
    }
}

/// Chez l'appelant, à côté des filtres : ce que l'appelé reçoit avant de
/// décrocher (#8795). Micro coupé et caméra activée pour un contact jamais
/// appelé ; le choix est retenu pour CE contact.
struct CallPreviewOutgoingControls: View {
    @ObservedObject var preview: CallPreviewCoordinator
    let peerName: String
    let isVideoCall: Bool

    var body: some View {
        if preview.offersOutgoingControls {
            let consent = preview.outgoingConsent
            toggle(
                isOn: consent.sendsAudio,
                on: "mic.fill",
                off: "mic.slash.fill",
                caption: String(localized: "call.control.mute.caption", defaultValue: "Micro", bundle: .main),
                label: String(localized: "call.preview.mic.a11y", defaultValue: "Micro avant le décroché", bundle: .main),
                hint: String(format: String(localized: "call.preview.mic.hint", defaultValue: "Décide si %@ vous entend avant de décrocher", bundle: .main), peerName),
                action: preview.togglePreviewAudio
            )
            if isVideoCall {
                toggle(
                    isOn: consent.sendsVideo,
                    on: "video.fill",
                    off: "video.slash.fill",
                    caption: String(localized: "call.control.camera.caption", defaultValue: "Caméra", bundle: .main),
                    label: String(localized: "call.preview.camera.a11y", defaultValue: "Caméra avant le décroché", bundle: .main),
                    hint: String(format: String(localized: "call.preview.camera.hint", defaultValue: "Décide si %@ vous voit avant de décrocher", bundle: .main), peerName),
                    action: preview.togglePreviewVideo
                )
            }
        }
    }

    private func toggle(
        isOn: Bool,
        on: String,
        off: String,
        caption: String,
        label: String,
        hint: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            VStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: isOn ? on : off)
                    // Le glyphe suit Dynamic Type, borné pour tenir dans son
                    // cercle de 64 pt (règle du 264i : aucune taille figée neuve).
                    .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .medium))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .foregroundColor(isOn ? MeeshyColors.indigo500 : .white.opacity(MeeshyOpacity.intense))
                    .callControlGlass(diameter: 64, isActive: isOn, tint: MeeshyColors.indigo500)

                Text(caption)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(MeeshyColors.mediaChromeTertiary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .buttonStyle(CallPressButtonStyle())
        .accessibilityLabel(label)
        .accessibilityHint(hint)
        .toggleStateAccessibility(isToggle: true, isActive: isOn)
    }
}
