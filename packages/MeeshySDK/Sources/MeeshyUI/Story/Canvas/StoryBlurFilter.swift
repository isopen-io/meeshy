import Metal
import MetalPerformanceShaders

/// Stateless Gaussian blur over Metal textures, backed by `MPSImageGaussianBlur`.
/// Out-of-place encode is the simpler contract — the caller owns both the
/// source and destination textures and we don't need to negotiate an in-place
/// fallback allocator. The shared `StoryRenderingContext.commandQueue` is
/// reused (allocating one per call would be wasteful at 60–120 fps).
public enum StoryBlurFilter {

    /// Encodes a synchronous Gaussian blur of `inputTexture` into `outputTexture`.
    /// Returns once the GPU has completed the work.
    public nonisolated static func apply(sigma: Float,
                                         to inputTexture: MTLTexture,
                                         output outputTexture: MTLTexture) {
        let context = StoryRenderingContext.shared
        let blur = MPSImageGaussianBlur(device: context.metalDevice, sigma: sigma)
        guard let buffer = context.commandQueue.makeCommandBuffer() else { return }
        blur.encode(commandBuffer: buffer,
                    sourceTexture: inputTexture,
                    destinationTexture: outputTexture)
        buffer.commit()
        buffer.waitUntilCompleted()
    }

    /// Asynchronous variant — encodes the blur on the shared queue and returns
    /// without blocking. Useful when chained into a longer GPU pipeline. The
    /// caller is responsible for waiting on the buffer if it needs CPU sync.
    public nonisolated static func encode(sigma: Float,
                                          on commandBuffer: MTLCommandBuffer,
                                          source inputTexture: MTLTexture,
                                          destination outputTexture: MTLTexture) {
        let device = commandBuffer.device
        let blur = MPSImageGaussianBlur(device: device, sigma: sigma)
        blur.encode(commandBuffer: commandBuffer,
                    sourceTexture: inputTexture,
                    destinationTexture: outputTexture)
    }
}
