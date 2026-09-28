import SwiftUI
import MeeshySDK
import MeeshyUI

extension CallView {
    var chromeVisibility: CallChromeVisibility {
        CallChromeVisibility(isRevealed: showControls, isStageFullScreen: isStageFullScreen)
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
        let isOpen = controlsDisclosure.isOpen(.capture)
        return CallPillButton(
            symbol: "camera.aperture",
            kind: isOpen ? .active : .normal,
            label: CallCaptureCopy.control,
            caption: captioned ? CallCaptureCopy.controlCaption : nil,
            toggleState: isOpen,
            diameter: diameter
        ) {
            togglePanel(.capture)
        }
    }

    func togglePanel(_ panel: CallControlsPanel) {
        withAnimation(disclosureAnimation) {
            controlsDisclosure = controlsDisclosure.toggling(panel)
        }
        HapticFeedback.light()
    }

    func closePanel() {
        withAnimation(disclosureAnimation) {
            controlsDisclosure = controlsDisclosure.closingPanel()
        }
    }

    @ViewBuilder
    func panelRows(_ panel: CallControlsPanel) -> some View {
        switch panel {
        case .effects:
            CallEffectsPanel(callManager: callManager, onClose: closePanel)
        case .capture:
            CallCapturePanel(capture: capture, subjects: captureSubjects, tracks: captureTracks, onClose: closePanel)
        case .react:
            reactionPanelRows
        case .recording:
            recordingPanelRows
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
