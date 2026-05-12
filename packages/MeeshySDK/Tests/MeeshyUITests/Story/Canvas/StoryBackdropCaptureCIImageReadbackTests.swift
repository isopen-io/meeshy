import XCTest
import Metal
import CoreImage
import CoreMedia
import QuartzCore
@testable import MeeshyUI
@testable import MeeshySDK

/// Diagnostic for the SIGSEGV the Step 2 agent flagged : `CIImage(mtlTexture:)`
/// → `createCGImage` on a blit-copied region in bundle env (no UIWindow).
///
/// These tests isolate the readback path WITHOUT involving MPSImageGaussianBlur
/// so we can determine whether the crash is in CIImage/CGImage handling or in
/// the MPS pipeline. If the bare blit→CIImage→CGImage roundtrip succeeds here,
/// the StoryGlassBackdropLayer wiring should be safe in the live composer.
@MainActor
final class StoryBackdropCaptureCIImageReadbackTests: XCTestCase {

    private func makeFilledTexture(width: Int, height: Int) throws -> MTLTexture {
        let device = StoryRenderingContext.shared.metalDevice
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .bgra8Unorm,
            width: width,
            height: height,
            mipmapped: false
        )
        descriptor.usage = [.renderTarget, .shaderRead, .shaderWrite]
        descriptor.storageMode = .shared
        guard let tex = device.makeTexture(descriptor: descriptor) else {
            throw XCTSkip("Metal texture allocation failed (no device or out of memory)")
        }
        // Fill with a known BGRA pattern (opaque red : 0,0,255,255 in BGRA byte order).
        let bytes = [UInt8](repeating: 0xFF, count: width * height * 4)
        tex.replace(region: MTLRegionMake2D(0, 0, width, height),
                    mipmapLevel: 0,
                    withBytes: bytes,
                    bytesPerRow: width * 4)
        return tex
    }

    func test_freshTexture_CIImageReadback_doesNotCrash() throws {
        let tex = try makeFilledTexture(width: 64, height: 64)
        let context = StoryRenderingContext.shared
        guard let ci = CIImage(mtlTexture: tex,
                               options: [.colorSpace: context.workingColorSpace]) else {
            throw XCTSkip("CIImage(mtlTexture:) returned nil — Metal/CI integration unavailable")
        }
        let cg = context.ciContext.createCGImage(ci, from: CGRect(x: 0, y: 0, width: 64, height: 64))
        XCTAssertNotNil(cg, "Fresh-allocated MTLTexture readback must produce a CGImage")
    }

    func test_blitCopiedTextureRegion_CIImageReadback_doesNotCrash() throws {
        // Step 1 : fresh 1080×1920 source texture
        let source = try makeFilledTexture(width: 1080, height: 1920)

        // Step 2 : blit-copy a 200×100 region (mimicking StoryBackdropCapture.cropRegion)
        let device = StoryRenderingContext.shared.metalDevice
        let queue = StoryRenderingContext.shared.commandQueue
        let destDescriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: source.pixelFormat,
            width: 200, height: 100, mipmapped: false
        )
        destDescriptor.usage = [.shaderRead, .shaderWrite, .renderTarget]
        destDescriptor.storageMode = .shared
        guard let cropped = device.makeTexture(descriptor: destDescriptor),
              let buffer = queue.makeCommandBuffer(),
              let blit = buffer.makeBlitCommandEncoder() else {
            throw XCTSkip("Metal blit infrastructure unavailable")
        }
        blit.copy(from: source, sourceSlice: 0, sourceLevel: 0,
                  sourceOrigin: MTLOrigin(x: 100, y: 200, z: 0),
                  sourceSize: MTLSize(width: 200, height: 100, depth: 1),
                  to: cropped, destinationSlice: 0, destinationLevel: 0,
                  destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0))
        blit.endEncoding()
        buffer.commit()
        buffer.waitUntilCompleted()

        // Step 3 : CIImage → createCGImage on the blit-copied region.
        let context = StoryRenderingContext.shared
        guard let ci = CIImage(mtlTexture: cropped,
                               options: [.colorSpace: context.workingColorSpace]) else {
            XCTFail("CIImage(mtlTexture:) returned nil on blit-copied texture — known bundle-env limitation")
            return
        }
        let cg = context.ciContext.createCGImage(ci, from: CGRect(x: 0, y: 0, width: 200, height: 100))
        XCTAssertNotNil(cg,
                        "Blit-copied MTLTexture readback must produce a CGImage — if this crashes/fails the StoryGlassBackdropLayer needs a fallback guard")
    }

    func test_blitCopiedRegion_through_MPSBlur_readback() throws {
        // Mirrors the exact pipeline the agent's downgraded test was avoiding :
        // blit-copy a region → MPS gaussian blur → CIImage(mtlTexture:) →
        // createCGImage. This is the full StoryGlassBackdropLayer.applyMPSPath
        // sequence, exercised on a synthetic backdrop.
        let source = try makeFilledTexture(width: 1080, height: 1920)

        let device = StoryRenderingContext.shared.metalDevice
        let queue = StoryRenderingContext.shared.commandQueue
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: source.pixelFormat,
            width: 280, height: 120, mipmapped: false
        )
        descriptor.usage = [.shaderRead, .shaderWrite, .renderTarget]
        descriptor.storageMode = .shared
        guard let cropped = device.makeTexture(descriptor: descriptor),
              let blitCmd = queue.makeCommandBuffer(),
              let blit = blitCmd.makeBlitCommandEncoder() else {
            throw XCTSkip("Metal blit unavailable")
        }
        blit.copy(from: source, sourceSlice: 0, sourceLevel: 0,
                  sourceOrigin: MTLOrigin(x: 400, y: 800, z: 0),
                  sourceSize: MTLSize(width: 280, height: 120, depth: 1),
                  to: cropped, destinationSlice: 0, destinationLevel: 0,
                  destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0))
        blit.endEncoding()
        blitCmd.commit()
        blitCmd.waitUntilCompleted()

        // Now MPS blur into a fresh output texture (same path as
        // StoryGlassBackdropLayer.applyMPSPath).
        let outDescriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: cropped.pixelFormat,
            width: cropped.width, height: cropped.height, mipmapped: false
        )
        outDescriptor.usage = [.shaderRead, .shaderWrite, .renderTarget]
        outDescriptor.storageMode = .shared
        guard let output = device.makeTexture(descriptor: outDescriptor) else {
            throw XCTSkip("Metal output texture allocation failed")
        }
        StoryBlurFilter.apply(sigma: 18, to: cropped, output: output)

        // Readback through CIImage → CGImage.
        let context = StoryRenderingContext.shared
        guard let ci = CIImage(mtlTexture: output,
                               options: [.colorSpace: context.workingColorSpace]) else {
            XCTFail("CIImage(mtlTexture:) returned nil on MPS-blurred blit-copied texture")
            return
        }
        let cg = context.ciContext.createCGImage(
            ci,
            from: CGRect(x: 0, y: 0, width: output.width, height: output.height)
        )
        XCTAssertNotNil(cg,
                        "Full MPS pipeline readback must succeed — this is the exact path StoryGlassBackdropLayer.applyMPSPath runs at composer / export time")
    }

    func test_endToEndCapture_via_StoryBackdropCapture_readback() throws {
        let glassText = StoryTextObject(id: "g1", text: "G", x: 0.5, y: 0.5,
                                        backgroundStyle: .glass(radius: 18))
        let solidText = StoryTextObject(id: "s1", text: "S", x: 0.3, y: 0.3,
                                        backgroundStyle: .solid(hex: "FF0000"))
        let effects = StoryEffects(textObjects: [glassText, solidText])
        let slide = StorySlide(id: "slide-glass", effects: effects)
        let geom = CanvasGeometry(renderSize: CGSize(width: 1080, height: 1920))

        let capture = StoryBackdropCapture()
        let canvasBackdrop = capture.captureCanvasBackdrop(slide: slide,
                                                            geometry: geom,
                                                            time: .zero,
                                                            mode: .play,
                                                            languages: [])
        guard canvasBackdrop != nil else {
            throw XCTSkip("captureCanvasBackdrop returned nil — Metal unavailable in test env")
        }

        let cropped = capture.cropRegion(CGRect(x: 400, y: 800, width: 280, height: 120))
        guard let cropped else {
            XCTFail("cropRegion returned nil for an in-bounds frame")
            return
        }

        // Now the readback that the agent's downgraded test skipped :
        let context = StoryRenderingContext.shared
        guard let ci = CIImage(mtlTexture: cropped,
                               options: [.colorSpace: context.workingColorSpace]) else {
            XCTFail("CIImage(mtlTexture:) returned nil on StoryBackdropCapture-cropped texture")
            return
        }
        let cg = context.ciContext.createCGImage(
            ci,
            from: CGRect(x: 0, y: 0, width: cropped.width, height: cropped.height)
        )
        XCTAssertNotNil(cg,
                        "End-to-end backdrop capture → CGImage readback must succeed for the live composer + AVCompositor paths to work")
    }
}
