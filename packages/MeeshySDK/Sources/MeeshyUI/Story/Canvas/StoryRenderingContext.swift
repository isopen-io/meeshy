import Foundation
import CoreImage
import Metal
import os
import MeeshySDK

// unchecked: deux `let` immuables ; MTLDevice et MTLCommandQueue sont documentés thread-safe par Apple mais non Sendable dans le SDK.
public struct StoryMetalBackend: @unchecked Sendable {
    public nonisolated let device: MTLDevice
    public nonisolated let commandQueue: MTLCommandQueue

    public nonisolated init(device: MTLDevice, commandQueue: MTLCommandQueue) {
        self.device = device
        self.commandQueue = commandQueue
    }
}

/// Shared rendering context for the Story canvas pipeline.
///
/// Holds a single Display P3 working `CIContext`, GPU-backed when Metal is
/// available and software-rendered otherwise, used by every CALayer-backed
/// canvas surface (composer Edit, composer Play, viewer, AVFoundation
/// custom compositor) so the rendered output is identical across all surfaces.
public final class StoryRenderingContext: @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    // `nonisolated` is required because MeeshyUI compiles with
    // `defaultIsolation(MainActor)` — without these annotations the singleton
    // and its stored properties would be inferred as `@MainActor`, even though
    // the underlying Metal device + CIContext are intentionally thread-safe.
    public nonisolated static let shared = StoryRenderingContext(device: MTLCreateSystemDefaultDevice())

    public nonisolated let gpu: StoryMetalBackend?
    public nonisolated let ciContext: CIContext
    public nonisolated let workingColorSpace: CGColorSpace
    public nonisolated let outputColorSpace: CGColorSpace

    public nonisolated var rendersInSoftware: Bool { gpu == nil }

    nonisolated init(
        device: MTLDevice?,
        makeQueue: (MTLDevice) -> MTLCommandQueue? = { $0.makeCommandQueue() }
    ) {
        let working = CGColorSpace(name: CGColorSpace.displayP3) ?? CGColorSpaceCreateDeviceRGB()
        let output = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        let backend = Self.makeBackend(device: device, makeQueue: makeQueue)
        self.gpu = backend
        self.workingColorSpace = working
        self.outputColorSpace = output
        self.ciContext = Self.makeCIContext(backend: backend, working: working, output: output)
    }

    private nonisolated static func makeBackend(
        device: MTLDevice?,
        makeQueue: (MTLDevice) -> MTLCommandQueue?
    ) -> StoryMetalBackend? {
        guard let device else {
            Logger.media.fault("[StoryRenderingContext] Metal device unavailable, rendering in software")
            return nil
        }
        guard let queue = makeQueue(device) else {
            Logger.media.fault("[StoryRenderingContext] Metal command queue allocation failed, rendering in software")
            return nil
        }
        return StoryMetalBackend(device: device, commandQueue: queue)
    }

    private nonisolated static func makeCIContext(
        backend: StoryMetalBackend?,
        working: CGColorSpace,
        output: CGColorSpace
    ) -> CIContext {
        let options: [CIContextOption: Any] = [
            .workingColorSpace: working,
            .outputColorSpace: output,
            .useSoftwareRenderer: backend == nil,
            .workingFormat: CIFormat.RGBAh,
            .cacheIntermediates: true
        ]
        guard let backend else { return CIContext(options: options) }
        return CIContext(mtlDevice: backend.device, options: options)
    }
}
