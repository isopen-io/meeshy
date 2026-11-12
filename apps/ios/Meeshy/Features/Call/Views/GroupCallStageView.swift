import SwiftUI
import MeeshySDK
import MeeshyUI

/// Une tuile de la grille d'un appel de groupe (#3585) — ce que la vue dessine,
/// dérivé du registre du maillage et de l'état local.
struct GroupCallStageTile: Equatable, Identifiable, Sendable {
    let id: String
    /// L'identifiant de la PERSONNE (le mien pour ma tuile) : sa couleur, la
    /// même que sur ses sous-titres (#8396).
    let colorKey: String
    let displayName: String
    let avatarURL: String?
    let isLocal: Bool
    let isSpeaking: Bool
    let isMicMuted: Bool
    let showsVideo: Bool
    let isScreenSharing: Bool
    let isReconnecting: Bool

    var accentHex: String { CallSpeakerColor.hex(for: colorKey) }
}

enum GroupCallStage {
    static let localTileId = "group-call-local"

    /// La grille ne remplace l'écran 1:1 qu'à partir de DEUX membres distants :
    /// avec le seul pair principal, `CallView` est déjà la bonne disposition.
    /// Un membre tenu par le maillage (le principal parti, #9085) n'a que la
    /// grille pour être vu : l'écran 1:1 ne montre que le principal.
    static func isShown(isMeshActive: Bool, roster: GroupCallRoster) -> Bool {
        isMeshActive && (roster.members.count >= 2 || roster.members.contains { !$0.isPrimary })
    }

    /// Les membres dans l'ordre d'arrivée, puis MOI en dernier (P11.3) : la grille
    /// ne se réagence jamais quand quelqu'un parle — le halo suffit à le montrer.
    static func tiles(
        roster: GroupCallRoster,
        speakingUserIds: Set<String>,
        localName: String,
        isLocalMicMuted: Bool,
        isLocalVideoEnabled: Bool,
        isPrimaryVideoActive: Bool
    ) -> [GroupCallStageTile] {
        let local = GroupCallStageTile(
            id: localTileId,
            colorKey: roster.localUserId,
            displayName: localName,
            avatarURL: nil,
            isLocal: true,
            isSpeaking: speakingUserIds.contains(roster.localUserId),
            isMicMuted: isLocalMicMuted,
            showsVideo: isLocalVideoEnabled,
            isScreenSharing: false,
            isReconnecting: false
        )
        let remote = roster.members.map { member in
            GroupCallStageTile(
                id: member.userId,
                colorKey: member.userId,
                displayName: member.displayName,
                avatarURL: member.avatarURL,
                isLocal: false,
                isSpeaking: speakingUserIds.contains(member.userId),
                isMicMuted: member.isMicMuted,
                showsVideo: member.isPrimary ? isPrimaryVideoActive : (member.isCameraOn || member.isScreenSharing),
                isScreenSharing: member.isScreenSharing,
                isReconnecting: member.link == .reconnecting
            )
        }
        return remote + [local]
    }

    static func tiles(mesh: GroupCallMeshCoordinator, callManager: CallManager) -> [GroupCallStageTile] {
        tiles(
            roster: mesh.roster,
            speakingUserIds: mesh.speakingUserIds,
            localName: String(localized: "call.group.tile.you", defaultValue: "Vous", bundle: .main),
            isLocalMicMuted: callManager.isMuted,
            isLocalVideoEnabled: callManager.isVideoEnabled,
            isPrimaryVideoActive: callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled
        )
    }

    static func track(for tile: GroupCallStageTile, mesh: GroupCallMeshCoordinator, callManager: CallManager) -> Any? {
        tile.isLocal ? callManager.localVideoTrack : mesh.videoTrack(for: tile.id)
    }
}

/// La scène d'un appel de groupe, posée par `CallView` ENTRE son en-tête et sa
/// pilule (#8276) : elle suit la disposition réelle de l'écran, jamais des
/// marges fixes. Grille par défaut ; toucher une vignette la met à la une, un
/// partage d'écran y monte seul (#8395).
struct GroupCallStageView: View {
    @ObservedObject var mesh: GroupCallMeshCoordinator
    @ObservedObject var callManager: CallManager
    @Binding var isFullScreen: Bool
    /// #8735 — chrome masqué, toucher une vignette le RALLUME (comme partout
    /// sur la scène) ; chrome visible, elle se met à la une.
    var isChromeVisible = true
    /// U1.10 · #8550 — la capsule de la une se range AVEC les contrôles, mais survit au plein
    /// écran : c'est par elle qu'on en sort (`CallChromeElement.featuredCapsule`).
    var chrome = CallChromeVisibility()
    var onStageTap: () -> Void = {}
    var onSelfFeaturedChange: (Bool) -> Void = { _ in }

    /// Le choix LOCAL (jamais partagé) : une vignette épinglée, ou « Grille ».
    @State private var choice: GroupCallSpotlightChoice?
    /// #8438 — la personne que l'admin s'apprête à retirer (confirmation).
    @State var pendingRemoval: GroupCallStageTile?
    @State var isRemovalPresented = false
    @State private var zoom: CGFloat = 1
    @GestureState private var pinch: CGFloat = 1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.locale) private var locale
    @Environment(\.layoutDirection) private var layoutDirection
    @Namespace private var tileSpace

    static let spacing: CGFloat = 8
    /// Le bandeau des autres : une rangée en portrait, une colonne en paysage.
    static let rowStripHeight: CGFloat = 112
    static let columnStripWidth: CGFloat = 128
    /// La distance du haut de la scène au haut de l'écran, par excès : rangée, la capsule la franchit toute.
    private static let capsuleStowReach: CGFloat = 60

    private var isCapsuleVisible: Bool { chrome.isVisible(.featuredCapsule) }

    var body: some View {
        let current = tiles
        let focus = GroupCallSpotlight.focus(tiles: current, choice: choice)
        GeometryReader { proxy in
            switch focus {
            case .grid:
                grid(current, in: proxy.size)
            case .spotlight(let tileId, let isScreenShare):
                spotlight(current, tileId: tileId, isScreenShare: isScreenShare, in: proxy.size, stageFrame: proxy.frame(in: .global))
            }
        }
        .animation(stageAnimation, value: focus)
        .adaptiveOnChange(of: GroupCallSpotlight.sharerId(in: current)) { oldSharer, newSharer in
            choice = GroupCallSpotlight.choice(choice, afterSharerChangedFrom: oldSharer, to: newSharer)
        }
        .adaptiveOnChange(of: focus) { _, newFocus in
            zoom = 1
            if newFocus == .grid { isFullScreen = false }
        }
        .adaptiveOnChange(of: GroupCallSpotlight.featuresLocal(focus), initial: true) { _, isFeatured in
            onSelfFeaturedChange(isFeatured)
        }
        .onDisappear { onSelfFeaturedChange(false) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "call.group.stage", defaultValue: "Participants à l'appel", bundle: .main))
        .removalConfirmation(pendingRemoval: pendingRemoval, isPresented: $isRemovalPresented, controls: callManager.controls)
    }

    private var tiles: [GroupCallStageTile] {
        GroupCallStage.tiles(mesh: mesh, callManager: callManager)
    }

    private func track(for tile: GroupCallStageTile) -> Any? {
        GroupCallStage.track(for: tile, mesh: mesh, callManager: callManager)
    }

    /// P14.10 — la vignette choisie grandit depuis sa case et les autres glissent
    /// vers le bandeau ; sous « Réduire les animations », un fondu court.
    private var stageAnimation: Animation {
        GroupCallStageMotion.movesTiles(reduceMotion: reduceMotion)
            ? .spring(response: 0.4, dampingFraction: 0.85)
            : .easeInOut(duration: GroupCallStageMotion.fadeDuration)
    }

    private func choose(_ newChoice: GroupCallSpotlightChoice) {
        HapticFeedback.light()
        withAnimation(stageAnimation) {
            choice = newChoice
        }
    }

    /// Une identité par personne, la même dans la grille, à la une et dans le
    /// bandeau : la géométrie suit la vignette d'une disposition à l'autre.
    @ViewBuilder
    private func sharingGeometry<Content: View>(of tile: GroupCallStageTile, @ViewBuilder _ content: () -> Content) -> some View {
        if GroupCallStageMotion.movesTiles(reduceMotion: reduceMotion) {
            content().matchedGeometryEffect(id: tile.id, in: tileSpace)
        } else {
            content()
        }
    }

    // MARK: - Grille

    private func grid(_ current: [GroupCallStageTile], in size: CGSize) -> some View {
        let layout = GroupCallGridLayout.layout(tileCount: current.count, isLandscape: size.width > size.height)
        let width = max(0, (size.width - Self.spacing * CGFloat(layout.columns - 1)) / CGFloat(layout.columns))
        let height = max(0, (size.height - Self.spacing * CGFloat(layout.rows - 1)) / CGFloat(layout.rows))
        let columns = Array(repeating: GridItem(.fixed(width), spacing: Self.spacing), count: layout.columns)
        return LazyVGrid(columns: columns, spacing: Self.spacing) {
            ForEach(current) { tile in
                selectableTile(tile)
                    .frame(width: width, height: height)
            }
        }
        .frame(width: size.width, height: size.height, alignment: .center)
        .background(stageTapTarget)
    }

    private var stageTapTarget: some View {
        Color.clear
            .contentShape(Rectangle())
            .onTapGesture { onStageTap() }
            .accessibilityHidden(true)
    }

    private func tapTile(_ tile: GroupCallStageTile) {
        switch GroupStageTapRule.outcome(isChromeVisible: isChromeVisible) {
        case .revealChrome: onStageTap()
        case .spotlight: choose(.tile(tile.id))
        }
    }

    private func selectableTile(_ tile: GroupCallStageTile) -> some View {
        sharingGeometry(of: tile) {
            GroupCallTileView(tile: tile, track: track(for: tile), intendedFront: callManager.isUsingFrontCamera)
                .contentShape(Rectangle())
                .onTapGesture { tapTile(tile) }
                .accessibilityAddTraits(.isButton)
                .accessibilityHint(String(localized: "call.group.spotlight.hint", defaultValue: "Touchez pour mettre à la une", bundle: .main))
                .accessibilityAction { choose(.tile(tile.id)) }
                .moderationMenu(for: tile, controls: callManager.controls, pendingRemoval: $pendingRemoval, isRemovalPresented: $isRemovalPresented)
        }
    }

    // MARK: - À la une

    @ViewBuilder
    private func spotlight(_ current: [GroupCallStageTile], tileId: String, isScreenShare: Bool, in size: CGSize, stageFrame: CGRect) -> some View {
        let others = current.filter { $0.id != tileId }
        let isLandscape = size.width > size.height
        let spacing = isFullScreen ? 0 : Self.spacing
        if let featured = current.first(where: { $0.id == tileId }) {
            if isLandscape {
                HStack(spacing: spacing) {
                    featuredTile(featured, isScreenShare: isScreenShare)
                    if !isFullScreen {
                        filmstrip(others, axis: .vertical)
                            .frame(width: Self.columnStripWidth)
                            .transition(stripExit(toward: .trailing, extent: Self.columnStripWidth, stage: stageFrame))
                    }
                }
            } else {
                VStack(spacing: spacing) {
                    featuredTile(featured, isScreenShare: isScreenShare)
                    if !isFullScreen {
                        filmstrip(others, axis: .horizontal)
                            .frame(height: Self.rowStripHeight)
                            .transition(stripExit(toward: .bottom, extent: Self.rowStripHeight, stage: stageFrame))
                    }
                }
            }
        }
    }

    /// U2.10 · #17726 — le bandeau des autres entre par son bord de l'écran et en sort par lui (bas
    /// en portrait, côté en paysage), jusqu'au bord MESURÉ de la fenêtre ; « Réduire les
    /// animations » le remplace par un fondu.
    private func stripExit(toward edge: Edge, extent: CGFloat, stage: CGRect) -> AnyTransition {
        guard GroupCallStageMotion.movesTiles(reduceMotion: reduceMotion) else { return .opacity }
        let travel = GroupCallStageMotion.stripTravel(toward: edge, stage: stage, window: DeviceLayout.windowSize, stripExtent: extent, isRightToLeft: layoutDirection == .rightToLeft)
        return AnyTransition.modifier(active: GroupCallStripSlide(travel: travel), identity: GroupCallStripSlide(travel: .zero))
            .combined(with: .opacity)
    }

    private func featuredTile(_ tile: GroupCallStageTile, isScreenShare: Bool) -> some View {
        sharingGeometry(of: tile) {
            GroupCallTileView(
                tile: tile,
                track: track(for: tile),
                intendedFront: callManager.isUsingFrontCamera,
                contentMode: isScreenShare ? .scaleAspectFit : .scaleAspectFill,
                screenTitle: isScreenShare ? CallScreenShareCopy.screenOf(name: tile.displayName) : nil,
                zoom: isScreenShare ? GroupCallSpotlight.clampedZoom(zoom * pinch) : 1
            )
            .gesture(zoomGesture, including: isScreenShare ? .all : .subviews)
            .callCameraZoom(isEnabled: tile.isLocal && tile.showsVideo)
            // #8735 — le double toucher n'existe que pour un écran partagé : posé
            // partout, il faisait attendre CHAQUE toucher simple (rallumer les
            // commandes) le délai d'un éventuel second toucher.
            .gesture(zoomResetTap, including: isScreenShare ? .all : .subviews)
            .onTapGesture { onStageTap() }
            .accessibilityAction(named: Text(String(localized: "call.stage.controls.toggle.a11y", defaultValue: "Afficher ou masquer les contrôles", bundle: .main))) { onStageTap() }
            .overlay(alignment: .topLeading) {
                if isScreenShare {
                    CallScreenShareChip(text: GroupCallSpotlight.featuredChipText(title: CallScreenShareCopy.screenOf(name: tile.displayName), zoom: zoom * pinch, locale: locale))
                        .padding(MeeshySpacing.sm)
                }
            }
            .overlay(alignment: .topTrailing) {
                spotlightControls
                    .padding(MeeshySpacing.sm)
                    .modifier(CallEdgeStow(edge: .top, margin: CallView.chromeTopInset + Self.capsuleStowReach, isVisible: isCapsuleVisible, reduceMotion: reduceMotion))
                    .callChromeVisibility(isCapsuleVisible)
            }
        }
    }

    private var zoomResetTap: some Gesture {
        TapGesture(count: 2).onEnded {
            withAnimation(.easeOut(duration: reduceMotion ? CallChromeStow.reducedFadeDuration : 0.2)) { zoom = 1 }
        }
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .updating($pinch) { value, state, _ in state = value }
            .onEnded { value in zoom = GroupCallSpotlight.clampedZoom(zoom * value) }
    }

    /// Grille (revenir) et plein écran, dans UN verre.
    private var spotlightControls: some View {
        HStack(spacing: MeeshySpacing.xxs) {
            Button { choose(.grid) } label: {
                Image(systemName: "square.grid.2x2")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .foregroundStyle(Color.white)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(String(localized: "call.group.grid", defaultValue: "Revenir à la grille", bundle: .main))
            Button {
                withAnimation(CallChromeStow.animation(reduceMotion: reduceMotion)) { isFullScreen.toggle() }
            } label: {
                Image(systemName: isFullScreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .foregroundStyle(Color.white)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(isFullScreen
                ? String(localized: "story.viewer.fullscreen.exit", defaultValue: "Quitter le plein écran", bundle: .main)
                : String(localized: "story.viewer.fullscreen.enter", defaultValue: "Plein écran", bundle: .main))
        }
        .callChromeGlass(in: Capsule())
    }

    private func filmstrip(_ others: [GroupCallStageTile], axis: Axis) -> some View {
        ScrollView(axis == .horizontal ? .horizontal : .vertical, showsIndicators: false) {
            if axis == .horizontal {
                HStack(spacing: Self.spacing) { stripTiles(others) }
            } else {
                VStack(spacing: Self.spacing) { stripTiles(others) }
            }
        }
        // P14.9 — le bandeau s'efface en fondu à ses deux bords, à l'horizontale
        // en portrait, à la verticale en paysage.
        .mask { ScrollEdgeFadeMask(axis: axis, start: true, end: true) }
    }

    private func stripTiles(_ others: [GroupCallStageTile]) -> some View {
        ForEach(others) { tile in
            selectableTile(tile)
                .frame(width: 84, height: 112)
        }
    }
}

/// U2.10 · #17726 — le bandeau des autres, translaté hors de l'écran par une simple
/// transformation (`GroupCallStageMotion.stripTravel`) : la mise en page ne bouge pas.
private struct GroupCallStripSlide: ViewModifier {
    let travel: CGSize

    func body(content: Content) -> some View {
        content.offset(travel)
    }
}

/// Une tuile : la vidéo du membre, ou son avatar caméra coupée ; son nom, son
/// micro, son partage d'écran ; un liseré à SA couleur, et un halo de cette
/// couleur tant qu'il parle (moi compris).
struct GroupCallTileView: View {
    let tile: GroupCallStageTile
    let track: Any?
    /// Ma caméra voulue avant/arrière ; ignorée pour la vignette d'un autre.
    let intendedFront: Bool
    var contentMode: UIView.ContentMode = .scaleAspectFill
    /// « Écran de X » d'un écran partagé mis à la une : ce que VoiceOver lit. Il se VOIT sur la puce
    /// de la scène (`CallScreenShareChip`), la plaque gardant le nom de la personne.
    var screenTitle: String? = nil
    var zoom: CGFloat = 1

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let cornerRadius: CGFloat = 16

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
                    .fill(MeeshyColors.indigo950)
                if tile.showsVideo, track != nil {
                    tileVideo
                        .scaleEffect(zoom)
                } else {
                    CachedAvatarImage(
                        urlString: tile.avatarURL,
                        name: tile.displayName.isEmpty ? "?" : tile.displayName,
                        size: min(proxy.size.width, proxy.size.height) * 0.42,
                        accentColor: tile.accentHex
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                nameplate
                    .padding(MeeshySpacing.sm)
            }
            .clipShape(RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
                    .stroke(speakerColor.opacity(tile.isSpeaking ? 1 : 0.55), lineWidth: tile.isSpeaking ? 3 : 1.5)
            )
            .modifier(CallSpeakerHalo(
                shape: RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous),
                color: speakerColor,
                spread: 1.04,
                isSpeaking: tile.isSpeaking
            ))
            .animation(
                .easeInOut(duration: CallRemoteVideoFade.duration(reduceMotion: reduceMotion)),
                value: tile.isSpeaking
            )
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityName)
        .accessibilityValue(accessibilityValue)
    }

    /// La couleur de la personne : la même que ses sous-titres et que son anneau en duo.
    private var speakerColor: Color {
        Color(uiColor: HexColor(hex: CallPeerSpeech.colorHex(forPeer: tile.colorKey))?.uiColor ?? .white)
    }

    private var accessibilityName: String {
        if let screenTitle { return screenTitle }
        return tile.displayName.isEmpty
            ? String(localized: "call.group.tile.unknown", defaultValue: "Participant", bundle: .main)
            : tile.displayName
    }

    @ViewBuilder
    private var tileVideo: some View {
        if tile.isLocal {
            LocalCameraVideoView(track: track, intendedFront: intendedFront, contentMode: contentMode)
        } else {
            CallVideoView(track: track, contentMode: contentMode)
        }
    }

    private var nameplate: some View {
        CallTileNameplate(
            title: tile.displayName,
            isMicMuted: tile.isMicMuted,
            isScreenSharing: tile.isScreenSharing,
            isReconnecting: tile.isReconnecting
        )
    }

    private var accessibilityValue: String {
        let states: [String?] = [
            tile.isSpeaking ? String(localized: "call.group.tile.speaking", defaultValue: "Parle", bundle: .main) : nil,
            tile.isMicMuted ? String(localized: "call.group.tile.micMuted", defaultValue: "Micro coupé", bundle: .main) : nil,
            tile.showsVideo ? nil : String(localized: "call.group.tile.cameraOff", defaultValue: "Caméra coupée", bundle: .main),
            tile.isScreenSharing ? String(localized: "call.group.tile.screenSharing", defaultValue: "Partage son écran", bundle: .main) : nil,
            tile.isReconnecting ? String(localized: "call.group.tile.reconnecting", defaultValue: "Reconnexion…", bundle: .main) : nil
        ]
        return states.compactMap { $0 }.joined(separator: ", ")
    }
}
