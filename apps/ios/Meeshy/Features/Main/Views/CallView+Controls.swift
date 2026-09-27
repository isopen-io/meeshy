import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import os

// La barre de commandes de l'appel établi. Sortie de `CallView.swift` (#8276).

extension CallView {
    // MARK: - Control Bar

    var hasActiveEffects: Bool {
        // Voice effects are no longer settable from the UI (dead pipeline,
        // entry removed) — only video filters light this up. `isEnabled`
        // alone misses background blur/skin smoothing enabled without ever
        // picking a colorimetry preset — same root cause as the pipeline's
        // own gate (VideoFilterPipeline.process), mirrored here.
        let config = callManager.videoFilters.config
        return config.isEnabled || config.hasAdvancedFilters
    }

    /// §7.3 + iOS 26 Liquid Glass. The buttons are grouped in a
    /// `GlassEffectContainer` so adjacent glass circles blend/morph (glass can't
    /// sample glass otherwise). Layout is intelligent: `ViewThatFits` centres the
    /// row when it fits the width, and only falls back to a horizontal scroll on
    /// narrow widths / large Dynamic Type — so the camera-flip and other controls
    /// are evenly centred rather than left-anchored in a scroll view.
    var controlBar: some View {
        // Adjacent glass circles must share a container (glass can't sample
        // glass). `AdaptiveGlassContainer` (SDK Compatibility) is a GlassEffect-
        // Container on iOS 26 and a pass-through on earlier versions.
        AdaptiveGlassContainer(spacing: 20) { fittingControlRow }
    }

    var fittingControlRow: some View {
        ViewThatFits(in: .horizontal) {
            controlButtonsRow
            ScrollView(.horizontal, showsIndicators: false) { controlButtonsRow }
        }
    }

    var controlButtonsRow: some View {
        HStack(spacing: 20) {
            // Mute — dynamic VoiceOver label so users hear the tap outcome.
            callControlButton(
                icon: callManager.isMuted ? "mic.slash.fill" : "mic.fill",
                color: callManager.isMuted ? MeeshyColors.error : .white,
                bgColor: callManager.isMuted ? MeeshyColors.error : .white,
                isActive: callManager.isMuted,
                caption: String(localized: "call.control.mute.caption", defaultValue: "Micro", bundle: .main),
                label: callManager.isMuted ? String(localized: "call.control.unmute", defaultValue: "Réactiver le micro", bundle: .main) : String(localized: "call.control.mute", defaultValue: "Couper le micro", bundle: .main),
                hint: String(localized: "call.control.mute.hint", defaultValue: "Coupe votre micro pour le correspondant", bundle: .main),
                isToggle: true
            ) {
                callManager.toggleMute()
            }

            // Speaker — §7.1/§7.3: hidden on iOS-on-Mac (output is the system
            // device, route is forced .speaker; a toggle here is a dead control).
            if !isOnMac {
                callControlButton(
                    icon: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill",
                    color: callManager.isSpeaker ? MeeshyColors.info : .white,
                    bgColor: callManager.isSpeaker ? MeeshyColors.info : .white,
                    isActive: callManager.isSpeaker,
                    caption: String(localized: "call.control.speaker.caption", defaultValue: "Son", bundle: .main),
                    label: callManager.isSpeaker ? String(localized: "call.control.speakerOff", defaultValue: "Désactiver le haut-parleur", bundle: .main) : String(localized: "call.control.speakerOn", defaultValue: "Activer le haut-parleur", bundle: .main),
                    hint: String(localized: "call.control.speaker.hint", defaultValue: "Bascule la sortie audio vers le haut-parleur du téléphone", bundle: .main),
                    isToggle: true
                ) {
                    callManager.toggleSpeaker()
                }
                CallAudioRouteControls()
            }

            // Effects (Plus button) — label is state-aware so VoiceOver users
            // Effets/filtres et flip iPhone : déplacés SUR le cadre de la
            // self-preview (pipFrameButton, retour user 2026-07-02) — plus de
            // doublon dans la barre. Seul reste ici le picker multi-caméras
            // Mac/iPad (Continuity/USB), sans équivalent sur le cadre.
            cameraControl

            // §5.4 — always visible so an AUDIO call can be upgraded to video
            // (FaceTime-style), not just toggled off/on once already in video.
            // `video.badge.plus` when off reads as "turn on camera". When the
            // survival layer has auto-paused video on a weak link, the button
            // turns amber and reads "paused (weak connection)".
            callControlButton(
                icon: videoAutoPaused ? "video.slash.fill" : (callManager.isVideoEnabled ? "video.fill" : "video.badge.plus"),
                color: videoAutoPaused ? MeeshyColors.warning : MeeshyColors.indigo400,
                bgColor: videoAutoPaused ? MeeshyColors.warning : MeeshyColors.indigo400,
                isActive: videoAutoPaused ? true : !callManager.isVideoEnabled,
                toggleValue: callManager.isVideoEnabled,
                caption: videoAutoPaused
                    ? String(localized: "call.control.video.paused.caption", defaultValue: "En pause", bundle: .main)
                    : String(localized: "call.control.video.caption", defaultValue: "Vidéo", bundle: .main),
                label: videoAutoPaused
                    ? String(localized: "call.control.video.paused", defaultValue: "Vidéo en pause (connexion faible)", bundle: .main)
                    : (callManager.isVideoEnabled ? String(localized: "call.control.videoOff", defaultValue: "Désactiver la vidéo", bundle: .main) : String(localized: "call.control.videoOn", defaultValue: "Activer la vidéo", bundle: .main)),
                hint: videoAutoPaused
                    ? String(localized: "call.control.video.paused.hint", defaultValue: "Touchez pour éteindre la caméra. La vidéo reprend automatiquement si la connexion s'améliore.", bundle: .main)
                    : nil,
                isToggle: true
            ) {
                callManager.toggleVideo()
            }
            .disabled(callManager.screenShare.isSharing)

            if !isOnMac, case .connected = callManager.callState {
                callControlButton(icon: callManager.screenShare.isSharing ? "rectangle.on.rectangle.slash" : "rectangle.on.rectangle", color: MeeshyColors.indigo400, bgColor: MeeshyColors.indigo400, isActive: callManager.screenShare.isSharing, toggleValue: callManager.screenShare.isSharing, caption: CallScreenShareCopy.caption, label: CallScreenShareCopy.label(isSharing: callManager.screenShare.isSharing), hint: CallScreenShareCopy.hint, isToggle: true) {
                    screenSharePicker.toggle(controller: callManager.screenShare)
                }
                .background(screenSharePicker.host.frame(width: 1, height: 1).opacity(0.02).accessibilityHidden(true))
            }
            if callManager.mayRequestRecording || callManager.recording.phase.isActive {
                callControlButton(icon: callManager.recording.phase.isActive ? "stop.circle.fill" : "record.circle", color: MeeshyColors.error, bgColor: MeeshyColors.error, isActive: callManager.recording.phase.isActive, toggleValue: callManager.recording.phase.isActive, caption: CallRecordingCopy.caption, label: CallRecordingCopy.label(isActive: callManager.recording.phase.isActive), hint: CallRecordingCopy.hint, isToggle: true) {
                    _ = callManager.recording.phase.isActive ? callManager.recording.stop() : callManager.recording.request()
                }
            }

            // PiP système — réduire en fenêtre vidéo flottante. Visible seulement
            // si éligible (appel vidéo + track distant + caméra distante allumée +
            // appareil compatible). En audio, le « réduire » reste le chevron →
            // pilule in-app, pas une fenêtre vidéo.
            if callManager.canActivateSystemPiP {
                callControlButton(
                    icon: callManager.isSystemPiPActive ? "pip.exit" : "pip.enter",
                    color: .white,
                    bgColor: .white,
                    isActive: callManager.isSystemPiPActive,
                    caption: String(localized: "call.control.pip.caption", defaultValue: "PiP", bundle: .main),
                    label: callManager.isSystemPiPActive
                        ? String(localized: "call.control.pip.exit", defaultValue: "Quitter le mode Picture-in-Picture", bundle: .main)
                        : String(localized: "call.control.pip", defaultValue: "Réduire en Picture-in-Picture", bundle: .main)
                ) {
                    if callManager.isSystemPiPActive {
                        callManager.stopSystemPiP()
                    } else {
                        callManager.startSystemPiP()
                    }
                }
            }

            // End call
            endCallButton
        }
        .padding(.horizontal, 16)
        // §7.1 — populate the camera list when video turns on so `cameraControl`
        // can decide flip vs device picker (Continuity/USB on Mac/iPad).
        .task(id: callManager.isVideoEnabled) {
            if callManager.isVideoEnabled { callManager.refreshAvailableCameras() }
        }
    }

    @ViewBuilder
    var cameraControl: some View {
        if callManager.isVideoEnabled,
           callManager.availableCameras.count > 1,
           isOnMac || callManager.availableCameras.contains(where: { $0.isExternal }) {
            CallCameraPickerControl(cameras: callManager.availableCameras, selectedCameraId: callManager.selectedCameraId) { callManager.selectCamera(id: $0) }
        }
    }

    /// `caption` is the short visible word under the glass circle; `label` is the
    /// full (often long, stateful) VoiceOver description. Keeping them separate is
    /// what lets every column stay the same width so the row reads as an even,
    /// intelligently-aligned glass bar instead of one button ballooning to fit a
    /// long French label.
    func callControlButton(icon: String, color: Color, bgColor: Color, isActive: Bool, toggleValue: Bool? = nil, caption: String, label: String, hint: String? = nil, isToggle: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    // Doctrine 86i : glyphe de contrôle dans un cercle glass fixe (diameter 56) → figé
                    // (la caption `.caption2` sous le bouton porte, elle, le Dynamic Type).
                    .font(.system(size: 22, weight: .medium))
                    .foregroundColor(isActive ? color : .white.opacity(0.9))
                    .callControlGlass(diameter: 56, isActive: isActive, tint: bgColor)

                Text(caption)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 68)
        }
        .pressable()
        .accessibilityLabel(label)
        .optionalAccessibilityHint(hint)
        .toggleStateAccessibility(isToggle: isToggle, isActive: toggleValue ?? isActive)
    }

    var effectsToggleButton: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showEffectsToolbar.toggle()
            }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: showEffectsToolbar ? "xmark" : "camera.filters")
                    // Doctrine 86i : glyphe de contrôle dans un cercle glass fixe (diameter 64) → figé.
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(hasActiveEffects ? MeeshyColors.indigo500 : .white.opacity(0.9))
                    .callControlGlass(diameter: 64, isActive: hasActiveEffects, tint: MeeshyColors.indigo500)

                Text(String(localized: "call.filters", defaultValue: "Filtres", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.filters.a11y", defaultValue: "Filtres vidéo", bundle: .main))
        .accessibilityHint(String(localized: "call.filters.hint", defaultValue: "Ouvre ou ferme la barre de filtres vidéo", bundle: .main))
        // L'indice disait « ouvre OU ferme » — ambigu précisément parce que
        // l'état n'était pas exposé : le glyphe passe de `camera.filters` à
        // `xmark` et rien ne le disait (253i, #4266). L'état porté ici est celui
        // que le bouton BASCULE (la barre), jamais `hasActiveEffects`, qui est
        // un fait VOISIN — la teinte le montre, et l'annoncer ici ferait dire au
        // contrôle un état qui n'est pas le sien.
        .toggleStateAccessibility(isToggle: true, isActive: showEffectsToolbar)
    }

    var endCallButton: some View {
        Button {
            callManager.endCall()
        } label: {
            VStack(spacing: 6) {
                Image(systemName: "phone.down.fill")
                    // Doctrine 86i : glyphe de fin d'appel dans un cercle glass fixe (diameter 56) → figé.
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(.white)
                    .endCallGlass(diameter: 56)

                Text(String(localized: "call.end.caption", defaultValue: "Raccrocher", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 68)
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.end", defaultValue: "Raccrocher", bundle: .main))
        .accessibilityHint(String(localized: "call.end.hint", defaultValue: "Termine l'appel en cours", bundle: .main))
    }
}
