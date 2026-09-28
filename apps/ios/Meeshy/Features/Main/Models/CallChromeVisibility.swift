import Foundation

enum CallChromeElement: CaseIterable, Sendable {
    case header
    case controls
    case openPanel
    case recordingStatus
    case recordingConsent
    case screenShareBanner
    case captions
    case selfView
}

struct CallChromeVisibility: Equatable, Sendable {
    let isRevealed: Bool
    let isStageFullScreen: Bool

    init(isRevealed: Bool = true, isStageFullScreen: Bool = false) {
        self.isRevealed = isRevealed
        self.isStageFullScreen = isStageFullScreen
    }

    func isVisible(_ element: CallChromeElement) -> Bool {
        switch element {
        case .captions, .selfView, .recordingConsent:
            return true
        case .header, .controls, .openPanel, .recordingStatus, .screenShareBanner:
            return isRevealed && !isStageFullScreen
        }
    }

    func toggled() -> CallChromeVisibility {
        CallChromeVisibility(isRevealed: !isRevealed, isStageFullScreen: isStageFullScreen)
    }

    static func mayToggleByTap(isVideoStage: Bool) -> Bool {
        isVideoStage
    }

    static func mayAutoHide(isVideoStage: Bool, isPanelOpen: Bool, isOnMac: Bool, isVoiceOverRunning: Bool) -> Bool {
        isVideoStage && !isPanelOpen && !isOnMac && !isVoiceOverRunning
    }

    static func isVideoStage(isGroup: Bool, isLocalVideoEnabled: Bool, isDuoVideoActive: Bool, remoteCamerasOn: Int) -> Bool {
        guard isGroup else { return isDuoVideoActive }
        return isLocalVideoEnabled || remoteCamerasOn > 0
    }

    static let autoHideDelayNanoseconds: UInt64 = 4_000_000_000
}
