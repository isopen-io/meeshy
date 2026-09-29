import SwiftUI
import MeeshySDK
import MeeshyUI

extension CallView {
    var chromeVisibility: CallChromeVisibility {
        CallChromeVisibility(isRevealed: showControls, isStageFullScreen: isStageFullScreen, isModeActive: layer.freesTheScreen)
    }

    var showsConnectedLayout: Bool {
        switch callManager.callState {
        case .connected: return true
        case .reconnecting: return callManager.hasEstablishedMedia
        default: return false
        }
    }

    var isVideoStage: Bool {
        CallChromeVisibility.isVideoStage(
            isGroup: isGroupStage,
            isLocalVideoEnabled: callManager.isVideoEnabled,
            isDuoVideoActive: callManager.isVideoUIActive,
            remoteCamerasOn: GroupCallStage.tiles(mesh: mesh, callManager: callManager).filter { !$0.isLocal && $0.showsVideo }.count
        )
    }

    func captureActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        CallPillButton(
            symbol: "camera.aperture",
            kind: .normal,
            label: CallCaptureCopy.control,
            caption: captioned ? CallCaptureCopy.controlCaption : nil,
            hint: CallCaptureCopy.controlHint,
            diameter: diameter
        ) {
            enterMode(.montage)
        }
    }

    func togglePanel(_ panel: CallScreenPanel) {
        withAnimation(disclosureAnimation) {
            layer = layer.opening(panel)
        }
        HapticFeedback.light()
    }

    func closePanel() {
        withAnimation(disclosureAnimation) {
            layer = layer.closed()
        }
    }

    func backToMenu() {
        withAnimation(disclosureAnimation) {
            layer = layer.backToMenu()
        }
    }

    func panelSheet(_ panel: CallScreenPanel) -> Binding<Bool> {
        Binding(
            get: { layer.openPanel == panel },
            set: { isShown in
                guard !isShown, layer.openPanel == panel else { return }
                layer = layer.backToMenu()
            }
        )
    }

    @ViewBuilder
    func panelRows(_ panel: CallScreenPanel) -> some View {
        switch panel {
        case .react:
            reactionPanelRows
        case .record:
            recordingPanelRows
        case .people, .journal:
            EmptyView()
        }
    }

    var captureSubjects: [CallCaptureSubject] {
        guard isGroupStage else { return duoCaptureSubjects }
        return GroupCallStage.tiles(mesh: mesh, callManager: callManager).map { tile in
            CallCaptureSubject(
                id: tile.id,
                name: tile.displayName,
                isMirrored: tile.isLocal && isMyCaptureMirrored,
                showsVideo: tile.showsVideo
            )
        }
    }

    var captureTracks: [String: Any] {
        guard isGroupStage else {
            let duo: [String: Any?] = [Self.remoteCaptureId: callManager.remoteVideoTrack, Self.localCaptureId: callManager.localVideoTrack]
            return duo.compactMapValues { $0 }
        }
        return GroupCallStage.tiles(mesh: mesh, callManager: callManager).reduce(into: [String: Any]()) { result, tile in
            if let track = GroupCallStage.track(for: tile, mesh: mesh, callManager: callManager) {
                result[tile.id] = track
            }
        }
    }

    /// #8737 — les participants qui accompagnent mon image en mode Effets : la
    /// grille en groupe, moi et l'autre en duo, dans la même forme de tuile.
    var effectsCompanionTiles: [GroupCallStageTile] {
        guard isGroupStage else {
            return CallEffectsCompanionRule.duoTiles(
                local: CallEffectsDuoPeer(
                    userId: AuthManager.shared.currentUser?.id,
                    name: String(localized: "call.group.tile.you", defaultValue: "Vous", bundle: .main),
                    avatarURL: nil,
                    isVideoOn: callManager.isVideoEnabled && callManager.hasLocalVideoTrack,
                    isMicMuted: callManager.isMuted
                ),
                remote: CallEffectsDuoPeer(
                    userId: callManager.remoteUserId,
                    name: callManager.remoteUsername ?? remoteProfile?.displayName ?? "",
                    avatarURL: remoteProfile?.avatar,
                    isVideoOn: callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled,
                    isMicMuted: !callManager.isRemoteAudioEnabled
                )
            )
        }
        return GroupCallStage.tiles(mesh: mesh, callManager: callManager)
    }

    func effectsTrack(for tile: GroupCallStageTile) -> Any? {
        guard isGroupStage else {
            return tile.isLocal ? callManager.localVideoTrack : callManager.remoteVideoTrack
        }
        return GroupCallStage.track(for: tile, mesh: mesh, callManager: callManager)
    }

    var myImageCaptureSubjects: [CallCaptureSubject] { [myImageCaptureSubject] }

    var myImageCaptureTracks: [String: Any] {
        callManager.localVideoTrack.map { [Self.localCaptureId: $0] } ?? [:]
    }

    private var myImageCaptureSubject: CallCaptureSubject {
        CallCaptureSubject(
            id: Self.localCaptureId,
            name: String(localized: "call.group.tile.you", defaultValue: "Vous", bundle: .main),
            isMirrored: isMyCaptureMirrored,
            showsVideo: callManager.isVideoEnabled && callManager.hasLocalVideoTrack
        )
    }

    /// #8696 — une capture montre ce que l'autre voit : la règle de symétrie,
    /// rôle capture, jamais le drapeau de l'aperçu.
    private var isMyCaptureMirrored: Bool {
        CallCameraMirror.isMirrored(
            facing: CallCameraMirror.displayedFacing(live: CallLiveCamera.shared.facing, intendedFront: callManager.isUsingFrontCamera),
            role: .capture
        )
    }

    private static let remoteCaptureId = "duo-remote"
    private static let localCaptureId = "duo-local"

    private var duoCaptureSubjects: [CallCaptureSubject] {
        let remote = CallCaptureSubject(
            id: Self.remoteCaptureId,
            name: callManager.remoteUsername ?? "",
            isMirrored: false,
            showsVideo: callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled
        )
        let local = myImageCaptureSubject
        return swapStreams && callManager.hasLocalVideoTrack ? [local, remote] : [remote, local]
    }
}
