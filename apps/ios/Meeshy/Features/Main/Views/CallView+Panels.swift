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
                isMirrored: tile.isLocal && callManager.isUsingFrontCamera,
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

    private static let remoteCaptureId = "duo-remote"
    private static let localCaptureId = "duo-local"

    private var duoCaptureSubjects: [CallCaptureSubject] {
        let remote = CallCaptureSubject(
            id: Self.remoteCaptureId,
            name: callManager.remoteUsername ?? "",
            isMirrored: false,
            showsVideo: callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled
        )
        let local = CallCaptureSubject(
            id: Self.localCaptureId,
            name: String(localized: "call.group.tile.you", defaultValue: "Vous", bundle: .main),
            isMirrored: callManager.isUsingFrontCamera,
            showsVideo: callManager.isVideoEnabled && callManager.hasLocalVideoTrack
        )
        return swapStreams && callManager.hasLocalVideoTrack ? [local, remote] : [remote, local]
    }
}
