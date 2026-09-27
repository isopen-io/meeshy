import SwiftUI
import MeeshySDK
import MeeshyUI

/// Une tuile de la grille d'un appel de groupe (#3585) — ce que la vue dessine,
/// dérivé du registre du maillage et de l'état local.
struct GroupCallStageTile: Equatable, Identifiable, Sendable {
    let id: String
    let displayName: String
    let avatarURL: String?
    let isLocal: Bool
    let isSpeaking: Bool
    let isMicMuted: Bool
    let showsVideo: Bool
    let isScreenSharing: Bool
    let isReconnecting: Bool
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
}

/// La grille adaptative d'un appel de groupe, posée sur `CallView` entre son
/// chrome du haut et ses contrôles du bas (`CallView.swift` est hors budget :
/// rien ne s'y ajoute).
struct GroupCallStageView: View {
    @ObservedObject var mesh: GroupCallMeshCoordinator
    @ObservedObject var callManager: CallManager

    private static let spacing: CGFloat = 8
    /// Le chrome du haut de `CallView` (chevron, durée : 44 pt sous l'encart)
    /// et sa barre de contrôles du bas restent visibles et touchables.
    private static let chromeInsets = EdgeInsets(top: 64, leading: 12, bottom: 176, trailing: 12)

    var body: some View {
        if GroupCallStage.isShown(isMeshActive: mesh.isGroupCallActive, roster: mesh.roster) {
            GeometryReader { proxy in
                grid(in: proxy.size)
            }
            .padding(Self.chromeInsets)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "call.group.stage", defaultValue: "Participants à l'appel", bundle: .main))
        }
    }

    private var tiles: [GroupCallStageTile] {
        GroupCallStage.tiles(
            roster: mesh.roster,
            speakingUserIds: mesh.speakingUserIds,
            localName: String(localized: "call.group.tile.you", defaultValue: "Vous", bundle: .main),
            isLocalMicMuted: callManager.isMuted,
            isLocalVideoEnabled: callManager.isVideoEnabled,
            isPrimaryVideoActive: callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled
        )
    }

    private func grid(in size: CGSize) -> some View {
        let current = tiles
        let layout = GroupCallGridLayout.layout(tileCount: current.count, isLandscape: size.width > size.height)
        let width = max(0, (size.width - Self.spacing * CGFloat(layout.columns - 1)) / CGFloat(layout.columns))
        let height = max(0, (size.height - Self.spacing * CGFloat(layout.rows - 1)) / CGFloat(layout.rows))
        let columns = Array(repeating: GridItem(.fixed(width), spacing: Self.spacing), count: layout.columns)
        return LazyVGrid(columns: columns, spacing: Self.spacing) {
            ForEach(current) { tile in
                GroupCallTileView(
                    tile: tile,
                    track: tile.isLocal ? callManager.localVideoTrack : mesh.videoTrack(for: tile.id),
                    mirror: tile.isLocal && callManager.isUsingFrontCamera
                )
                .frame(width: width, height: height)
            }
        }
        .frame(width: size.width, height: size.height, alignment: .center)
    }
}

/// Une tuile : la vidéo du membre, ou son avatar caméra coupée ; son nom, son
/// micro, son partage d'écran ; un liseré vert tant qu'il parle.
struct GroupCallTileView: View {
    let tile: GroupCallStageTile
    let track: Any?
    let mirror: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let cornerRadius: CGFloat = 16

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
                    .fill(MeeshyColors.indigo950)
                if tile.showsVideo, track != nil {
                    CallVideoView(track: track, mirror: mirror, contentMode: .scaleAspectFill)
                } else {
                    CachedAvatarImage(
                        urlString: tile.avatarURL,
                        name: tile.displayName.isEmpty ? "?" : tile.displayName,
                        size: min(proxy.size.width, proxy.size.height) * 0.42,
                        accentColor: MeeshyColors.brandPrimaryHex
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                nameplate
                    .padding(8)
            }
            .clipShape(RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
                    .stroke(tile.isSpeaking ? MeeshyColors.success : Color.white.opacity(0.12), lineWidth: tile.isSpeaking ? 3 : 1)
            )
            .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: tile.isSpeaking)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(tile.displayName.isEmpty
            ? String(localized: "call.group.tile.unknown", defaultValue: "Participant", bundle: .main)
            : tile.displayName)
        .accessibilityValue(accessibilityValue)
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
            Text(tile.displayName)
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
