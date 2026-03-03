import Foundation
import QuartzCore
#if canImport(UIKit)
import UIKit
#endif

@MainActor
final class TimelinePlaybackEngine {

    var onTimeUpdate: ((Float) -> Void)?
    var onPlaybackEnd: (() -> Void)?

    private(set) var isPlaying = false
    private(set) var currentTime: Float = 0

    private var totalDuration: Float = 5
    #if canImport(UIKit)
    private var displayLink: CADisplayLink?
    #endif
    private var lastTimestamp: CFTimeInterval = 0

    func configure(duration: Float) {
        totalDuration = max(0.1, duration)
    }

    func play() {
        guard !isPlaying else { return }
        isPlaying = true
        lastTimestamp = 0
        #if canImport(UIKit)
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
        link.add(to: .main, forMode: .common)
        displayLink = link
        #endif
    }

    func pause() {
        isPlaying = false
        #if canImport(UIKit)
        displayLink?.invalidate()
        displayLink = nil
        #endif
    }

    func seek(to time: Float) {
        currentTime = max(0, min(totalDuration, time))
        onTimeUpdate?(currentTime)
    }

    func stop() {
        pause()
        currentTime = 0
        onTimeUpdate?(0)
    }

    func toggle() {
        if isPlaying { pause() } else { play() }
    }

    #if canImport(UIKit)
    @objc private func tick(_ link: CADisplayLink) {
        if lastTimestamp == 0 {
            lastTimestamp = link.timestamp
            return
        }
        let delta = Float(link.timestamp - lastTimestamp)
        lastTimestamp = link.timestamp
        currentTime += delta

        if currentTime >= totalDuration {
            currentTime = totalDuration
            onTimeUpdate?(currentTime)
            onPlaybackEnd?()
            pause()
            return
        }
        onTimeUpdate?(currentTime)
    }
    #endif

    deinit {
        #if canImport(UIKit)
        displayLink?.invalidate()
        #endif
    }
}
