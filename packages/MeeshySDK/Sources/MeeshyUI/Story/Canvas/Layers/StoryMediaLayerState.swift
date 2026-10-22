import UIKit
@preconcurrency import AVFoundation
import QuartzCore
import MeeshySDK

nonisolated struct StoryMediaLayerState {
    var media: StoryMediaObject?
    weak var avPlayer: AVPlayer?
    var avPlayerLayer: AVPlayerLayer?
    var currentTrimBounds: MediaTrimBounds?
    var loopObserver: NSObjectProtocol?
    var imageLoader: any StoryMediaImageLoading = DiskCacheImageLoader()
    var currentLoadTask: Task<Void, Never>?
    var currentVideoLoadTask: Task<Void, Never>?
    var videoLoadGeneration: UInt64 = 0
    var placeholderLayer: CALayer?
    var attachedURL: URL?
    var playerProvider: (any StoryCarrierPlayerProviding)?
    var playsAProvidedPlayer: Bool = false
    var appliedVideoLook: (item: ObjectIdentifier, signature: String)?
    var videoLookTask: Task<Void, Never>?
}
