import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// #8394 — la pilule du bas, identique en audio, en vidéo et en groupe :
// (…) · Micro · Sortie · Fin, dans UN verre. Le (…) range ou déploie les
// actions : en duo, deux rails verticaux aux bords, à mi-hauteur (à gauche
// « mon image », à droite « l'appel ») ; en groupe, la même pilule grandit
// vers le haut en deux rangées légendées de quatre colonnes.

/// Ré-arme l'auto-masquage (§7.3) à chaque révélation ET à chaque usage du (…).
struct AutoHideKey: Equatable {
    let isVisible: Bool
    let isExpanded: Bool
}

enum CallControlsCopy {
    static var more: String {
        String(localized: "call.control.more", defaultValue: "Plus d'actions", bundle: .main)
    }

    static var moreCaption: String {
        String(localized: "call.control.more.caption", defaultValue: "Plus", bundle: .main)
    }

    static var moreHint: String {
        String(localized: "call.control.more.hint", defaultValue: "Affiche ou range les actions de l'appel", bundle: .main)
    }

    static func moreValue(isExpanded: Bool) -> String {
        isExpanded
            ? String(localized: "message.long.expanded", defaultValue: "Déplié", bundle: .main)
            : String(localized: "message.long.collapsed", defaultValue: "Replié", bundle: .main)
    }

    static var myImage: String {
        String(localized: "call.actions.myImage", defaultValue: "Mon image", bundle: .main)
    }

    static var theCall: String {
        String(localized: "call.actions.theCall", defaultValue: "L'appel", bundle: .main)
    }

    static var flipCaption: String {
        String(localized: "call.control.flipCamera.caption", defaultValue: "Retourner", bundle: .main)
    }

    static var effectsCaption: String {
        String(localized: "call.control.effects.caption", defaultValue: "Effets", bundle: .main)
    }

    static var messagesCaption: String {
        String(localized: "call.control.messages.caption", defaultValue: "Messages", bundle: .main)
    }
}

extension CallView {
    private static let pillGlyphDiameter: CGFloat = 48
    private static let railGlyphDiameter: CGFloat = 44

    private var actionContext: CallActionContext {
        let isConnected: Bool = {
            if case .connected = callManager.callState { return true }
            return false
        }()
        return CallActionContext(
            isOnMac: isOnMac,
            isVideoEnabled: callManager.isVideoEnabled,
            hasSelectableCameras: callManager.availableCameras.count > 1
                && (isOnMac || callManager.availableCameras.contains(where: { $0.isExternal })),
            isConnected: isConnected,
            mayRecord: callManager.mayRequestRecording || callManager.recording.phase.isActive,
            canPictureInPicture: callManager.canActivateSystemPiP || callManager.isSystemPiPActive,
            hasConversation: callManager.conversationId != nil
        )
    }

    var actionsPresentation: CallActionsPresentation {
        controlsDisclosure.presentation(isGroup: isGroupStage)
    }

    // MARK: - Pill

    var callControlsPill: some View {
        let actions = CallActionSet.resolve(actionContext)
        return VStack(spacing: 0) {
            // #8396 — en groupe, les sous-titres se posent en HAUT du cadre de
            // verre de la pilule : un seul verre, pas de verre sur verre.
            if isGroupStage && showTranscript {
                captionsBand(hasOwnGlass: false)
                    .padding(.leading, 14)
                    .padding(.trailing, 4)
                    .padding(.top, 6)
                pillHairline
            }
            if actionsPresentation == .rows {
                actionRow(title: CallControlsCopy.myImage, actions: actions.myImage)
                pillHairline
                actionRow(title: CallControlsCopy.theCall, actions: actions.theCall)
                pillHairline
            }
            baseRow
        }
        .frame(maxWidth: 440)
        .callChromeGlass(in: RoundedRectangle(cornerRadius: 32, style: .continuous))
        .animation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85), value: controlsDisclosure)
    }

    private var pillHairline: some View {
        Rectangle()
            .fill(Color.white.opacity(0.14))
            .frame(height: 0.5)
            .padding(.horizontal, 16)
            .accessibilityHidden(true)
    }

    /// Les mêmes quatre boutons partout. Quand la pilule d'un groupe a
    /// grandi en rangées légendées, la rangée de base se légende aussi : une
    /// grille de quatre colonnes ne mélange pas colonnes muettes et légendées.
    private var baseRow: some View {
        let captioned = actionsPresentation == .rows
        return HStack(alignment: .top, spacing: 0) {
            moreButton(captioned: captioned)
                .frame(maxWidth: .infinity)
            muteButton(captioned: captioned)
                .frame(maxWidth: .infinity)
            // §7.1/§7.3 — sur Mac la sortie est celle du système : un
            // basculement de haut-parleur y serait un contrôle inerte.
            if !isOnMac {
                CallOutputPillButton(
                    isSpeaker: callManager.isSpeaker,
                    caption: captioned ? String(localized: "call.control.output.caption", defaultValue: "Sortie", bundle: .main) : nil,
                    diameter: Self.pillGlyphDiameter,
                    onToggleSpeaker: { callManager.toggleSpeaker() }
                )
                .frame(maxWidth: .infinity)
            }
            CallPillButton(
                symbol: "phone.down.fill",
                kind: .destructive,
                label: String(localized: "call.end", defaultValue: "Raccrocher", bundle: .main),
                caption: captioned ? String(localized: "call.end.caption", defaultValue: "Raccrocher", bundle: .main) : nil,
                hint: String(localized: "call.end.hint", defaultValue: "Termine l'appel en cours", bundle: .main),
                diameter: Self.pillGlyphDiameter
            ) {
                callManager.endCall()
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 10)
    }

    private func moreButton(captioned: Bool) -> some View {
        let isExpanded = controlsDisclosure.isExpanded
        return Button {
            withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85)) {
                controlsDisclosure = controlsDisclosure.toggled()
            }
            HapticFeedback.light()
        } label: {
            CallPillButtonLabel(
                symbol: "ellipsis",
                kind: isExpanded ? .active : .normal,
                caption: captioned ? CallControlsCopy.moreCaption : nil,
                diameter: Self.pillGlyphDiameter
            )
        }
        .buttonStyle(.plain)
        .pressable()
        .accessibilityLabel(CallControlsCopy.more)
        .accessibilityHint(CallControlsCopy.moreHint)
        .accessibilityValue(CallControlsCopy.moreValue(isExpanded: isExpanded))
    }

    func muteButton(captioned: Bool) -> some View {
        CallPillButton(
            symbol: callManager.isMuted ? "mic.slash.fill" : "mic.fill",
            kind: callManager.isMuted ? .active : .normal,
            label: callManager.isMuted
                ? String(localized: "call.control.unmute", defaultValue: "Réactiver le micro", bundle: .main)
                : String(localized: "call.control.mute", defaultValue: "Couper le micro", bundle: .main),
            caption: captioned ? String(localized: "call.control.mute.caption", defaultValue: "Micro", bundle: .main) : nil,
            hint: String(localized: "call.control.mute.hint", defaultValue: "Coupe votre micro pour le correspondant", bundle: .main),
            toggleState: callManager.isMuted,
            diameter: Self.pillGlyphDiameter
        ) {
            callManager.toggleMute()
        }
    }

    // MARK: - Group rows

    /// Une rangée légendée de quatre colonnes : les places vides gardent la
    /// grille, pour que « Micro » ne change pas de colonne d'un appel à l'autre.
    func actionRow(title: String, actions: [CallAction]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundColor(.white.opacity(0.6))
                .textCase(.uppercase)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 0) {
                ForEach(actions, id: \.self) { action in
                    actionButton(action, captioned: true)
                        .frame(maxWidth: .infinity)
                }
                ForEach(0..<max(0, CallActionSet.maxPerRow - actions.count), id: \.self) { _ in
                    Color.clear
                        .frame(maxWidth: .infinity, maxHeight: 1)
                        .accessibilityHidden(true)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .accessibilityElement(children: .contain)
    }

    // MARK: - Duo rails

    /// Deux rails de verre aux bords, à mi-hauteur. Sans légende visible : le
    /// nom de chaque rail et de chaque bouton est porté par l'accessibilité.
    var actionRails: some View {
        let actions = CallActionSet.resolve(actionContext)
        return HStack(alignment: .center) {
            actionRail(title: CallControlsCopy.myImage, actions: actions.myImage)
            Spacer(minLength: 0)
            actionRail(title: CallControlsCopy.theCall, actions: actions.theCall)
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    func actionRail(title: String, actions: [CallAction]) -> some View {
        VStack(spacing: 8) {
            ForEach(actions, id: \.self) { action in
                actionButton(action, captioned: false)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
        .callChromeGlass(in: Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }

    // MARK: - Actions

    @ViewBuilder
    func actionButton(_ action: CallAction, captioned: Bool) -> some View {
        let diameter = captioned ? Self.pillGlyphDiameter : Self.railGlyphDiameter
        switch action {
        case .camera:
            cameraActionButton(captioned: captioned, diameter: diameter)
        case .flipCamera:
            CallPillButton(
                symbol: "arrow.triangle.2.circlepath.camera.fill",
                kind: .normal,
                label: String(localized: "call.control.flipCamera", defaultValue: "Basculer la caméra avant/arrière", bundle: .main),
                caption: captioned ? CallControlsCopy.flipCaption : nil,
                hint: String(localized: "call.control.flipCamera.hint", defaultValue: "Bascule entre la caméra avant et arrière", bundle: .main),
                diameter: diameter
            ) {
                callManager.switchCamera()
                HapticFeedback.light()
            }
        case .cameraPicker:
            cameraPickerActionButton(captioned: captioned, diameter: diameter)
        case .effects:
            CallPillButton(
                symbol: showEffectsToolbar ? "xmark" : "camera.filters",
                kind: showEffectsToolbar || hasActiveEffects ? .active : .normal,
                label: String(localized: "call.filters.a11y", defaultValue: "Filtres vidéo", bundle: .main),
                caption: captioned ? CallControlsCopy.effectsCaption : nil,
                hint: String(localized: "call.filters.hint", defaultValue: "Ouvre ou ferme la barre de filtres vidéo", bundle: .main),
                toggleState: showEffectsToolbar,
                diameter: diameter
            ) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showEffectsToolbar.toggle()
                }
            }
        case .screenShare:
            CallPillButton(
                symbol: callManager.screenShare.isSharing ? "rectangle.on.rectangle.slash" : "rectangle.on.rectangle",
                kind: callManager.screenShare.isSharing ? .active : .normal,
                label: CallScreenShareCopy.label(isSharing: callManager.screenShare.isSharing),
                caption: captioned ? CallScreenShareCopy.caption : nil,
                hint: CallScreenShareCopy.hint,
                toggleState: callManager.screenShare.isSharing,
                diameter: diameter
            ) {
                screenSharePicker.toggle(controller: callManager.screenShare)
            }
        case .captions:
            captionsActionButton(captioned: captioned, diameter: diameter)
        case .recording:
            CallPillButton(
                symbol: callManager.recording.phase.isActive ? "stop.circle.fill" : "record.circle",
                kind: callManager.recording.phase.isActive ? .destructive : .normal,
                label: CallRecordingCopy.label(isActive: callManager.recording.phase.isActive),
                caption: captioned ? CallRecordingCopy.caption : nil,
                hint: CallRecordingCopy.hint,
                toggleState: callManager.recording.phase.isActive,
                diameter: diameter
            ) {
                _ = callManager.recording.phase.isActive ? callManager.recording.stop() : callManager.recording.request()
            }
        case .pictureInPicture:
            pictureInPictureActionButton(captioned: captioned, diameter: diameter)
        case .messages:
            CallPillButton(
                symbol: "bubble.left.and.bubble.right.fill",
                kind: .normal,
                label: String(localized: "call.openConversation", defaultValue: "Conversation", bundle: .main),
                caption: captioned ? CallControlsCopy.messagesCaption : nil,
                hint: String(localized: "call.openConversation.hint", defaultValue: "Ouvre la conversation en gardant l'appel actif", bundle: .main),
                diameter: diameter
            ) {
                openConversationDuringCall()
            }
        }
    }

    /// §5.4 — toujours présente, pour qu'un appel AUDIO passe en vidéo. Quand
    /// la couche de survie a mis la vidéo en pause sur un lien faible, le
    /// glyphe passe à l'ambre et le libellé le dit.
    private func cameraActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        let isPaused = videoAutoPaused
        let isEnabled = callManager.isVideoEnabled
        return CallPillButton(
            symbol: isPaused ? "video.slash.fill" : (isEnabled ? "video.fill" : "video.badge.plus"),
            kind: isPaused ? .warning : (isEnabled ? .active : .normal),
            label: isPaused
                ? String(localized: "call.control.video.paused", defaultValue: "Vidéo en pause (connexion faible)", bundle: .main)
                : (isEnabled
                    ? String(localized: "call.control.videoOff", defaultValue: "Désactiver la vidéo", bundle: .main)
                    : String(localized: "call.control.videoOn", defaultValue: "Activer la vidéo", bundle: .main)),
            caption: captioned
                ? (isPaused
                    ? String(localized: "call.control.video.paused.caption", defaultValue: "En pause", bundle: .main)
                    : String(localized: "call.control.video.caption", defaultValue: "Vidéo", bundle: .main))
                : nil,
            hint: isPaused
                ? String(localized: "call.control.video.paused.hint", defaultValue: "Touchez pour éteindre la caméra. La vidéo reprend automatiquement si la connexion s'améliore.", bundle: .main)
                : nil,
            toggleState: isEnabled,
            diameter: diameter
        ) {
            callManager.toggleVideo()
        }
        // Le partage d'écran remplace la piste caméra : la bascule attend.
        .disabled(callManager.screenShare.isSharing)
    }

    /// Mac / iPad avec caméra Continuity ou USB : un choix de caméra remplace
    /// le simple retournement avant/arrière.
    private func cameraPickerActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        Menu {
            ForEach(callManager.availableCameras) { camera in
                Button {
                    callManager.selectCamera(id: camera.id)
                } label: {
                    Label(camera.displayName, systemImage: callManager.selectedCameraId == camera.id ? "checkmark" : "camera")
                }
            }
        } label: {
            CallPillButtonLabel(
                symbol: "camera.badge.ellipsis",
                kind: .normal,
                caption: captioned ? String(localized: "call.control.camera.caption", defaultValue: "Caméra", bundle: .main) : nil,
                diameter: diameter
            )
        }
        .menuIndicator(.hidden)
        .accessibilityLabel(String(localized: "call.control.camera", defaultValue: "Choisir la caméra", bundle: .main))
    }

    /// PiP système : visible seulement si l'appel y est éligible (vidéo, piste
    /// distante, caméra distante allumée, appareil compatible) — ou déjà actif,
    /// pour pouvoir en sortir.
    private func pictureInPictureActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        let isActive = callManager.isSystemPiPActive
        return CallPillButton(
            symbol: isActive ? "pip.exit" : "pip.enter",
            kind: isActive ? .active : .normal,
            label: isActive
                ? String(localized: "call.control.pip.exit", defaultValue: "Quitter le mode Picture-in-Picture", bundle: .main)
                : String(localized: "call.control.pip", defaultValue: "Réduire en Picture-in-Picture", bundle: .main),
            caption: captioned ? String(localized: "call.control.pip.caption", defaultValue: "PiP", bundle: .main) : nil,
            diameter: diameter
        ) {
            if isActive {
                callManager.stopSystemPiP()
            } else {
                callManager.startSystemPiP()
            }
        }
    }
}
