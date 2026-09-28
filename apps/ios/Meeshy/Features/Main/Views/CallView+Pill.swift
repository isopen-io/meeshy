import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// #8394 — la pilule du bas, identique en audio, en vidéo et en groupe :
// (…) · Micro · Sortie · Fin. #8432 — chaque bouton est un bouton de VERRE
// interactif, et le (…) déploie les actions AU-DESSUS de la pilule : en duo,
// une rangée de verre (deux si elle ne tient pas) ; en groupe, deux rangées
// légendées de quatre colonnes. Sous iOS 26 les actions naissent du verre du
// (…) (`glassEffectID`) ; avant iOS 26 et avec Réduire les animations, elles
// apparaissent en fondu. La conversation n'est pas une action : sa seule
// porte est l'en-tête (#8436).

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

    static var actions: String {
        String(localized: "call.actions", defaultValue: "Actions de l'appel", bundle: .main)
    }

    static var flipCaption: String {
        String(localized: "call.control.flipCamera.caption", defaultValue: "Retourner", bundle: .main)
    }

    static var effectsCaption: String {
        String(localized: "call.control.effects.caption", defaultValue: "Effets", bundle: .main)
    }
}

extension CallView {
    private static let pillGlyphDiameter: CGFloat = 48
    private static let rowGlyphDiameter: CGFloat = 44

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
            canPictureInPicture: callManager.canActivateSystemPiP || callManager.isSystemPiPActive
        )
    }

    var actionsPresentation: CallActionsPresentation {
        controlsDisclosure.presentation(isGroup: isGroupStage)
    }

    /// Le déploiement du (…) : un ressort, ou un simple fondu avec Réduire
    /// les animations — jamais une bascule sèche.
    private var disclosureAnimation: Animation {
        reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.35, dampingFraction: 0.85)
    }

    // MARK: - Pill

    /// Les actions déployées, PUIS la pilule : les actions montent au-dessus
    /// du bloc qui contrôle l'appel, en duo comme en groupe (#8432).
    var callControlsPill: some View {
        let actions = CallActionSet.resolve(actionContext)
        return VStack(spacing: 10) {
            switch actionsPresentation {
            case .hidden:
                EmptyView()
            case .row:
                duoActionRows(actions)
                    .transition(.opacity)
            case .rows:
                groupActionRows(actions)
                    .transition(.opacity)
            }
            controlsPill
        }
        .frame(maxWidth: 440)
        .animation(disclosureAnimation, value: controlsDisclosure)
    }

    /// Les quatre boutons de verre, sur un voile non vitré. #8396 — en
    /// groupe, les sous-titres se posent en haut de ce voile.
    private var controlsPill: some View {
        VStack(spacing: 0) {
            if isGroupStage && showTranscript {
                captionsBand(hasOwnGlass: false)
                    .padding(.leading, 14)
                    .padding(.trailing, 4)
                    .padding(.top, 6)
                pillHairline
            }
            baseRow
        }
        .callLegibilityVeil(in: RoundedRectangle(cornerRadius: 32, style: .continuous))
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
            .callGlassMorph(id: "call.more", in: callGlassNamespace)
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

    /// Groupe : « mon image » puis « l'appel », deux rangées légendées sur un
    /// voile, au-dessus de la pilule.
    private func groupActionRows(_ actions: CallActionSet) -> some View {
        VStack(spacing: 0) {
            actionRow(title: CallControlsCopy.myImage, actions: actions.myImage)
            pillHairline
            actionRow(title: CallControlsCopy.theCall, actions: actions.theCall)
        }
        .callLegibilityVeil(in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

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

    // MARK: - Duo row

    /// Duo : une rangée de boutons de verre sans légende au-dessus de la
    /// pilule, ou deux quand elle ne tiendrait pas (`CallActionSet.duoRows`).
    /// Le nom de chaque bouton est porté par l'accessibilité.
    private func duoActionRows(_ actions: CallActionSet) -> some View {
        VStack(spacing: 8) {
            ForEach(Array(actions.duoRows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 12) {
                    ForEach(row, id: \.self) { action in
                        actionButton(action, captioned: false)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .callLegibilityVeil(in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CallControlsCopy.actions)
    }

    // MARK: - Actions

    /// Chaque action porte l'identité de verre qui la fait naître du (…).
    func actionButton(_ action: CallAction, captioned: Bool) -> some View {
        actionButtonBody(action, captioned: captioned)
            .callGlassMorph(id: "call.action.\(action.rawValue)", in: callGlassNamespace)
    }

    @ViewBuilder
    private func actionButtonBody(_ action: CallAction, captioned: Bool) -> some View {
        let diameter = captioned ? Self.pillGlyphDiameter : Self.rowGlyphDiameter
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
        case .addPeople:
            addPeopleActionButton(captioned: captioned, diameter: diameter)
        case .react:
            reactActionButton(captioned: captioned, diameter: diameter)
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
