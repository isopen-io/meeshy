import XCTest
import SwiftUI
@testable import MeeshySDK
@testable import MeeshyUI

final class MeeshyUICompletionSweepConcurrencyTests: XCTestCase {

    private static let accesses = 500

    func test_attachmentStatusReporter_concurrentSinkWritesAndReads_neverCrash() async {
        let original = AttachmentStatusReporter.sink
        defer { AttachmentStatusReporter.sink = original }

        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<Self.accesses {
                group.addTask { @Sendable @concurrent in
                    AttachmentStatusReporter.sink = { _, _ in }
                    _ = AttachmentStatusReporter.sink
                }
            }
        }
    }

    func test_scrollOffsetPreferenceKey_concurrentWritesAndReads_keepALastWrittenValue() async {
        let original = ScrollOffsetPreferenceKey.defaultValue
        defer { ScrollOffsetPreferenceKey.defaultValue = original }

        await withTaskGroup(of: Void.self) { group in
            for index in 0..<Self.accesses {
                group.addTask { @Sendable @concurrent in
                    ScrollOffsetPreferenceKey.defaultValue = CGFloat(index)
                    _ = ScrollOffsetPreferenceKey.defaultValue
                }
            }
        }

        ScrollOffsetPreferenceKey.defaultValue = 42
        XCTAssertEqual(ScrollOffsetPreferenceKey.defaultValue, 42)
    }
}
