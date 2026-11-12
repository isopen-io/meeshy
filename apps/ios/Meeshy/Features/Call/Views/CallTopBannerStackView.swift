import SwiftUI
import MeeshyUI

/// APP-1 — partage d'écran, enregistrement, capture (R1) et cadre en direct : UNE pile sous
/// la rangée d'en-tête de l'appel, dans l'ordre fixe de `CallTopBannerStack`,
/// au lieu de trois décalages figés (60, 110, 160 pt) qui passaient sous le
/// chevron « Réduire » et se chevauchaient. Vue à part : elle observe seule le
/// partage et l'enregistrement, sans réévaluer tout l'écran d'appel.
struct CallTopBannerStackView<LiveFrameStatus: View>: View {
    @ObservedObject var screenShare: CallScreenShareController
    @ObservedObject var recording: CallRecordingController
    @ObservedObject var captureJournal: CallCaptureJournal
    let remoteName: String
    let participantName: (String) -> String
    let chrome: CallChromeVisibility
    let hasLiveFrameStatus: Bool
    let topInset: CGFloat
    @ViewBuilder let liveFrameStatus: () -> LiveFrameStatus

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            ForEach(CallTopBannerStack.ordered(present), id: \.self) { banner in
                content(banner)
                    .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: CallTopBannerStack.ordered(present))
        .animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: CallRecordingBannerStage.of(phase: recording.phase, notice: recording.notice))
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: captureJournal.alert)
        .padding(.top, topInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var present: Set<CallTopBanner> {
        var present: Set<CallTopBanner> = []
        if screenShare.isSharing || screenShare.isRemoteSharing { present.insert(.screenShare) }
        if recording.phase != .idle || recording.notice != nil { present.insert(.recording) }
        if captureJournal.alert != nil { present.insert(.capture) }
        if hasLiveFrameStatus { present.insert(.liveFrame) }
        return present
    }

    @ViewBuilder
    private func content(_ banner: CallTopBanner) -> some View {
        switch banner {
        case .screenShare:
            CallScreenShareBanner(isSharing: screenShare.isSharing, remoteSharerName: screenShare.isRemoteSharing ? remoteName : nil, onStop: screenShare.stopSharing)
                .equatable()
                .padding(.horizontal, CallTopBannerStack.horizontalMargin)
                .modifier(CallEdgeStow(edge: .top, margin: topInset, isVisible: chrome.isVisible(.screenShareBanner), reduceMotion: reduceMotion))
                .callChromeVisibility(chrome.isVisible(.screenShareBanner))
        case .recording:
            CallRecordingOverlay(phase: recording.phase, notice: recording.notice, kind: recording.kind, requesterName: recording.phase.requesterId.map(participantName) ?? "", onAnswer: { _ = recording.answer(accepted: $0) }, onStop: { _ = recording.stop() }, onDismiss: recording.dismissNotice, showsStatus: chrome.isVisible(.recordingStatus), topInset: topInset)
                .equatable()
        case .capture:
            CallCaptureAlertCapsule(alert: captureJournal.alert, onDismiss: captureJournal.dismissFlash)
                .equatable()
                .padding(.horizontal, MeeshySpacing.lg)
        case .liveFrame:
            liveFrameStatus()
                .padding(.horizontal, MeeshySpacing.lg)
        }
    }
}
