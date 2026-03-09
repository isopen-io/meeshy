import Foundation
import QuartzCore
import AVFoundation
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

    // MARK: - Media Playback

    private var videoPlayer: AVPlayer?
    private var audioPlayer: AVAudioPlayer?
    private var activeMediaId: String?
    private var mediaElements: [MediaElement] = []

    struct MediaElement {
        let id: String
        let type: MediaType
        let url: URL?
        let startTime: Float
        let duration: Float
        let volume: Float

        enum MediaType { case video, audio, image }
    }

    func configureMedia(_ elements: [MediaElement]) {
        mediaElements = elements
    }

    func configure(duration: Float) {
        totalDuration = max(0.1, duration)
    }

    func play() {
        guard !isPlaying else { return }
        isPlaying = true
        lastTimestamp = 0
        syncMediaToTime(currentTime)
        #if canImport(UIKit)
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
        link.add(to: .main, forMode: .common)
        displayLink = link
        #endif
    }

    func pause() {
        isPlaying = false
        pauseAllMedia()
        #if canImport(UIKit)
        displayLink?.invalidate()
        displayLink = nil
        #endif
    }

    func seek(to time: Float) {
        currentTime = max(0, min(totalDuration, time))
        onTimeUpdate?(currentTime)
        if isPlaying {
            syncMediaToTime(currentTime)
        }
    }

    func stop() {
        pause()
        stopAllMedia()
        currentTime = 0
        onTimeUpdate?(0)
    }

    func toggle() {
        if isPlaying { pause() } else { play() }
    }

    // MARK: - Media Sync

    private func syncMediaToTime(_ time: Float) {
        for element in mediaElements {
            let elementEnd = element.startTime + element.duration
            let isInRange = time >= element.startTime && time < elementEnd

            guard isInRange else {
                if activeMediaId == element.id {
                    stopMediaForElement(element)
                }
                continue
            }

            let mediaOffset = time - element.startTime

            switch element.type {
            case .video:
                playVideoElement(element, at: mediaOffset)
            case .audio:
                playAudioElement(element, at: mediaOffset)
            case .image:
                break
            }
        }
    }

    private func playVideoElement(_ element: MediaElement, at offset: Float) {
        guard let url = element.url else { return }

        if activeMediaId != element.id {
            stopAllMedia()
            let playerItem = AVPlayerItem(url: url)
            let player = AVPlayer(playerItem: playerItem)
            player.volume = element.volume
            videoPlayer = player
            activeMediaId = element.id

            let cmTime = CMTime(seconds: Double(offset), preferredTimescale: 600)
            player.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero)
            player.play()
        }
    }

    private func playAudioElement(_ element: MediaElement, at offset: Float) {
        guard let url = element.url else { return }

        if activeMediaId != element.id {
            stopAllMedia()
            do {
                let player = try AVAudioPlayer(contentsOf: url)
                player.volume = element.volume
                player.currentTime = TimeInterval(offset)
                player.prepareToPlay()
                player.play()
                audioPlayer = player
                activeMediaId = element.id
            } catch {
                // Audio playback failure — silent fallback
            }
        }
    }

    private func stopMediaForElement(_ element: MediaElement) {
        guard activeMediaId == element.id else { return }
        stopAllMedia()
    }

    private func pauseAllMedia() {
        videoPlayer?.pause()
        audioPlayer?.pause()
    }

    private func stopAllMedia() {
        videoPlayer?.pause()
        videoPlayer = nil
        audioPlayer?.stop()
        audioPlayer = nil
        activeMediaId = nil
    }

    // MARK: - Display Link

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
            stop()
            return
        }

        syncMediaToTime(currentTime)
        onTimeUpdate?(currentTime)
    }
    #endif

    deinit {
        #if canImport(UIKit)
        MainActor.assumeIsolated {
            displayLink?.invalidate()
            videoPlayer?.pause()
            audioPlayer?.stop()
        }
        #endif
    }
}
