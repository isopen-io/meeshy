import CoreVideo
import Foundation
import os
import MeeshySDK

nonisolated protocol CallVisionExecuting: AnyObject, Sendable {
    nonisolated func execute(_ work: @escaping @Sendable () -> Void)
}

nonisolated final class CallVisionQueueExecutor: CallVisionExecuting {
    private let queue: DispatchQueue

    init(label: String) {
        queue = DispatchQueue(label: label, qos: .userInitiated)
    }

    func execute(_ work: @escaping @Sendable () -> Void) {
        queue.async(execute: work)
    }
}

/// Une analyse Vision (segmentation, repères du visage) ne tourne JAMAIS sur la
/// file de capture : elle part sur sa propre file série, une seule à la fois.
/// Une image soumise pendant qu'une analyse est en vol est abandonnée — rien ne
/// s'empile, et la prochaine image due, plus récente, prend la place.
nonisolated final class CallVisionWorker: Sendable {
    private let executor: any CallVisionExecuting
    private let isBusy = Locked(false)

    init(executor: any CallVisionExecuting) {
        self.executor = executor
    }

    @discardableResult
    func trySubmit(_ work: @escaping @Sendable () -> Void) -> Bool {
        let claimed = isBusy.mutate { busy -> Bool in
            guard !busy else { return false }
            busy = true
            return true
        }
        guard claimed else { return false }
        executor.execute { [weak self] in
            work()
            self?.finish()
        }
        return true
    }

    private func finish() {
        isBusy.mutate { $0 = false }
    }
}

nonisolated struct CallFrameHandoff: @unchecked Sendable {
    let pixelBuffer: CVPixelBuffer
}

nonisolated enum CallVideoSignposts {
    static let signposter = OSSignposter(subsystem: "me.meeshy.app", category: "CallVideoFilters")
}
