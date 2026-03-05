# Story Timeline NLE Editor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing stub TimelinePanel with a fully functional NLE-style timeline editor featuring drag-to-resize track bars, video frame strips, audio waveforms, in-place playback preview, and a track detail popover — all with zero UI freezes.

**Architecture:** The timeline is a self-contained panel within the existing StoryComposerView tool system (`.timeline` tool mode). It reads/writes through `StoryComposerViewModel.currentEffects`. A new `TimelinePlaybackEngine` drives in-place preview via CADisplayLink, publishing `timelinePlaybackTime` that the canvas observes for element visibility. Video frame extraction uses a dedicated Swift Actor with LRU caching. All heavy work runs off main thread.

**Tech Stack:** SwiftUI, AVFoundation (AVAssetImageGenerator, AVPlayer, AVAudioPlayer), CADisplayLink, Swift Actors, Combine

**Base path:** `packages/MeeshySDK/Sources/MeeshyUI/Story/`
**Models path:** `packages/MeeshySDK/Sources/MeeshySDK/Models/`
**Build command:** `./apps/ios/meeshy.sh build`

---

## Task 1: VideoFrameExtractor — Async Video Thumbnail Extraction Actor

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Cache/VideoFrameExtractor.swift`

This is a standalone Actor that extracts uniformly-spaced frames from a video URL. It caches results per objectId and evicts on memory pressure. Used by timeline track bars to display video frame strips.

**Step 1: Create VideoFrameExtractor.swift**

```swift
import AVFoundation
import UIKit

public actor VideoFrameExtractor {

    public static let shared = VideoFrameExtractor()

    private var cache: [String: [UIImage]] = [:]
    private var inFlight: [String: Task<[UIImage], Never>] = [:]
    private let maxCacheEntries = 20

    private init() {
        Task { @MainActor in
            NotificationCenter.default.addObserver(
                forName: UIApplication.didReceiveMemoryWarningNotification,
                object: nil, queue: .main
            ) { [weak self] _ in
                guard let self else { return }
                Task { await self.evictAll() }
            }
        }
    }

    /// Extract `count` frames uniformly from the video at `url`.
    /// Results cached by `objectId`. Max 30 frames, ~1 frame/sec.
    public func extractFrames(
        objectId: String,
        url: URL,
        maxFrames: Int = 30
    ) async -> [UIImage] {
        if let cached = cache[objectId] { return cached }
        if let existing = inFlight[objectId] { return await existing.value }

        let task = Task<[UIImage], Never>.detached(priority: .utility) {
            await Self.doExtract(url: url, maxFrames: maxFrames)
        }
        inFlight[objectId] = task
        let result = await task.value
        inFlight.removeValue(forKey: objectId)

        if cache.count >= maxCacheEntries {
            cache.removeValue(forKey: cache.keys.first ?? "")
        }
        cache[objectId] = result
        return result
    }

    public func evict(objectId: String) {
        cache.removeValue(forKey: objectId)
    }

    public func evictAll() {
        cache.removeAll()
    }

    private static func doExtract(url: URL, maxFrames: Int) async -> [UIImage] {
        let asset = AVURLAsset(url: url)
        guard let duration = try? await asset.load(.duration),
              duration.seconds > 0 else { return [] }

        let totalSec = duration.seconds
        let count = min(maxFrames, max(1, Int(totalSec)))
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 80, height: 80)
        generator.requestedTimeToleranceBefore = CMTime(seconds: 0.5, preferredTimescale: 600)
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)

        var frames: [UIImage] = []
        let interval = totalSec / Double(count)

        for i in 0..<count {
            if Task.isCancelled { break }
            let time = CMTime(seconds: interval * Double(i), preferredTimescale: 600)
            if let cgImage = try? generator.copyCGImage(at: time, actualTime: nil) {
                frames.append(UIImage(cgImage: cgImage))
            }
        }
        return frames
    }
}
```

**Step 2: Build to verify compilation**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```
feat(timeline): add VideoFrameExtractor actor for async video thumbnail extraction
```

---

## Task 2: ViewModel — Add Timeline Playback State & Slide Duration Editing

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift`

Add properties for timeline playback time, playing state, zoom scale, and a method to update slide duration. Remove the `TimelineMode` enum (we're dropping the simple/advanced toggle).

**Step 1: Add timeline playback properties to ViewModel**

In `StoryComposerViewModel`, replace the existing `// MARK: - Timeline` section (lines 118-121) with:

```swift
// MARK: - Timeline

var timelinePlaybackTime: Float = 0
var isTimelinePlaying: Bool = false
var timelineZoomScale: CGFloat = 1.0
var timelineScrollOffset: CGFloat = 0
```

Remove or keep `isTimelineVisible` and `timelineMode` — we keep `isTimelineVisible` for compatibility but remove `timelineMode`.

**Step 2: Add slide duration setter**

Add after the Timeline section:

```swift
// MARK: - Slide Duration

var currentSlideDuration: Float {
    get { Float(currentSlide.duration) }
    set {
        let clamped = max(2, min(30, newValue))
        var slide = currentSlide
        slide.duration = TimeInterval(clamped)
        currentSlide = slide
    }
}

func autoExtendDuration(forElementEnd end: Float) {
    if end > currentSlideDuration {
        currentSlideDuration = min(30, end + 0.5)
    }
}
```

**Step 3: Update reset() to clear new properties**

In `reset()`, after `timelineMode = .simple` (or replace that line), add:

```swift
timelinePlaybackTime = 0
isTimelinePlaying = false
timelineZoomScale = 1.0
timelineScrollOffset = 0
```

**Step 4: Remove `TimelineMode` enum**

Delete the `enum TimelineMode` block (lines 35-37). If anything references it, remove those references. The `timelineMode` property in ViewModel should be removed.

**Step 5: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED (fix any references to `timelineMode` that break)

**Step 6: Commit**

```
feat(timeline): add playback state and slide duration editing to ViewModel
```

---

## Task 3: TimelineTrackView — Rewrite as Drag-Resizable Track Bars

**Files:**
- Rewrite: `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelineTrackView.swift`

Complete rewrite. The file provides:
1. `TrackType` enum (kept, colors updated for theme)
2. `TimelineTrack` struct (kept, same shape)
3. `TimelineTrackBar` view — the draggable bar with video frame strip, waveform, or text label
4. `TrackLabel` — left-side icon + name

Key interactions:
- Drag left edge → adjust `startTime` (minimum 0)
- Drag right edge → adjust `duration`
- Drag center → move `startTime` keeping duration constant
- Tap → select track (highlight + select in canvas)
- Visual: fade gradients at edges if fadeIn/fadeOut set

**Step 1: Rewrite TimelineTrackView.swift**

```swift
import SwiftUI
import MeeshySDK

// MARK: - Track Type

enum TrackType: String {
    case bgVideo, bgAudio, fgVideo, fgAudio, text

    var icon: String {
        switch self {
        case .bgVideo: return "tv.fill"
        case .bgAudio: return "music.note"
        case .fgVideo: return "video.fill"
        case .fgAudio: return "waveform"
        case .text:    return "textformat"
        }
    }

    var color: Color {
        switch self {
        case .bgVideo: return MeeshyColors.indigo700
        case .bgAudio: return MeeshyColors.indigo500
        case .fgVideo: return MeeshyColors.indigo400
        case .fgAudio: return MeeshyColors.indigo300
        case .text:    return MeeshyColors.indigo200
        }
    }

    var sortOrder: Int {
        switch self {
        case .bgVideo: return 0
        case .bgAudio: return 1
        case .fgVideo: return 2
        case .fgAudio: return 3
        case .text:    return 4
        }
    }
}

// MARK: - Track Data

struct TimelineTrack: Identifiable {
    let id: String
    let name: String
    let type: TrackType
    var startTime: Float
    var duration: Float?
    var volume: Float?
    var loop: Bool
    var fadeIn: Float?
    var fadeOut: Float?
    var waveformSamples: [Float]?
    var videoURL: URL?
}

// MARK: - Timeline Track Bar

struct TimelineTrackBar: View {
    @Binding var track: TimelineTrack
    let totalDuration: Float
    let pixelsPerSecond: CGFloat
    let isSelected: Bool
    var onSelect: () -> Void
    var onChanged: (TimelineTrack) -> Void
    var onDetailTap: () -> Void

    @State private var videoFrames: [UIImage] = []
    @State private var dragEdge: DragEdge? = nil

    private enum DragEdge { case left, right, center }

    private let trackHeight: CGFloat = 36
    private let handleWidth: CGFloat = 12

    var body: some View {
        let totalWidth = CGFloat(totalDuration) * pixelsPerSecond
        let barStartX = CGFloat(track.startTime) * pixelsPerSecond
        let durSec = track.duration ?? (totalDuration - track.startTime)
        let barWidth = max(handleWidth * 2 + 4, CGFloat(durSec) * pixelsPerSecond)

        ZStack(alignment: .leading) {
            // Full track background lane
            Rectangle()
                .fill(Color.white.opacity(0.03))
                .frame(width: totalWidth, height: trackHeight)

            // The track bar itself
            trackBarContent(barWidth: barWidth, durSec: durSec)
                .frame(width: barWidth, height: trackHeight)
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(
                            isSelected ? MeeshyColors.brandPrimary : Color.clear,
                            lineWidth: isSelected ? 1.5 : 0
                        )
                )
                .overlay(dragHandles(barWidth: barWidth))
                .offset(x: barStartX)
                .gesture(centerDragGesture(barWidth: barWidth))
                .onTapGesture { onSelect() }
                .onLongPressGesture(minimumDuration: 0.3) { onDetailTap() }
        }
        .frame(height: trackHeight)
        .task(id: track.videoURL) {
            guard let url = track.videoURL, track.type == .fgVideo || track.type == .bgVideo else { return }
            videoFrames = await VideoFrameExtractor.shared.extractFrames(objectId: track.id, url: url)
        }
    }

    // MARK: - Track Bar Content

    @ViewBuilder
    private func trackBarContent(barWidth: CGFloat, durSec: Float) -> some View {
        ZStack {
            // Base fill
            track.type.color.opacity(0.6)

            // Video frame strip
            if (track.type == .fgVideo || track.type == .bgVideo), !videoFrames.isEmpty {
                videoFrameStrip(barWidth: barWidth)
            }

            // Audio waveform
            if (track.type == .fgAudio || track.type == .bgAudio),
               let samples = track.waveformSamples, !samples.isEmpty {
                waveformView(samples: samples, barWidth: barWidth)
            }

            // Text label
            if track.type == .text {
                HStack {
                    Text(track.name)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.white.opacity(0.9))
                        .lineLimit(1)
                        .padding(.leading, handleWidth + 4)
                    Spacer()
                }
            }

            // Fade gradients
            fadeOverlays(barWidth: barWidth, durSec: durSec)
        }
    }

    // MARK: - Video Frame Strip

    private func videoFrameStrip(barWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(videoFrames.enumerated()), id: \.offset) { _, frame in
                Image(uiImage: frame)
                    .resizable()
                    .scaledToFill()
                    .frame(width: max(1, barWidth / CGFloat(max(1, videoFrames.count))),
                           height: trackHeight)
                    .clipped()
            }
        }
        .opacity(0.7)
    }

    // MARK: - Waveform View

    private func waveformView(samples: [Float], barWidth: CGFloat) -> some View {
        Canvas { context, size in
            let count = samples.count
            guard count > 0 else { return }
            let stepW = size.width / CGFloat(count)
            let midY = size.height / 2

            var path = Path()
            for (i, sample) in samples.enumerated() {
                let x = CGFloat(i) * stepW + stepW / 2
                let amp = CGFloat(sample) * midY * 0.8
                path.move(to: CGPoint(x: x, y: midY - amp))
                path.addLine(to: CGPoint(x: x, y: midY + amp))
            }
            context.stroke(path, with: .color(.white.opacity(0.6)), lineWidth: 1.5)
        }
        .allowsHitTesting(false)
    }

    // MARK: - Fade Overlays

    @ViewBuilder
    private func fadeOverlays(barWidth: CGFloat, durSec: Float) -> some View {
        HStack(spacing: 0) {
            if let fi = track.fadeIn, fi > 0, durSec > 0 {
                LinearGradient(
                    colors: [Color.black.opacity(0.5), .clear],
                    startPoint: .leading, endPoint: .trailing
                )
                .frame(width: max(4, barWidth * CGFloat(fi / durSec)))
            }
            Spacer(minLength: 0)
            if let fo = track.fadeOut, fo > 0, durSec > 0 {
                LinearGradient(
                    colors: [.clear, Color.black.opacity(0.5)],
                    startPoint: .leading, endPoint: .trailing
                )
                .frame(width: max(4, barWidth * CGFloat(fo / durSec)))
            }
        }
        .allowsHitTesting(false)
    }

    // MARK: - Drag Handles

    private func dragHandles(barWidth: CGFloat) -> some View {
        HStack(spacing: 0) {
            // Left handle
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.white.opacity(isSelected ? 0.9 : 0.5))
                .frame(width: 4, height: 16)
                .padding(.leading, 4)
                .contentShape(Rectangle().size(width: handleWidth, height: trackHeight))
                .gesture(leftHandleDrag)

            Spacer()

            // Right handle
            RoundedRectangle(cornerRadius: 2)
                .fill(Color.white.opacity(isSelected ? 0.9 : 0.5))
                .frame(width: 4, height: 16)
                .padding(.trailing, 4)
                .contentShape(Rectangle().size(width: handleWidth, height: trackHeight))
                .gesture(rightHandleDrag)
        }
    }

    // MARK: - Gestures

    private var leftHandleDrag: some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                let delta = Float(value.translation.width / pixelsPerSecond)
                let newStart = max(0, track.startTime + delta)
                let currentEnd = track.startTime + (track.duration ?? (totalDuration - track.startTime))
                let newDur = currentEnd - newStart
                guard newDur >= 0.5 else { return }
                track.startTime = newStart
                track.duration = newDur
            }
            .onEnded { _ in onChanged(track) }
    }

    private var rightHandleDrag: some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                let delta = Float(value.translation.width / pixelsPerSecond)
                let currentDur = track.duration ?? (totalDuration - track.startTime)
                let newDur = max(0.5, currentDur + delta)
                track.duration = min(newDur, totalDuration - track.startTime)
            }
            .onEnded { _ in onChanged(track) }
    }

    private func centerDragGesture(barWidth: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { value in
                let delta = Float(value.translation.width / pixelsPerSecond)
                let dur = track.duration ?? (totalDuration - track.startTime)
                let newStart = max(0, min(totalDuration - dur, track.startTime + delta))
                track.startTime = newStart
            }
            .onEnded { _ in onChanged(track) }
    }
}

// MARK: - Track Label (left column)

struct TrackLabel: View {
    let track: TimelineTrack
    let isSelected: Bool

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: track.type.icon)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(track.type.color)
            Text(track.name)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(isSelected ? .white : .white.opacity(0.6))
                .lineLimit(1)
        }
        .frame(width: 64, alignment: .leading)
    }
}
```

**Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```
feat(timeline): rewrite TimelineTrackView with drag-resizable bars, video strips, waveforms
```

---

## Task 4: TrackDetailPopover — Fade/Volume/Loop Controls

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/TrackDetailPopover.swift`

A compact popover shown on long-press of a track bar. Contains sliders for fade-in, fade-out, volume, and a loop toggle. Theme-aware (dark/light).

**Step 1: Create TrackDetailPopover.swift**

```swift
import SwiftUI
import MeeshySDK

struct TrackDetailPopover: View {
    @Binding var track: TimelineTrack
    let totalDuration: Float
    var onChanged: (TimelineTrack) -> Void
    var onDismiss: () -> Void

    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 12) {
            header
            Divider().overlay(MeeshyColors.indigo900.opacity(0.5))
            timingSection
            if track.type != .text {
                Divider().overlay(MeeshyColors.indigo900.opacity(0.5))
                audioSection
            }
        }
        .padding(14)
        .frame(width: 260)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(theme.backgroundSecondary.opacity(0.85))
                )
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.4), radius: 20, y: 8)
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Image(systemName: track.type.icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(track.type.color)
            Text(track.name)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)
            Spacer()
            Button { onDismiss() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Timing

    private var timingSection: some View {
        VStack(spacing: 8) {
            compactSlider(
                label: "Fade In",
                value: Binding(
                    get: { track.fadeIn ?? 0 },
                    set: { track.fadeIn = $0 > 0 ? $0 : nil; onChanged(track) }
                ),
                range: 0...3,
                unit: "s"
            )
            compactSlider(
                label: "Fade Out",
                value: Binding(
                    get: { track.fadeOut ?? 0 },
                    set: { track.fadeOut = $0 > 0 ? $0 : nil; onChanged(track) }
                ),
                range: 0...3,
                unit: "s"
            )
        }
    }

    // MARK: - Audio Controls

    private var audioSection: some View {
        VStack(spacing: 8) {
            compactSlider(
                label: "Volume",
                value: Binding(
                    get: { track.volume ?? 1 },
                    set: { track.volume = $0; onChanged(track) }
                ),
                range: 0...1,
                unit: "%",
                displayMultiplier: 100
            )
            HStack {
                Text("Boucle")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Toggle("", isOn: Binding(
                    get: { track.loop },
                    set: { track.loop = $0; onChanged(track) }
                ))
                .toggleStyle(SwitchToggleStyle(tint: track.type.color))
                .labelsHidden()
                .scaleEffect(0.8)
            }
        }
    }

    // MARK: - Compact Slider

    private func compactSlider(
        label: String,
        value: Binding<Float>,
        range: ClosedRange<Float>,
        unit: String,
        displayMultiplier: Float = 1
    ) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 56, alignment: .leading)
            Slider(
                value: Binding(
                    get: { Double(value.wrappedValue) },
                    set: { value.wrappedValue = Float($0) }
                ),
                in: Double(range.lowerBound)...Double(range.upperBound)
            )
            .tint(track.type.color)
            Text(unit == "%" ? "\(Int(value.wrappedValue * displayMultiplier))\(unit)" :
                    String(format: "%.1f\(unit)", value.wrappedValue))
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 36, alignment: .trailing)
        }
    }
}
```

**Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```
feat(timeline): add TrackDetailPopover for fade/volume/loop controls
```

---

## Task 5: TimelinePlaybackEngine — CADisplayLink Preview Engine

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePlaybackEngine.swift`

Uses CADisplayLink (native 60fps timer) to drive the playhead. Published `currentTime` is observed by the ViewModel. Manages no AVPlayers itself — the canvas and composer handle media playback based on the published time.

**Step 1: Create TimelinePlaybackEngine.swift**

```swift
import Foundation
import QuartzCore
import Combine

@MainActor
final class TimelinePlaybackEngine {

    var onTimeUpdate: ((Float) -> Void)?
    var onPlaybackEnd: (() -> Void)?

    private(set) var isPlaying = false
    private(set) var currentTime: Float = 0

    private var totalDuration: Float = 5
    private var displayLink: CADisplayLink?
    private var lastTimestamp: CFTimeInterval = 0

    func configure(duration: Float) {
        totalDuration = max(0.1, duration)
    }

    func play() {
        guard !isPlaying else { return }
        isPlaying = true
        lastTimestamp = 0
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
        link.add(to: .main, forMode: .common)
        displayLink = link
    }

    func pause() {
        isPlaying = false
        displayLink?.invalidate()
        displayLink = nil
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

    deinit {
        displayLink?.invalidate()
    }
}
```

**Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```
feat(timeline): add TimelinePlaybackEngine with CADisplayLink for in-place preview
```

---

## Task 6: TimelinePanel — Complete NLE Editor Rewrite

**Files:**
- Rewrite: `packages/MeeshySDK/Sources/MeeshyUI/Story/TimelinePanel.swift`

This is the biggest task. The TimelinePanel becomes a full NLE editor with:
- Transport bar (play/pause, rewind, time display)
- Time ruler with pinch-to-zoom
- Track lanes (label column + scrollable bar area)
- Draggable playhead
- Slide duration drag handle
- Track detail popover on long-press

**Step 1: Rewrite TimelinePanel.swift**

```swift
import SwiftUI
import MeeshySDK

// MARK: - Timeline Panel

struct TimelinePanel: View {
    @Bindable var viewModel: StoryComposerViewModel
    @State private var tracks: [TimelineTrack] = []
    @State private var engine = TimelinePlaybackEngine()
    @State private var detailTrackId: String?
    @State private var zoomScale: CGFloat = 1.0
    @Environment(\.theme) private var theme

    private let labelWidth: CGFloat = 68
    private let trackHeight: CGFloat = 36
    private let rulerHeight: CGFloat = 24
    private let basePixelsPerSecond: CGFloat = 50

    private var pixelsPerSecond: CGFloat { basePixelsPerSecond * zoomScale }
    private var slideDuration: Float { viewModel.currentSlideDuration }
    private var totalTimelineWidth: CGFloat { CGFloat(slideDuration) * pixelsPerSecond }

    var body: some View {
        VStack(spacing: 0) {
            transportBar
            Divider().overlay(MeeshyColors.indigo900.opacity(0.5))
            timelineContent
        }
        .background(theme.backgroundPrimary.opacity(0.95))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onAppear {
            buildTracks()
            engine.configure(duration: slideDuration)
            engine.onTimeUpdate = { time in
                viewModel.timelinePlaybackTime = time
            }
            engine.onPlaybackEnd = {
                viewModel.isTimelinePlaying = false
            }
        }
        .onChange(of: viewModel.currentSlideIndex) { buildTracks() }
        .onChange(of: viewModel.currentEffects.textObjects) { buildTracks() }
        .onChange(of: viewModel.currentEffects.mediaObjects) { buildTracks() }
        .onChange(of: viewModel.currentEffects.audioPlayerObjects) { buildTracks() }
        .onDisappear {
            engine.stop()
            viewModel.isTimelinePlaying = false
            viewModel.timelinePlaybackTime = 0
        }
    }

    // MARK: - Transport Bar

    private var transportBar: some View {
        HStack(spacing: 14) {
            Button { engine.stop(); viewModel.isTimelinePlaying = false; viewModel.timelinePlaybackTime = 0 } label: {
                Image(systemName: "backward.end.fill")
                    .font(.system(size: 13))
            }

            Button {
                engine.configure(duration: slideDuration)
                engine.toggle()
                viewModel.isTimelinePlaying = engine.isPlaying
            } label: {
                Image(systemName: viewModel.isTimelinePlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 15))
                    .frame(width: 32, height: 32)
                    .background(
                        Circle().fill(MeeshyColors.brandGradient)
                    )
            }

            Spacer()

            Text(formatTime(viewModel.timelinePlaybackTime))
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(.white)
            Text("/ \(formatTime(slideDuration))")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    // MARK: - Timeline Content

    private var timelineContent: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 0) {
                // Time ruler + playhead
                timeRuler

                // Track rows
                ForEach($tracks) { $track in
                    trackRow(track: $track)
                }

                if tracks.isEmpty {
                    emptyState
                }
            }
        }
        .frame(maxHeight: 300)
        .gesture(
            MagnificationGesture()
                .onChanged { value in
                    zoomScale = max(0.5, min(4.0, value))
                }
        )
    }

    // MARK: - Time Ruler

    private var timeRuler: some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: labelWidth)

            ScrollView(.horizontal, showsIndicators: false) {
                ZStack(alignment: .leading) {
                    // Tick marks
                    timeTickMarks

                    // Playhead
                    playhead

                    // Duration drag handle
                    durationHandle
                }
                .frame(width: totalTimelineWidth, height: rulerHeight)
            }
        }
        .frame(height: rulerHeight)
    }

    private var timeTickMarks: some View {
        Canvas { context, size in
            let totalSec = max(1, slideDuration)
            let pps = pixelsPerSecond

            // Determine tick interval based on zoom
            let tickInterval: Float = zoomScale > 2 ? 0.5 : (zoomScale > 1 ? 1 : 2)
            var t: Float = 0
            while t <= totalSec {
                let x = CGFloat(t) * pps
                let isMajor = t.truncatingRemainder(dividingBy: max(1, tickInterval * 2)) < 0.01
                let h: CGFloat = isMajor ? 12 : 6
                context.stroke(
                    Path { p in p.move(to: CGPoint(x: x, y: size.height - h)); p.addLine(to: CGPoint(x: x, y: size.height)) },
                    with: .color(.white.opacity(isMajor ? 0.4 : 0.2)),
                    lineWidth: 1
                )
                if isMajor {
                    context.draw(
                        Text(formatTimeShort(t))
                            .font(.system(size: 8, design: .monospaced))
                            .foregroundStyle(.secondary),
                        at: CGPoint(x: x, y: 6)
                    )
                }
                t += tickInterval
            }
        }
        .allowsHitTesting(false)
    }

    private var playhead: some View {
        let x = CGFloat(viewModel.timelinePlaybackTime) * pixelsPerSecond
        return Rectangle()
            .fill(.white)
            .frame(width: 2, height: rulerHeight + CGFloat(tracks.count) * (trackHeight + 1) + 20)
            .shadow(color: MeeshyColors.indigo400.opacity(0.6), radius: 4)
            .offset(x: x - 1)
            .allowsHitTesting(true)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { val in
                        let t = Float(val.location.x / pixelsPerSecond)
                        engine.seek(to: max(0, min(slideDuration, t)))
                    }
            )
    }

    private var durationHandle: some View {
        let x = CGFloat(slideDuration) * pixelsPerSecond
        return Circle()
            .fill(MeeshyColors.indigo400)
            .frame(width: 10, height: 10)
            .overlay(Circle().stroke(.white, lineWidth: 1))
            .offset(x: x - 5, y: rulerHeight / 2 - 5)
            .gesture(
                DragGesture(minimumDistance: 2)
                    .onChanged { val in
                        let newDur = Float(val.location.x / pixelsPerSecond)
                        viewModel.currentSlideDuration = max(2, min(30, newDur))
                        engine.configure(duration: viewModel.currentSlideDuration)
                    }
            )
    }

    // MARK: - Track Row

    private func trackRow(track: Binding<TimelineTrack>) -> some View {
        let t = track.wrappedValue
        let isSel = viewModel.selectedElementId == t.id

        return HStack(spacing: 0) {
            TrackLabel(track: t, isSelected: isSel)
                .frame(width: labelWidth)
                .onTapGesture {
                    viewModel.selectedElementId = t.id
                }

            ScrollView(.horizontal, showsIndicators: false) {
                TimelineTrackBar(
                    track: track,
                    totalDuration: slideDuration,
                    pixelsPerSecond: pixelsPerSecond,
                    isSelected: isSel,
                    onSelect: { viewModel.selectedElementId = t.id },
                    onChanged: { updated in
                        viewModel.autoExtendDuration(forElementEnd: updated.startTime + (updated.duration ?? 0))
                        syncTrackToModel(updated)
                    },
                    onDetailTap: { detailTrackId = t.id }
                )
                .frame(width: totalTimelineWidth)
            }
        }
        .frame(height: trackHeight)
        .popover(isPresented: Binding(
            get: { detailTrackId == t.id },
            set: { if !$0 { detailTrackId = nil } }
        )) {
            TrackDetailPopover(
                track: track,
                totalDuration: slideDuration,
                onChanged: { syncTrackToModel($0) },
                onDismiss: { detailTrackId = nil }
            )
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "timeline.selection")
                .font(.system(size: 22))
                .foregroundStyle(MeeshyColors.indigo400.opacity(0.5))
            Text("Ajoutez du contenu")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    // MARK: - Build Tracks

    private func buildTracks() {
        var result: [TimelineTrack] = []
        let effects = viewModel.currentEffects

        if let bgVid = effects.mediaObjects?.first(where: { $0.placement == "background" && $0.mediaType == "video" }) {
            result.append(TimelineTrack(
                id: bgVid.id, name: "Video BG", type: .bgVideo,
                startTime: bgVid.startTime ?? 0, duration: bgVid.duration,
                volume: bgVid.volume, loop: bgVid.loop ?? false,
                fadeIn: bgVid.fadeIn, fadeOut: bgVid.fadeOut,
                videoURL: viewModel.loadedVideoURLs[bgVid.id]
            ))
        }

        if effects.backgroundAudioId != nil {
            result.append(TimelineTrack(
                id: "bg-audio", name: "Audio BG", type: .bgAudio,
                startTime: Float(effects.backgroundAudioStart ?? 0),
                duration: effects.backgroundAudioEnd.map { Float($0) },
                volume: effects.backgroundAudioVolume ?? 1.0, loop: true,
                fadeIn: nil, fadeOut: nil
            ))
        }

        for bgAudio in effects.audioPlayerObjects?.filter({ $0.placement == "background" }) ?? [] {
            result.append(TimelineTrack(
                id: bgAudio.id, name: "Audio BG", type: .bgAudio,
                startTime: bgAudio.startTime ?? 0, duration: bgAudio.duration,
                volume: bgAudio.volume, loop: bgAudio.loop ?? true,
                fadeIn: bgAudio.fadeIn, fadeOut: bgAudio.fadeOut,
                waveformSamples: bgAudio.waveformSamples
            ))
        }

        for vid in effects.mediaObjects?.filter({ $0.placement == "foreground" && $0.mediaType == "video" }) ?? [] {
            result.append(TimelineTrack(
                id: vid.id, name: "Video", type: .fgVideo,
                startTime: vid.startTime ?? 0, duration: vid.duration,
                volume: vid.volume, loop: vid.loop ?? false,
                fadeIn: vid.fadeIn, fadeOut: vid.fadeOut,
                videoURL: viewModel.loadedVideoURLs[vid.id]
            ))
        }

        for aud in effects.audioPlayerObjects?.filter({ $0.placement == "foreground" }) ?? [] {
            result.append(TimelineTrack(
                id: aud.id, name: "Audio", type: .fgAudio,
                startTime: aud.startTime ?? 0, duration: aud.duration,
                volume: aud.volume, loop: aud.loop ?? false,
                fadeIn: aud.fadeIn, fadeOut: aud.fadeOut,
                waveformSamples: aud.waveformSamples
            ))
        }

        for text in effects.textObjects ?? [] {
            let label = String(text.content.prefix(10)) + (text.content.count > 10 ? "..." : "")
            result.append(TimelineTrack(
                id: text.id, name: label.isEmpty ? "Texte" : label, type: .text,
                startTime: text.startTime ?? 0, duration: text.displayDuration,
                volume: nil, loop: false,
                fadeIn: text.fadeIn, fadeOut: text.fadeOut
            ))
        }

        result.sort { $0.type.sortOrder < $1.type.sortOrder }
        tracks = result
    }

    // MARK: - Sync Track to Model

    private func syncTrackToModel(_ track: TimelineTrack) {
        var effects = viewModel.currentEffects

        if track.id == "bg-audio" {
            effects.backgroundAudioVolume = track.volume
            effects.backgroundAudioStart = TimeInterval(track.startTime)
            if let dur = track.duration { effects.backgroundAudioEnd = TimeInterval(dur) }
            viewModel.currentEffects = effects
            return
        }

        if let idx = effects.textObjects?.firstIndex(where: { $0.id == track.id }) {
            effects.textObjects?[idx].startTime = track.startTime
            effects.textObjects?[idx].displayDuration = track.duration
            effects.textObjects?[idx].fadeIn = track.fadeIn
            effects.textObjects?[idx].fadeOut = track.fadeOut
            viewModel.currentEffects = effects
            return
        }

        if let idx = effects.mediaObjects?.firstIndex(where: { $0.id == track.id }) {
            effects.mediaObjects?[idx].startTime = track.startTime
            effects.mediaObjects?[idx].duration = track.duration
            effects.mediaObjects?[idx].volume = track.volume ?? effects.mediaObjects![idx].volume
            effects.mediaObjects?[idx].loop = track.loop
            effects.mediaObjects?[idx].fadeIn = track.fadeIn
            effects.mediaObjects?[idx].fadeOut = track.fadeOut
            viewModel.currentEffects = effects
            return
        }

        if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == track.id }) {
            effects.audioPlayerObjects?[idx].startTime = track.startTime
            effects.audioPlayerObjects?[idx].duration = track.duration
            effects.audioPlayerObjects?[idx].volume = track.volume ?? effects.audioPlayerObjects![idx].volume
            effects.audioPlayerObjects?[idx].loop = track.loop
            effects.audioPlayerObjects?[idx].fadeIn = track.fadeIn
            effects.audioPlayerObjects?[idx].fadeOut = track.fadeOut
            viewModel.currentEffects = effects
            return
        }
    }

    // MARK: - Helpers

    private func formatTime(_ sec: Float) -> String {
        let m = Int(sec) / 60
        let s = Int(sec) % 60
        let ms = Int((sec - Float(Int(sec))) * 10)
        return String(format: "%d:%02d.%d", m, s, ms)
    }

    private func formatTimeShort(_ sec: Float) -> String {
        if sec < 60 { return String(format: "%.0fs", sec) }
        return String(format: "%d:%02d", Int(sec) / 60, Int(sec) % 60)
    }
}
```

**Step 2: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 3: Commit**

```
feat(timeline): rewrite TimelinePanel as NLE editor with transport, ruler, drag tracks
```

---

## Task 7: StoryCanvasView — Observe Playback Time for Element Visibility

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryCanvasView.swift`

When `viewModel.isTimelinePlaying` is true, elements should show/hide based on `viewModel.timelinePlaybackTime` vs their `startTime` and `duration`. This adds a visibility filter in the canvas layers.

**Step 1: Add visibility helper to StoryCanvasView**

Add a private method after the convenience accessors (after line ~66):

```swift
private func isElementVisible(startTime: Float?, duration: Float?) -> Bool {
    guard viewModel.isTimelinePlaying else { return true }
    let t = viewModel.timelinePlaybackTime
    let start = startTime ?? 0
    guard t >= start else { return false }
    if let dur = duration {
        return t <= start + dur
    }
    return true
}

private func elementOpacity(startTime: Float?, duration: Float?, fadeIn: Float?, fadeOut: Float?) -> Double {
    guard viewModel.isTimelinePlaying else { return 1.0 }
    let t = viewModel.timelinePlaybackTime
    let start = startTime ?? 0
    let dur = duration ?? (viewModel.currentSlideDuration - start)
    let end = start + dur

    guard t >= start, t <= end else { return 0.0 }

    // Fade in
    if let fi = fadeIn, fi > 0, t < start + fi {
        return Double((t - start) / fi)
    }
    // Fade out
    if let fo = fadeOut, fo > 0, t > end - fo {
        return Double((end - t) / fo)
    }
    return 1.0
}
```

**Step 2: Wrap text objects with visibility check**

In `textObjectsLayer`, wrap the `if !obj.content.isEmpty` block to also check visibility:

```swift
if !obj.content.isEmpty, isElementVisible(startTime: obj.startTime, duration: obj.displayDuration) {
    DraggableTextObjectView(...)
        .opacity(elementOpacity(startTime: obj.startTime, duration: obj.displayDuration, fadeIn: obj.fadeIn, fadeOut: obj.fadeOut))
        // ... rest of modifiers
}
```

**Step 3: Wrap foreground media and audio with visibility check**

In `foregroundMediaLayer`, wrap each `DraggableMediaView` with:

```swift
if isElementVisible(startTime: obj.startTime, duration: obj.duration) {
    DraggableMediaView(...)
        .opacity(elementOpacity(startTime: obj.startTime, duration: obj.duration, fadeIn: obj.fadeIn, fadeOut: obj.fadeOut))
        // ... rest of modifiers
}
```

Same for `foregroundAudioLayer` with `StoryAudioPlayerView`.

**Step 4: Build to verify**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

**Step 5: Commit**

```
feat(timeline): canvas elements show/hide based on playback time with fade support
```

---

## Task 8: Integration — Wire Everything in StoryComposerView

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift`

The TimelinePanel is already wired (line 470: `TimelinePanel(viewModel: viewModel)`). The main change is ensuring the `SimpleTrackRow` import is gone (if it was referenced) and that the build works end-to-end with all new components.

**Step 1: Verify the tool panel wiring**

The existing `activeToolPanel` case `.timeline: TimelinePanel(viewModel: viewModel)` at line 470 already works. No changes needed here unless `SimpleTrackRow` was used elsewhere.

**Step 2: Remove any dead `TimelineMode` references**

If `timelineMode` was referenced in StoryComposerView, remove those references. Search for `timelineMode` in the file.

**Step 3: Full build and manual test**

Run: `./apps/ios/meeshy.sh build`
Expected: BUILD SUCCEEDED

Run: `./apps/ios/meeshy.sh run`
Manual test:
1. Open story composer
2. Add a text element, add a video/image
3. Expand PLUS group → tap Timeline
4. Verify tracks appear with correct types
5. Drag a track bar center → verify it moves
6. Drag left/right edges → verify resize
7. Long-press a track → verify popover appears
8. Tap play → verify playhead moves
9. Drag slide duration handle → verify ruler extends
10. During playback, verify canvas elements appear/disappear at their startTime

**Step 4: Commit**

```
feat(timeline): integrate NLE timeline editor into story composer
```

---

## Summary of Files

| File | Action | Task |
|------|--------|------|
| `MeeshySDK/Cache/VideoFrameExtractor.swift` | Create | 1 |
| `MeeshyUI/Story/StoryComposerViewModel.swift` | Modify | 2 |
| `MeeshyUI/Story/TimelineTrackView.swift` | Rewrite | 3 |
| `MeeshyUI/Story/TrackDetailPopover.swift` | Create | 4 |
| `MeeshyUI/Story/TimelinePlaybackEngine.swift` | Create | 5 |
| `MeeshyUI/Story/TimelinePanel.swift` | Rewrite | 6 |
| `MeeshyUI/Story/StoryCanvasView.swift` | Modify | 7 |
| `MeeshyUI/Story/StoryComposerView.swift` | Modify | 8 |
