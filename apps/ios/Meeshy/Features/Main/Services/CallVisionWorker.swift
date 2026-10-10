import CoreVideo
import Foundation
import os

protocol CallVisionExecuting: AnyObject {
    nonisolated func execute(_ work: @escaping @Sendable () -> Void)
}

nonisolated final class CallVisionQueueExecutor: CallVisionExecuting, @unchecked Sendable {
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
nonisolated final class CallVisionWorker: @unchecked Sendable {
    private let executor: any CallVisionExecuting
    private let lock = NSLock()
    private var isBusy = false

    init(executor: any CallVisionExecuting) {
        self.executor = executor
    }

    @discardableResult
    func trySubmit(_ work: @escaping @Sendable () -> Void) -> Bool {
        lock.lock()
        guard !isBusy else {
            lock.unlock()
            return false
        }
        isBusy = true
        lock.unlock()
        executor.execute { [weak self] in
            work()
            self?.finish()
        }
        return true
    }

    private func finish() {
        lock.lock()
        isBusy = false
        lock.unlock()
    }
}

nonisolated struct CallFrameHandoff: @unchecked Sendable {
    let pixelBuffer: CVPixelBuffer
}

nonisolated enum CallVideoSignposts {
    static let signposter = OSSignposter(subsystem: "me.meeshy.app", category: "CallVideoFilters")
}
