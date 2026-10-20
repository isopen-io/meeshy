import Foundation
import os
@testable import MeeshySDK

final class SpyErrorRecorder: ErrorRecording, Sendable {
    private let storage = OSAllocatedUnfairLock<[RecordedFailure]>(initialState: [])

    var failures: [RecordedFailure] {
        storage.withLock { $0 }
    }

    func record(_ failure: RecordedFailure) {
        storage.withLock { $0.append(failure) }
    }
}
