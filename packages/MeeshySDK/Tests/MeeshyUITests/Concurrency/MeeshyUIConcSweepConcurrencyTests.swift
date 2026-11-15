import XCTest
import AVFoundation
import CoreImage
import MeeshySDK
@testable import MeeshyUI

final class MeeshyUIConcSweepConcurrencyTests: XCTestCase {

    func test_frameSource_concurrentGeneratorLookups_shareOneGeneratorPerMedia() async {
        let source = StoryForegroundVideoFrameSource()
        let url = URL(fileURLWithPath: "/tmp/conc-sweep-missing.mp4")
        let generators = await withTaskGroup(of: ObjectIdentifier.self, returning: Set<ObjectIdentifier>.self) { group in
            for _ in 0..<64 {
                group.addTask { ObjectIdentifier(source.generator(for: "conc-media", url: url)) }
            }
            return await group.reduce(into: Set<ObjectIdentifier>()) { $0.insert($1) }
        }
        XCTAssertEqual(generators.count, 1)
    }

    func test_continuationBox_concurrentResumeOnce_resumesExactlyOnce() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let box = StoryExportEncoder.ContinuationBox(continuation)
            DispatchQueue.concurrentPerform(iterations: 100) { _ in box.resumeOnce() }
        }
    }

    func test_watermarkTileMemo_concurrentSnapshotsNeverTearTimeAndSize() async {
        let memo = Locked(uncheckedState: WatermarkTileMemo())
        let torn = await withTaskGroup(of: Bool.self, returning: Int.self) { group in
            for index in 0..<400 {
                group.addTask {
                    if index.isMultiple(of: 2) {
                        let value = Double(index)
                        memo.mutateUnchecked { $0 = WatermarkTileMemo(time: value, size: CGSize(width: value, height: value), tile: nil) }
                        return true
                    }
                    let snapshot = memo.mutateUnchecked { $0 }
                    return snapshot.time.isNaN || snapshot.time == Double(snapshot.size.width)
                }
            }
            return await group.reduce(0) { $0 + ($1 ? 0 : 1) }
        }
        XCTAssertEqual(torn, 0)
    }
}
