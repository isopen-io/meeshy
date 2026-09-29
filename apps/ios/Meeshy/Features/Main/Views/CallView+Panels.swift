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
        return CallCaptureIdentity.group(
            tiles: GroupCallStage.tiles(mesh: mesh, callManager: callManager),
            myName: myCaptureName,
            myUsername: AuthManager.shared.currentUser?.username,
            isMyCaptureMirrored: isMyCaptureMirrored
        )
    }

    /// #8743 — ce que l'appel sait déjà de sa conversation, pour les textes d'un cadre.
    var montageCallContext: CallFrameCallContext {
        let conversationId = callManager.conversationId
        return CallFrameCallContext(
            conversationId: conversationId,
            knownGroupTitle: mesh.groupTitle(for: conversationId),
            isGroupCall: isGroupStage || mesh.isGroupConversation(conversationId)
        )
    }

    var captureTracks: [String: Any] {
        guard isGroupStage else {
            let duo: [String: Any?] = [CallCaptureIdentity.remoteDuoId: callManager.remoteVideoTrack, CallCaptureIdentity.localDuoId: callManager.localVideoTrack]
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
        callManager.localVideoTrack.map { [CallCaptureIdentity.localDuoId: $0] } ?? [:]
    }

    private var myImageCaptureSubject: CallCaptureSubject {
        CallCaptureIdentity.me(
            name: myCaptureName,
            username: AuthManager.shared.currentUser?.username,
            isMirrored: isMyCaptureMirrored,
            showsVideo: callManager.isVideoEnabled && callManager.hasLocalVideoTrack
        )
    }

    private var myCaptureName: String {
        let user = AuthManager.shared.currentUser
        return CallCaptureIdentity.myName(
            displayName: user?.displayName,
            username: user?.username,
            fallback: String(localized: "call.group.tile.you", defaultValue: "Vous", bundle: .main)
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

    private var duoCaptureSubjects: [CallCaptureSubject] {
        CallCaptureIdentity.duo(
            me: myImageCaptureSubject,
            remoteName: callManager.remoteUsername ?? "",
            remoteUsername: remoteProfile?.username,
            remoteShowsVideo: callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled,
            meFirst: swapStreams && callManager.hasLocalVideoTrack
        )
    }
}
