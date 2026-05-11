import Testing
import Foundation
import Metal
@testable import MeeshyUI

@Suite("StoryBlurFilter — MPSImageGaussianBlur wiring")
struct StoryBlurFilterTests {

    /// Tiny 8×8 BGRA8 input/output texture pair. Backed by `.shared` storage so
    /// we can poke seed bytes from the CPU before the GPU runs.
    private func makeTexturePair(size: Int = 8) -> (input: MTLTexture, output: MTLTexture, device: MTLDevice)? {
        // Skip gracefully on test hosts without a Metal device.
        guard let device = MTLCreateSystemDefaultDevice() else { return nil }
        let descriptor = MTLTextureDescriptor.texture2DDescriptor(
            pixelFormat: .bgra8Unorm,
            width: size,
            height: size,
            mipmapped: false
        )
        descriptor.usage = [.shaderRead, .shaderWrite]
        descriptor.storageMode = .shared
        guard let input = device.makeTexture(descriptor: descriptor),
              let output = device.makeTexture(descriptor: descriptor) else {
            return nil
        }
        // Seed input: solid blue (B=255,G=0,R=0,A=255).
        let pixelCount = size * size
        var pixels = [UInt8](repeating: 0, count: pixelCount * 4)
        for i in 0..<pixelCount {
            pixels[i * 4 + 0] = 255 // B
            pixels[i * 4 + 1] = 0   // G
            pixels[i * 4 + 2] = 0   // R
            pixels[i * 4 + 3] = 255 // A
        }
        let region = MTLRegionMake2D(0, 0, size, size)
        pixels.withUnsafeBytes { buf in
            input.replace(region: region,
                          mipmapLevel: 0,
                          withBytes: buf.baseAddress!,
                          bytesPerRow: size * 4)
        }
        // Zero output to make the "writes to output" check meaningful.
        var zero = [UInt8](repeating: 0, count: pixelCount * 4)
        zero.withUnsafeBytes { buf in
            output.replace(region: region,
                           mipmapLevel: 0,
                           withBytes: buf.baseAddress!,
                           bytesPerRow: size * 4)
        }
        return (input, output, device)
    }

    private func sampleBlueAt(_ texture: MTLTexture, x: Int, y: Int) -> UInt8 {
        var bytes = [UInt8](repeating: 0, count: 4)
        let region = MTLRegionMake2D(x, y, 1, 1)
        bytes.withUnsafeMutableBytes { buf in
            texture.getBytes(buf.baseAddress!,
                             bytesPerRow: 4,
                             from: region,
                             mipmapLevel: 0)
        }
        return bytes[0] // B channel
    }

    // MARK: - apply (synchronous)

    @Test("apply(sigma:to:output:) writes into the output texture")
    func apply_writesToOutputTexture() throws {
        guard let pair = makeTexturePair() else {
            // Metal unavailable on this test host (rare on simulator, possible on CI).
            return
        }
        // Pre-condition : output is zeroed.
        #expect(sampleBlueAt(pair.output, x: 4, y: 4) == 0)

        StoryBlurFilter.apply(sigma: 2.0,
                              to: pair.input,
                              output: pair.output)

        // Post-condition : the output is no longer all-zero — the GPU has
        // written *something* into it. We don't assert exact pixel values
        // because MPSImageGaussianBlur applies edge clamping, kernel
        // normalisation, and on iOS 26 a working-color-space pass that
        // shifts uniform-input values from 255 → ~229 at the centre and
        // lower at the corners. The contract we care about for the wiring
        // test is "the encoder ran and produced output".
        let centre = sampleBlueAt(pair.output, x: 4, y: 4)
        #expect(centre > 0)
    }

    // MARK: - encode (async on shared buffer)

    @Test("encode(sigma:on:source:destination:) writes via the supplied command buffer")
    func encode_writesToOutputTexture_onSharedBuffer() throws {
        guard let pair = makeTexturePair() else { return }
        guard let queue = pair.device.makeCommandQueue(),
              let buffer = queue.makeCommandBuffer() else {
            Issue.record("Could not allocate command queue/buffer")
            return
        }

        #expect(sampleBlueAt(pair.output, x: 4, y: 4) == 0)

        StoryBlurFilter.encode(sigma: 2.0,
                               on: buffer,
                               source: pair.input,
                               destination: pair.output)
        buffer.commit()
        buffer.waitUntilCompleted()

        let centre = sampleBlueAt(pair.output, x: 4, y: 4)
        #expect(centre > 0)
    }
}
