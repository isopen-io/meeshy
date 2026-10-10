import SwiftUI
import MeeshyUI

// #8626 — les commandes de MA caméra (retourner, couper, effets, écran) vivent
// avec ma vignette ; quand mon image passe en plein écran, en haut au centre.
// Le (…) ne les porte que sans vignette (`CallCameraRail.placement`) : jamais
// deux boutons pour la même action. #8747 — AUTOUR de la vignette, jamais
// dedans : Effets · Écran au-dessus, Retourner · Caméra en dessous, chaque
// bouton un disque de Liquid Glass interactif (iOS 26), comme la flèche de
// l'en-tête.

extension CallView {
    private static let cameraControlsTopOffset: CGFloat = 56
    /// La rangée de l'en-tête (flèche, conversation, durée) sous `chromeTopInset`.
    private static let selfControlsHeaderHeight: CGFloat = 44
    /// La pilule repliée : un bouton de 48 pt et ses 10 pt de marge verticale.
    private static let selfControlsPillHeight: CGFloat = 68

    var isMyImageFullScreen: Bool {
        CallCameraRail.isMyImageFullScreen(
            isGroupStage: isGroupStage,
            isSelfFeatured: isSelfFeatured,
            isLocalPrimary: effectiveSwapStreams
        )
    }

    /// La vignette perso du duo porte-t-elle MON image ? Même garde que
    /// `duoOverlays`, qui la monte.
    private var showsMyImageTile: Bool {
        !isGroupStage && callManager.isVideoEnabled && callManager.hasLocalVideoTrack && !isLiveFrameShown
    }

    var cameraControlsPlacement: CallCameraControlsPlacement {
        CallCameraRail.placement(isMyImageFullScreen: isMyImageFullScreen, showsMyImageTile: showsMyImageTile)
    }

    /// Mon image en plein écran : la rangée se pose en haut au centre, sous
    /// l'en-tête et la zone sûre ; le zoom reste réservé à ce plein écran.
    @ViewBuilder
    var cameraRail: some View {
        let actions = CallCameraRail.actions(from: currentActionSet)
        if cameraControlsPlacement == .topCenter && !actions.isEmpty {
            VStack(spacing: MeeshySpacing.xxs) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    ForEach(actions, id: \.self) { action in
                        railActionButton(action)
                    }
                }
                CallZoomRailSlot(placement: .topCenter)
            }
            .background(CallCameraZoomAccessibilityElement())
            .padding(.vertical, MeeshySpacing.xsPlus)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .callChromeGlass(in: Capsule())
            .accessibilityElement(children: .contain)
            .accessibilityLabel(CallControlsCopy.cameraRail)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.top, Self.chromeTopInset + Self.cameraControlsTopOffset)
            .callChromeVisibility(CallCameraRail.isShown(.topCenter, at: cameraControlsPlacement, chrome: chromeVisibility))
            .transition(.opacity)
        }
    }

    /// La zone où une rangée de la vignette a le droit de vivre : l'écran
    /// moins l'en-tête, la pilule et les bords. Sert aussi le repos de la
    /// vignette (`pipCenter`), pour que les rangées tiennent à leur côté.
    func selfTileControlsBounds(in container: CGSize, safeArea: EdgeInsets) -> CGRect {
        let top = Self.chromeTopInset + Self.selfControlsHeaderHeight
        let bottom = Self.chromeBottomInset + Self.selfControlsPillHeight
        let leading = safeArea.leading + CallSelfTileControlsPlacement.edgeGap
        let trailing = safeArea.trailing + CallSelfTileControlsPlacement.edgeGap
        return CGRect(
            x: leading,
            y: top,
            width: max(0, container.width - leading - trailing),
            height: max(0, container.height - top - bottom)
        )
    }

    /// Mon image dans la vignette : ses commandes AUTOUR d'elle, posées par
    /// `CallSelfTileControlsPlacement` depuis le cadre de repos, puis
    /// décalées du glissé en cours — elles suivent le doigt sans changer de
    /// côté, et le palier du pincement par la taille du cadre.
    @ViewBuilder
    func selfTileControlRows(tile: CGRect, container: CGSize, safeArea: EdgeInsets, dragOffset: CGSize) -> some View {
        let rows = CallCameraRail.selfTileRows(CallCameraRail.actions(from: currentActionSet))
        if cameraControlsPlacement == .selfTile && !rows.isEmpty {
            let resting = CallSelfTileControlsPlacement.layout(
                tile: tile,
                bounds: selfTileControlsBounds(in: container, safeArea: safeArea),
                effectsCount: rows.effects.count,
                cameraCount: rows.camera.count
            )
            let layout = CallSelfTileControlsPlacement.following(resting, offset: dragOffset, within: CGRect(origin: .zero, size: container))
            ZStack {
                if let effects = layout.effects {
                    selfTileControlRow(rows.effects)
                        .position(x: effects.frame.midX, y: effects.frame.midY)
                }
                if let camera = layout.camera {
                    selfTileControlRow(rows.camera)
                        .position(x: camera.frame.midX, y: camera.frame.midY)
                }
            }
            .callChromeVisibility(CallCameraRail.isShown(.selfTile, at: cameraControlsPlacement, chrome: chromeVisibility))
            .transition(.opacity)
        }
    }

    /// Le bouton de zoom reste DANS la vignette, en haut à droite : les
    /// rangées l'ont quittée, la place est libre.
    @ViewBuilder
    func selfTileZoomSlot(tileSize: CGSize) -> some View {
        if cameraControlsPlacement == .selfTile {
            CallZoomRailSlot(placement: .selfTile, tileSize: tileSize)
                .callChromeVisibility(CallCameraRail.isShown(.selfTile, at: cameraControlsPlacement, chrome: chromeVisibility))
                .transition(.opacity)
        }
    }

    /// Une rangée : ses disques de verre voisins se fondent entre eux.
    private func selfTileControlRow(_ actions: [CallAction]) -> some View {
        AdaptiveGlassContainer(spacing: CallSelfTileControlsPlacement.buttonSpacing) {
            HStack(spacing: CallSelfTileControlsPlacement.buttonSpacing) {
                ForEach(actions, id: \.self) { action in
                    selfTileControlButton(action)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CallControlsCopy.cameraRail)
    }

    @ViewBuilder
    private func selfTileControlButton(_ action: CallAction) -> some View {
        switch action {
        case .effects:
            CallSelfTileControlButton(
                symbol: "camera.filters",
                isActive: hasActiveEffects,
                label: CallControlsCopy.effects,
                hint: CallControlsCopy.effectsHint
            ) {
                enterMode(.effects)
            }
        case .screenShare:
            CallSelfTileControlButton(
                symbol: callManager.screenShare.isSharing ? "rectangle.on.rectangle.slash" : "rectangle.on.rectangle",
                isActive: callManager.screenShare.isSharing,
                label: CallScreenShareCopy.label(isSharing: callManager.screenShare.isSharing),
                hint: CallScreenShareCopy.hint,
                toggleState: callManager.screenShare.isSharing
            ) {
                if callManager.screenShare.isSharing { HapticFeedback.light() }
                screenSharePicker.toggle(controller: callManager.screenShare)
            }
        case .flipCamera:
            CallSelfTileControlButton(
                symbol: "arrow.triangle.2.circlepath.camera.fill",
                label: CallMyImageCopy.flip,
                hint: CallMyImageCopy.flipHint
            ) {
                callManager.switchCamera()
            }
        case .cameraPicker:
            selfTileCameraPicker
        case .camera:
            selfTileCameraToggle
        default:
            EmptyView()
        }
    }

    /// Allumer / éteindre : l'état bascule tout de suite (`toggleVideo` est
    /// optimiste), la vignette et ses rangées s'effacent avec la caméra.
    private var selfTileCameraToggle: some View {
        let isPaused = videoAutoPaused
        let isEnabled = callManager.isVideoEnabled
        return CallSelfTileControlButton(
            symbol: isPaused ? "video.slash.fill" : (isEnabled ? "video.fill" : "video.badge.plus"),
            glyphColor: isPaused ? MeeshyColors.warning : .white,
            label: CallMyImageCopy.video(isEnabled: isEnabled, isPaused: isPaused),
            hint: isPaused ? CallMyImageCopy.videoPausedHint : nil,
            toggleState: isEnabled
        ) {
            HapticFeedback.light()
            callManager.toggleVideo()
        }
        // Le partage d'écran remplace la piste caméra : la bascule attend.
        .disabled(callManager.screenShare.isSharing)
    }

    /// Mac / iPad avec caméra Continuity ou USB : le choix de caméra remplace
    /// le simple retournement, à la même place.
    private var selfTileCameraPicker: some View {
        Menu {
            ForEach(callManager.availableCameras) { camera in
                Button {
                    callManager.selectCamera(id: camera.id)
                } label: {
                    Label(camera.displayName, systemImage: callManager.selectedCameraId == camera.id ? "checkmark" : "camera")
                }
            }
        } label: {
            CallSelfTileControlGlyph(symbol: "camera.badge.ellipsis")
        }
        .menuIndicator(.hidden)
        .accessibilityLabel(CallMyImageCopy.cameraPicker)
    }

    func tapCameraMenu(_ tap: CallCameraFoldedTap) {
        let next = CallCameraRail.foldedMenu(isOpen: isCameraMenuUnfolded, after: tap)
        guard next != isCameraMenuUnfolded else { return }
        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85)) {
            isCameraMenuUnfolded = next
        }
        if tap == .button { HapticFeedback.light() }
    }
}

/// #8747 — un bouton des rangées de ma vignette : l'action part au toucher,
/// l'enfoncement passe par `CallPressButtonStyle` (aucun geste posé), la
/// cible fait 44 pt.
struct CallSelfTileControlButton: View {
    let symbol: String
    var isActive: Bool = false
    var glyphColor: Color = .white
    let label: String
    var hint: String? = nil
    /// `nil` : le bouton n'est pas une bascule (Retourner, Effets).
    var toggleState: Bool? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            CallSelfTileControlGlyph(symbol: symbol, isActive: isActive, glyphColor: glyphColor)
        }
        .buttonStyle(CallPressButtonStyle())
        .accessibilityLabel(label)
        .optionalAccessibilityHint(hint)
        .toggleStateAccessibility(isToggle: toggleState != nil, isActive: toggleState ?? false)
    }
}

/// Le disque : un Liquid Glass interactif sous iOS 26, le matériau avant
/// (`callControlGlass`). Doctrine 82i — le glyphe est borné par un cadre
/// fixe dans un cercle fixe : sa taille ne suit pas le Dynamic Type.
struct CallSelfTileControlGlyph: View {
    let symbol: String
    var isActive: Bool = false
    var glyphColor: Color = .white

    private static let glyphSide: CGFloat = 20

    var body: some View {
        Image(systemName: symbol)
            .resizable()
            .scaledToFit()
            .fontWeight(.semibold)
            .foregroundStyle(glyphColor)
            .frame(width: Self.glyphSide, height: Self.glyphSide)
            .callControlGlass(diameter: CallSelfTileControlsPlacement.buttonSide, isActive: isActive, tint: MeeshyColors.indigo500)
            .contentShape(Circle())
            .accessibilityHidden(true)
    }
}

/// Les libellés des commandes de MA caméra — mêmes clés que les boutons du
/// (…) (`CallView+Pill.swift`), qui les portent quand aucune vignette ne
/// montre mon image.
enum CallMyImageCopy {
    static var flip: String {
        String(localized: "call.control.flipCamera", defaultValue: "Basculer la caméra avant/arrière", bundle: .main)
    }

    static var flipHint: String {
        String(localized: "call.control.flipCamera.hint", defaultValue: "Bascule entre la caméra avant et arrière", bundle: .main)
    }

    static func video(isEnabled: Bool, isPaused: Bool) -> String {
        if isPaused {
            return String(localized: "call.control.video.paused", defaultValue: "Vidéo en pause (connexion faible)", bundle: .main)
        }
        return isEnabled
            ? String(localized: "call.control.videoOff", defaultValue: "Désactiver la vidéo", bundle: .main)
            : String(localized: "call.control.videoOn", defaultValue: "Activer la vidéo", bundle: .main)
    }

    static var videoPausedHint: String {
        String(localized: "call.control.video.paused.hint", defaultValue: "Touchez pour éteindre la caméra. La vidéo reprend automatiquement si la connexion s'améliore.", bundle: .main)
    }

    static var cameraPicker: String {
        String(localized: "call.control.camera", defaultValue: "Choisir la caméra", bundle: .main)
    }
}
