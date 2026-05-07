import Foundation
import AVFoundation
import os
import MeeshySDK

@MainActor
public protocol AudioMixerProviding: AnyObject {
    var isMuted: Bool { get set }
    var maxActiveNodes: Int { get }
    func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws
    func play() throws
    func pause()
    func seek(to time: Float)
    func setVolume(_ volume: Float, for audioId: String)
    func setMute(_ muted: Bool)
    func teardown()
}

@MainActor
public final class AudioMixer: AudioMixerProviding {

    public private(set) var maxActiveNodes: Int
    public var isMuted: Bool = false { didSet { applyMute() } }
    public private(set) var lastSeekTime: Float = 0
    public var isPlaying: Bool { _isPlayingStorage }
    public var activeNodeCount: Int { nodes.count }
    public func intendedVolume(for audioId: String) -> Float? { volumes[audioId] }

    private let logger = Logger(subsystem: "me.meeshy.app", category: "media")
    private let engine = AVAudioEngine()
    private var nodes: [String: AVAudioPlayerNode] = [:]
    private var files: [String: AVAudioFile] = [:]
    private var volumes: [String: Float] = [:]
    private var _isPlayingStorage: Bool = false

    public init(maxActiveNodes: Int = 6) {
        self.maxActiveNodes = maxActiveNodes
    }

    public func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws {
        teardown()
        var attached = 0
        for audio in audios {
            volumes[audio.id] = max(0, min(1, audio.volume))
            guard attached < maxActiveNodes else {
                logger.info("AudioMixer cap reached at \(self.maxActiveNodes), skipping audio \(audio.id)")
                continue
            }
            guard let url = urls[audio.id] else {
                logger.debug("AudioMixer skipping \(audio.id) — no URL")
                continue
            }
            do {
                let file = try AVAudioFile(forReading: url)
                let node = AVAudioPlayerNode()
                engine.attach(node)
                engine.connect(node, to: engine.mainMixerNode, format: file.processingFormat)
                node.volume = isMuted ? 0 : (volumes[audio.id] ?? 1)
                nodes[audio.id] = node
                files[audio.id] = file
                attached += 1
            } catch {
                logger.error("AudioMixer failed to load \(audio.id): \(error.localizedDescription)")
            }
        }
    }

    public func play() throws {
        guard !nodes.isEmpty else {
            _isPlayingStorage = true
            return
        }
        if !engine.isRunning {
            try engine.start()
        }
        for (id, node) in nodes {
            if let file = files[id] {
                node.scheduleFile(file, at: nil, completionHandler: nil)
            }
            node.play()
        }
        _isPlayingStorage = true
    }

    public func pause() {
        for node in nodes.values { node.pause() }
        if engine.isRunning { engine.pause() }
        _isPlayingStorage = false
    }

    public func seek(to time: Float) {
        let clamped = max(0, time)
        lastSeekTime = clamped
        let wasPlaying = _isPlayingStorage
        if wasPlaying {
            for node in nodes.values { node.stop() }
        }
        for (id, node) in nodes {
            guard let file = files[id] else { continue }
            let sampleRate = file.processingFormat.sampleRate
            let frame = AVAudioFramePosition(Double(clamped) * sampleRate)
            let totalFrames = file.length
            guard frame < totalFrames else { continue }
            let remaining = AVAudioFrameCount(totalFrames - frame)
            node.scheduleSegment(file, startingFrame: frame, frameCount: remaining, at: nil, completionHandler: nil)
        }
        if wasPlaying {
            for node in nodes.values { node.play() }
        }
    }

    public func setVolume(_ volume: Float, for audioId: String) {
        let clamped = max(0, min(1, volume))
        volumes[audioId] = clamped
        nodes[audioId]?.volume = isMuted ? 0 : clamped
    }

    public func setMute(_ muted: Bool) {
        isMuted = muted
    }

    public func teardown() {
        nodes.values.forEach { $0.stop() }
        nodes.removeAll()
        files.removeAll()
        volumes.removeAll()
        if engine.isRunning {
            engine.stop()
        }
        _isPlayingStorage = false
    }

    private func applyMute() {
        for (id, node) in nodes {
            node.volume = isMuted ? 0 : (volumes[id] ?? 1)
        }
    }

    deinit {
        MainActor.assumeIsolated {
            self.teardown()
        }
    }
}
