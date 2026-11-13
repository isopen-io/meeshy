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
    /// La capsule « Revenir à la grille · Plein écran » de la personne à la une.
    case featuredCapsule
}

struct CallChromeVisibility: Equatable, Sendable {
    let isRevealed: Bool
    let isStageFullScreen: Bool
    let isModeActive: Bool

    init(isRevealed: Bool = true, isStageFullScreen: Bool = false, isModeActive: Bool = false) {
        self.isRevealed = isRevealed
        self.isStageFullScreen = isStageFullScreen
        self.isModeActive = isModeActive
    }

    func isVisible(_ element: CallChromeElement) -> Bool {
        switch element {
        case .captions, .recordingConsent:
            return true
        case .selfView:
            return !isModeActive
        case .header, .controls, .openPanel, .recordingStatus, .screenShareBanner:
            return isRevealed && !isStageFullScreen && !isModeActive
        case .featuredCapsule:
            return isRevealed && !isModeActive
        }
    }

    func toggled() -> CallChromeVisibility {
        CallChromeVisibility(isRevealed: !isRevealed, isStageFullScreen: isStageFullScreen, isModeActive: isModeActive)
    }

    static func mayToggleByTap(isVideoStage: Bool) -> Bool {
        isVideoStage
    }

    static func isVideoStage(isGroup: Bool, isLocalVideoEnabled: Bool, isDuoVideoActive: Bool, remoteCamerasOn: Int) -> Bool {
        guard isGroup else { return isDuoVideoActive }
        return isLocalVideoEnabled || remoteCamerasOn > 0
    }
}
