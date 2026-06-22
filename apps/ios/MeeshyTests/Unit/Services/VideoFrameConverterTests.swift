//
//  VideoFrameConverterTests.swift
//  MeeshyTests
//
//  Couvre le cœur pur de `VideoFrameConverter` (CVPixelBuffer → CMSampleBuffer)
//  qui ne dépend pas de WebRTC — donc testable y compris en mode stub.
//

import XCTest
import CoreMedia
import CoreVideo
@testable import Meeshy

@MainActor
final class VideoFrameConverterTests: XCTestCase {

    private func makeSUT() -> VideoFrameConverter {
        VideoFrameConverter()
    }

    private func makePixelBuffer(width: Int = 320, height: Int = 240,
                                 format: OSType = kCVPixelFormatType_32BGRA) -> CVPixelBuffer {
        var pixelBuffer: CVPixelBuffer?
        let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
        let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, format, attrs as CFDictionary, &pixelBuffer)
        precondition(status == kCVReturnSuccess, "CVPixelBufferCreate failed")
        return pixelBuffer!
    }

    func test_makeSampleBuffer_validPixelBuffer_returnsReadySingleSample() {
        let sut = makeSUT()

        let sample = sut.makeSampleBuffer(pixelBuffer: makePixelBuffer(), timeStampNs: 1_000_000)

        XCTAssertNotNil(sample)
        XCTAssertTrue(CMSampleBufferIsValid(sample!))
        XCTAssertEqual(CMSampleBufferGetNumSamples(sample!), 1)
        XCTAssertNotNil(CMSampleBufferGetImageBuffer(sample!))
    }

    func test_makeSampleBuffer_formatDescriptionMatchesPixelBufferDimensions() {
        let sut = makeSUT()

        let sample = sut.makeSampleBuffer(pixelBuffer: makePixelBuffer(width: 640, height: 480), timeStampNs: 0)

        let format = CMSampleBufferGetFormatDescription(sample!)
        let dimensions = CMVideoFormatDescriptionGetDimensions(format!)
        XCTAssertEqual(dimensions.width, 640)
        XCTAssertEqual(dimensions.height, 480)
    }

    func test_makeSampleBuffer_setsDisplayImmediatelyAttachment() {
        let sut = makeSUT()

        let sample = sut.makeSampleBuffer(pixelBuffer: makePixelBuffer(), timeStampNs: 0)!

        let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[CFString: Any]]
        let displayImmediately = attachments?.first?[kCMSampleAttachmentKey_DisplayImmediately]
        XCTAssertEqual(displayImmediately as? Bool, true)
    }

    func test_makeSampleBuffer_sameDimensions_reusesCachedFormatDescription() {
        let sut = makeSUT()

        let first = sut.makeSampleBuffer(pixelBuffer: makePixelBuffer(width: 320, height: 240), timeStampNs: 0)!
        let second = sut.makeSampleBuffer(pixelBuffer: makePixelBuffer(width: 320, height: 240), timeStampNs: 1)!

        // Cache hit ⇒ exact same CMVideoFormatDescription instance reused.
        XCTAssertTrue(CMSampleBufferGetFormatDescription(first) === CMSampleBufferGetFormatDescription(second))
    }

    func test_makeSampleBuffer_afterReset_stillProducesValidSample() {
        let sut = makeSUT()
        _ = sut.makeSampleBuffer(pixelBuffer: makePixelBuffer(), timeStampNs: 0)

        sut.reset()
        let sample = sut.makeSampleBuffer(pixelBuffer: makePixelBuffer(), timeStampNs: 0)

        XCTAssertNotNil(sample)
    }
}
