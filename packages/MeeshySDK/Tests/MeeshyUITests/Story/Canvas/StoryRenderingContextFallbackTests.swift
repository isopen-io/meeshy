import XCTest
import CoreImage
import Metal
@testable import MeeshyUI
@testable import MeeshySDK

final class StoryRenderingContextFallbackTests: XCTestCase {

    private func makeSoftwareContext() -> StoryRenderingContext {
        StoryRenderingContext(device: nil)
    }

    func test_init_withoutMetalDevice_doesNotTrapAndHasNoGPU() {
        let context = makeSoftwareContext()
        XCTAssertNil(context.gpu)
        XCTAssertTrue(context.rendersInSoftware)
    }

    func test_init_whenCommandQueueAllocationFails_fallsBackToSoftware() throws {
        let device = try XCTUnwrap(MTLCreateSystemDefaultDevice(), "Metal unavailable on this host")
        let context = StoryRenderingContext(device: device, makeQueue: { _ in nil })
        XCTAssertNil(context.gpu)
        XCTAssertTrue(context.rendersInSoftware)
    }

    func test_softwareContext_rendersACIImageToCGImage() throws {
        let context = makeSoftwareContext()
        let rect = CGRect(x: 0, y: 0, width: 4, height: 4)
        let image = CIImage(color: .red).cropped(to: rect)
        let cgImage = try XCTUnwrap(context.ciContext.createCGImage(image, from: rect))
        XCTAssertEqual(cgImage.width, 4)
        XCTAssertEqual(cgImage.height, 4)
    }

    func test_softwareContext_keepsTheSameColorSpaces() throws {
        let device = MTLCreateSystemDefaultDevice()
        let software = makeSoftwareContext()
        let hardware = StoryRenderingContext(device: device)
        XCTAssertEqual(software.workingColorSpace.name, CGColorSpace.displayP3)
        XCTAssertEqual(software.outputColorSpace.name, CGColorSpace.sRGB)
        XCTAssertEqual(hardware.workingColorSpace.name, software.workingColorSpace.name)
        XCTAssertEqual(hardware.outputColorSpace.name, software.outputColorSpace.name)
    }

    func test_init_withDevice_exposesGPUBackend() throws {
        try XCTSkipUnless(MTLCreateSystemDefaultDevice() != nil, "Metal unavailable on this host")
        let context = StoryRenderingContext(device: MTLCreateSystemDefaultDevice())
        XCTAssertNotNil(context.gpu)
        XCTAssertFalse(context.rendersInSoftware)
    }
}
