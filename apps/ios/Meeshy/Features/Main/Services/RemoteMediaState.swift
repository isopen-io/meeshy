nonisolated struct RemoteMediaState: Equatable, Sendable {
    let isVideoEnabled: Bool
    let isAudioEnabled: Bool
    let isScreenCapturing: Bool
    let isQualityDegraded: Bool

    static let initial = RemoteMediaState(
        isVideoEnabled: true,
        isAudioEnabled: true,
        isScreenCapturing: false,
        isQualityDegraded: false
    )

    enum Change: Equatable, Sendable {
        case video(Bool)
        case audio(Bool)
        case screenCapture(Bool)
        case qualityDegraded(Bool)
    }

    func applying(_ change: Change) -> RemoteMediaState {
        switch change {
        case .video(let enabled):
            return RemoteMediaState(isVideoEnabled: enabled, isAudioEnabled: isAudioEnabled,
                                    isScreenCapturing: isScreenCapturing, isQualityDegraded: isQualityDegraded)
        case .audio(let enabled):
            return RemoteMediaState(isVideoEnabled: isVideoEnabled, isAudioEnabled: enabled,
                                    isScreenCapturing: isScreenCapturing, isQualityDegraded: isQualityDegraded)
        case .screenCapture(let capturing):
            return RemoteMediaState(isVideoEnabled: isVideoEnabled, isAudioEnabled: isAudioEnabled,
                                    isScreenCapturing: capturing, isQualityDegraded: isQualityDegraded)
        case .qualityDegraded(let degraded):
            return RemoteMediaState(isVideoEnabled: isVideoEnabled, isAudioEnabled: isAudioEnabled,
                                    isScreenCapturing: isScreenCapturing, isQualityDegraded: degraded)
        }
    }
}
