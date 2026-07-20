import XCTest
import UIKit
@testable import Meeshy

@MainActor
final class AttachmentUploaderTests: XCTestCase {

    func test_compress_reducesImageBelow500KB_whenLargerInput() {
        // 1200x1200 random-color image — yields ~1MB+ as JPEG quality 0.8
        let size = CGSize(width: 1200, height: 1200)
        UIGraphicsBeginImageContext(size)
        defer { UIGraphicsEndImageContext() }
        let context = UIGraphicsGetCurrentContext()!
        for x in stride(from: 0, to: Int(size.width), by: 4) {
            for y in stride(from: 0, to: Int(size.height), by: 4) {
                context.setFillColor(UIColor(red: CGFloat.random(in: 0...1),
                                              green: CGFloat.random(in: 0...1),
                                              blue: CGFloat.random(in: 0...1),
                                              alpha: 1).cgColor)
                context.fill(CGRect(x: x, y: y, width: 4, height: 4))
            }
        }
        let image = UIGraphicsGetImageFromCurrentImageContext()!
        let inputData = image.jpegData(compressionQuality: 1.0)!
        XCTAssertGreaterThan(inputData.count, 500 * 1024,
                              "Test setup: input must exceed 500KB to be meaningful")

        let compressed = AttachmentUploader.compress(inputData, maxSizeKB: 500)

        XCTAssertLessThanOrEqual(compressed.count, 500 * 1024,
                                  "Compression must bring output under 500KB")
    }
}
