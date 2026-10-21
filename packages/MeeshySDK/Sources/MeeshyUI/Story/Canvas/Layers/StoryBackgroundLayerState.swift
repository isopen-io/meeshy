import UIKit
@preconcurrency import AVFoundation
import MeeshySDK

nonisolated struct StoryBackgroundLayerState {
    var kind: StoryBackgroundLayer.Kind = .solidColor(.black)
    var transform3D: BackgroundTransform = BackgroundTransform()
    var contentLayer: CALayer?
    var letterboxFillLayer: CALayer?
    var letterboxFillHashes: [String] = []
    var letterboxSourceImage: UIImage?
    var isLetterboxFillSuppressed: Bool = false
    var playerProvider: (any StoryCarrierPlayerProviding)?
    var avPlayer: AVPlayer?
    var avPlayerLayer: AVPlayerLayer?
    var avPlayerLooper: AVPlayerLooper?
    var appliedBackgroundVideoLook: (player: ObjectIdentifier, signature: String)?
    var backgroundVideoLookTask: Task<Void, Never>?
    var attachedVideoAsset: AVAsset?
}
