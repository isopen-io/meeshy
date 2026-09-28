import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// #8394 — la pilule du bas, identique en audio, en vidéo et en groupe :
// (…) · Micro · Sortie · Fin. #8459 — la pilule est UN bloc de verre réel.
// #8550 — le (…) empile au-dessus de la rangée de base une rangée par
// famille (« Mon image », « L'appel »), défilant à l'horizontale, et un
// sous-menu s'ouvre DANS ce même bloc, au-dessus des familles. La
// conversation n'est pas une action : sa seule porte est l'en-tête (#8436).

/// Ré-arme l'auto-masquage (§7.3) à chaque révélation ET à chaque usage du (…).
struct AutoHideKey: Equatable {
    let isVisible: Bool
    let isExpanded: Bool
    let openPanel: CallControlsPanel?
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

    static var actions: String {
        String(localized: "call.actions", defaultValue: "Actions de l'appel", bundle: .main)
    }

    static var flipCaption: String {
        String(localized: "call.control.flipCamera.caption", defaultValue: "Retourner", bundle: .main)
    }

    static var effectsCaption: String {
        String(localized: "call.control.effects.caption", defaultValue: "Effets", bundle: .main)
    }

    static var closePanel: String {
        String(localized: "call.panel.close", defaultValue: "Fermer", bundle: .main)
    }

    static func familyTitle(_ family: CallActionFamily) -> String {
        switch family {
        case .myImage: return myImage
        case .theCall: return theCall
        }
    }
}

extension CallView {
    private static let pillGlyphDiameter: CGFloat = 48
    private static let rowGlyphDiameter: CGFloat = 44
    private static let rowCellWidth: CGFloat = 68

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
            showsVideo: callManager.isVideoUIActive
        )
    }

    var currentActionSet: CallActionSet {
        CallActionSet.resolve(actionContext)
    }

    var actionsPresentation: CallActionsPresentation {
        controlsDisclosure.presentation
    }

    /// Le déploiement du (…) : un ressort, ou un simple fondu avec Réduire
    /// les animations — jamais une bascule sèche.
    var disclosureAnimation: Animation {
        reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.85)
    }

    // MARK: - Pill

    private static let pillShape = RoundedRectangle(cornerRadius: 32, style: .continuous)

    /// Les rangées naissent du bas du bloc, là où est le (…) ; avec Réduire
    /// les animations elles apparaissent en fondu, sans rien déplacer.
    private var unfoldTransition: AnyTransition {
        reduceMotion
            ? .opacity
            : .opacity.combined(with: .scale(scale: 0.94, anchor: .bottom))
    }

    /// UN bloc de verre : le sous-menu ouvert, PUIS les familles, PUIS (en
    /// groupe) les sous-titres, PUIS la rangée de base. Le verre enveloppe le
    /// tout et grandit avec lui (#8459, #8550).
    var callControlsPill: some View {
        let actions = currentActionSet
        return VStack(spacing: 0) {
            if case .rows(let panel) = actionsPresentation {
                VStack(spacing: 0) {
                    unfoldedRows {
                        if let panel {
                            panelRows(panel)
                            pillHairline
                        }
                        familyRows(actions)
                    }
                    pillHairline
                }
                .transition(unfoldTransition)
            }
            if isGroupStage && showTranscript {
                captionsBand(hasOwnGlass: false)
                    .padding(.leading, 14)
                    .padding(.trailing, 4)
                    .padding(.top, 6)
                pillHairline
            }
            baseRow
        }
        .clipShape(Self.pillShape)
        .callControlsGlass(in: Self.pillShape)
        .frame(maxWidth: 440)
        .animation(disclosureAnimation, value: controlsDisclosure)
        .adaptiveOnChange(of: actions) { _, newActions in
            controlsDisclosure = controlsDisclosure.reconciled(with: newActions)
        }
    }

    var pillHairline: some View {
        Rectangle()
            .fill(Color.white.opacity(0.14))
            .frame(height: 0.5)
            .padding(.horizontal, 16)
            .accessibilityHidden(true)
    }

    private func unfoldedRows<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        let rows = VStack(spacing: 0) { content() }
        return ViewThatFits(in: .vertical) {
            rows
            ScrollView(.vertical, showsIndicators: false) { rows }
        }
    }

    /// Les mêmes quatre boutons partout, légendés dès que les rangées
    /// légendées sont déployées au-dessus d'eux.
    private var baseRow: some View {
        let captioned = controlsDisclosure.isExpanded
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
            withAnimation(disclosureAnimation) {
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
        .buttonStyle(CallPressButtonStyle())
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

    // MARK: - Family rows

    private func familyRows(_ actions: CallActionSet) -> some View {
        VStack(spacing: 0) {
            ForEach(actions.familyRows) { row in
                CallPillRow(title: CallControlsCopy.familyTitle(row.family)) {
                    ForEach(row.actions, id: \.self) { action in
                        actionButton(action)
                            .frame(width: Self.rowCellWidth)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CallControlsCopy.actions)
    }

    // MARK: - Actions

    func actionButton(_ action: CallAction) -> some View {
        actionButtonBody(action, captioned: true)
    }

    @ViewBuilder
    private func actionButtonBody(_ action: CallAction, captioned: Bool) -> some View {
        let diameter = Self.rowGlyphDiameter
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
                symbol: "camera.filters",
                kind: controlsDisclosure.isOpen(.effects) || hasActiveEffects ? .active : .normal,
                label: String(localized: "call.filters.a11y", defaultValue: "Filtres vidéo", bundle: .main),
                caption: captioned ? CallControlsCopy.effectsCaption : nil,
                hint: String(localized: "call.filters.hint", defaultValue: "Ouvre ou ferme la barre de filtres vidéo", bundle: .main),
                toggleState: controlsDisclosure.isOpen(.effects),
                diameter: diameter
            ) {
                togglePanel(.effects)
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
            recordingActionButton(captioned: captioned, diameter: diameter)
        case .pictureInPicture:
            pictureInPictureActionButton(captioned: captioned, diameter: diameter)
        case .addPeople:
            addPeopleActionButton(captioned: captioned, diameter: diameter)
        case .react:
            reactActionButton(captioned: captioned, diameter: diameter)
        case .capture:
            captureActionButton(captioned: captioned, diameter: diameter)
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
            hint: isActive ? nil : String(localized: "call.control.pip.hint", defaultValue: "Ferme l'écran d'appel et garde la vidéo dans une fenêtre flottante", bundle: .main),
            diameter: diameter
        ) {
            if isActive {
                callManager.stopSystemPiP()
            } else {
                enterSystemPiP()
            }
        }
    }
}
