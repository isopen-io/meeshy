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

    /// Loi 11 (#16663, #17945) — un toucher sur la SCÈNE range tout, un autre rend tout. Sous
    /// VoiceOver les contrôles restent en place.
    static func mayToggleByTap(isTapStage: Bool, isVoiceOverRunning: Bool) -> Bool {
        isTapStage && !isVoiceOverRunning
    }

    /// La scène de la loi 11 : l'image en vidéo, et le fond d'un appel établi sans image — derrière
    /// l'avatar d'un duo audio, autour des vignettes d'un groupe sans aucune caméra (#17945 et son
    /// extension). Mêmes vecteurs qu'Android (`isTapStage`) et le web.
    static func isTapStage(isVideoStage: Bool, isConnected: Bool) -> Bool {
        isVideoStage || isConnected
    }

    static func isVideoStage(isGroup: Bool, isLocalVideoEnabled: Bool, isDuoVideoActive: Bool, remoteCamerasOn: Int) -> Bool {
        guard isGroup else { return isDuoVideoActive }
        return isLocalVideoEnabled || remoteCamerasOn > 0
    }
}
