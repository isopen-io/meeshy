#if os(iOS)
import AVFoundation
import Foundation

extension MediaSessionCoordinator: RecordingSessionControlling {

    public nonisolated func configureRecordingSession(
        _ configuration: RecordingSessionConfiguration,
        holding: Bool
    ) -> Bool {
        false
    }

    public nonisolated func releaseRecordingHold() {}

    public nonisolated func handBackSession(_ handBack: RecordingSessionHandBack) {}
}
#endif
