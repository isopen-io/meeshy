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
    static func isShown(isMeshActive: Bool, roster: GroupCallRoster) -> Bool {
        isMeshActive && roster.members.count >= 2
    }

    /// Moi d'abord, puis les membres dans l'ordre d'arrivée : la grille ne se
    /// réagence jamais quand quelqu'un parle — le liseré suffit à le montrer.
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
            isSpeaking: false,
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
        return [local] + remote
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

    static let spacing: CGFloat = 8

    var body: some View {
        let current = tiles
        let focus = GroupCallSpotlight.focus(tiles: current, choice: choice)
        GeometryReader { proxy in
            switch focus {
            case .grid:
                grid(current, in: proxy.size)
            case .spotlight(let tileId, let isScreenShare):
                spotlight(current, tileId: tileId, isScreenShare: isScreenShare, in: proxy.size)
            }
        }
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

    private func choose(_ newChoice: GroupCallSpotlightChoice) {
        HapticFeedback.light()
        withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.85)) {
            choice = newChoice
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

    private func selectableTile(_ tile: GroupCallStageTile) -> some View {
        GroupCallTileView(tile: tile, track: track(for: tile), intendedFront: callManager.isUsingFrontCamera)
            .contentShape(Rectangle())
            .onTapGesture { choose(.tile(tile.id)) }
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(String(localized: "call.group.spotlight.hint", defaultValue: "Touchez pour mettre à la une", bundle: .main))
            .accessibilityAction { choose(.tile(tile.id)) }
            .moderationMenu(for: tile, controls: callManager.controls, pendingRemoval: $pendingRemoval, isRemovalPresented: $isRemovalPresented)
    }

    // MARK: - À la une

    @ViewBuilder
    private func spotlight(_ current: [GroupCallStageTile], tileId: String, isScreenShare: Bool, in size: CGSize) -> some View {
        let others = current.filter { $0.id != tileId }
        let isLandscape = size.width > size.height
        if let featured = current.first(where: { $0.id == tileId }) {
            if isFullScreen {
                featuredTile(featured, isScreenShare: isScreenShare)
            } else if isLandscape {
                HStack(spacing: Self.spacing) {
                    featuredTile(featured, isScreenShare: isScreenShare)
                    filmstrip(others, axis: .vertical)
                        .frame(width: 128)
                }
            } else {
                VStack(spacing: Self.spacing) {
                    featuredTile(featured, isScreenShare: isScreenShare)
                    filmstrip(others, axis: .horizontal)
                        .frame(height: 112)
                }
            }
        }
    }

    private func featuredTile(_ tile: GroupCallStageTile, isScreenShare: Bool) -> some View {
        GroupCallTileView(
            tile: tile,
            track: track(for: tile),
            intendedFront: callManager.isUsingFrontCamera,
            contentMode: isScreenShare ? .scaleAspectFit : .scaleAspectFill,
            title: isScreenShare ? CallScreenShareCopy.screenOf(name: tile.displayName) : nil,
            zoom: isScreenShare ? GroupCallSpotlight.clampedZoom(zoom * pinch) : 1
        )
        .gesture(zoomGesture, including: isScreenShare ? .all : .subviews)
        .callCameraZoom(isEnabled: tile.isLocal && tile.showsVideo)
        .onTapGesture(count: 2) {
            guard isScreenShare else { return }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { zoom = 1 }
        }
        .onTapGesture { onStageTap() }
        .overlay(alignment: .topTrailing) { spotlightControls.padding(8) }
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .updating($pinch) { value, state, _ in state = value }
            .onEnded { value in zoom = GroupCallSpotlight.clampedZoom(zoom * value) }
    }

    /// Grille (revenir) et plein écran, dans UN verre.
    private var spotlightControls: some View {
        HStack(spacing: 2) {
            Button { choose(.grid) } label: {
                Image(systemName: "square.grid.2x2")
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(String(localized: "call.group.grid", defaultValue: "Revenir à la grille", bundle: .main))
            Button {
                withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { isFullScreen.toggle() }
            } label: {
                Image(systemName: isFullScreen ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right")
                    .font(MeeshyFont.relative(16, weight: .semibold))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .foregroundColor(.white)
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
    }

    private func stripTiles(_ others: [GroupCallStageTile]) -> some View {
        ForEach(others) { tile in
            selectableTile(tile)
                .frame(width: 84, height: 112)
        }
    }
}

/// Une tuile : la vidéo du membre, ou son avatar caméra coupée ; son nom, son
/// micro, son partage d'écran ; un liseré à SA couleur, épaissi tant qu'il
/// parle.
struct GroupCallTileView: View {
    let tile: GroupCallStageTile
    let track: Any?
    /// Ma caméra voulue avant/arrière ; ignorée pour la vignette d'un autre.
    let intendedFront: Bool
    var contentMode: UIView.ContentMode = .scaleAspectFill
    /// Remplace le nom sur la plaque (« Écran de X » à la une).
    var title: String? = nil
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
                    .padding(8)
            }
            .clipShape(RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
                    .stroke(Color(hex: tile.accentHex).opacity(tile.isSpeaking ? 1 : 0.55), lineWidth: tile.isSpeaking ? 3 : 1.5)
            )
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: tile.isSpeaking)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityName)
        .accessibilityValue(accessibilityValue)
    }

    private var accessibilityName: String {
        if let title { return title }
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
        HStack(spacing: 4) {
            if tile.isMicMuted {
                Image(systemName: "mic.slash.fill")
                    .foregroundStyle(MeeshyColors.error)
            }
            if tile.isScreenSharing {
                Image(systemName: "rectangle.on.rectangle")
            }
            if tile.isReconnecting {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .foregroundStyle(MeeshyColors.warning)
            }
            Text(title ?? tile.displayName)
                .lineLimit(1)
        }
        .font(.caption.weight(.semibold))
        .foregroundColor(.white)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.ultraThinMaterial, in: Capsule())
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
