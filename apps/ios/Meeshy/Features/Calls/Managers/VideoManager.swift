//
//  VideoManager.swift
//  Meeshy
//
//  Video capture, rendering, and camera management for WebRTC calls
//  Supports front/back camera, resolution switching, and video effects
//

import Foundation
import AVFoundation
// import WebRTC
import SwiftUI
import CoreMedia

// Helper for passing non-Sendable types safely when we know it's safe
struct UncheckedSendable<T>: @unchecked Sendable {
    let value: T
}

// MARK: - Video Configuration

struct VideoConfiguration {
    let width: Int
    let height: Int
    let fps: Int
    let codec: VideoCodec

    enum VideoCodec {
        case h264
        case vp8
        case vp9
    }

    static var high: VideoConfiguration {
        VideoConfiguration(width: 1280, height: 720, fps: 30, codec: .h264)
    }

    static var medium: VideoConfiguration {
        VideoConfiguration(width: 640, height: 480, fps: 30, codec: .h264)
    }

    static var low: VideoConfiguration {
        VideoConfiguration(width: 320, height: 240, fps: 15, codec: .h264)
    }
}

// MARK: - Camera Position

enum CameraPosition {
    case front
    case back

    var avPosition: AVCaptureDevice.Position {
        switch self {
        case .front: return .front
        case .back: return .back
        }
    }

    mutating func toggle() {
        self = self == .front ? .back : .front
    }
}

// MARK: - Video Manager Delegate

@MainActor
protocol VideoManagerDelegate: AnyObject {
    func videoManager(_ manager: VideoManager, didCaptureFrame frame: RTCVideoFrame)
    func videoManager(_ manager: VideoManager, didSwitchCamera position: CameraPosition)
    func videoManager(_ manager: VideoManager, didEncounterError error: Error)
}

// MARK: - Video Manager

@MainActor
final class VideoManager: NSObject, ObservableObject {

    // MARK: - Singleton

    static let shared = VideoManager()

    // MARK: - Published Properties

    @Published private(set) var isCapturing: Bool = false
    @Published private(set) var currentCameraPosition: CameraPosition = .front
    @Published private(set) var currentConfiguration: VideoConfiguration = .medium
    @Published var isVideoEnabled: Bool = true {
        didSet {
            if isVideoEnabled {
                startCapture()
            } else {
                stopCapture()
            }
        }
    }

    // MARK: - Properties

    weak var delegate: VideoManagerDelegate?

    private var videoCapturer: RTCCameraVideoCapturer?
    private var videoSource: RTCVideoSource?
    private var currentDevice: AVCaptureDevice?

    private let videoQueue = DispatchQueue(label: "com.meeshy.video")

    // MARK: - Initialization

    override private init() {
        super.init()
        callLogger.info("VideoManager initialized")
    }

    // MARK: - Setup

    func setup(with videoSource: RTCVideoSource, capturer: RTCCameraVideoCapturer) {
        self.videoSource = videoSource
        self.videoCapturer = capturer

        callLogger.info("VideoManager setup complete")
    }

    // MARK: - Camera Control

    func startCapture(position: CameraPosition = .front, configuration: VideoConfiguration = .medium) {
        guard let capturer = videoCapturer else {
            callLogger.error("Video capturer not initialized")
            return
        }

        currentCameraPosition = position
        currentConfiguration = configuration

        let safeCapturer = UncheckedSendable(value: capturer)

        videoQueue.async { [weak self] in
            guard let self = self else { return }

            let devices = RTCCameraVideoCapturer.captureDevices()

            guard let camera = devices.first(where: { $0.position == position.avPosition }) else {
                callLogger.error("Camera not found for position: \(position)")
                return
            }
            
            let safeCamera = UncheckedSendable(value: camera)

            Task { @MainActor in
                self.currentDevice = safeCamera.value
            }

            let formats = RTCCameraVideoCapturer.supportedFormats(for: camera)

            // Find best matching format
            let format = self.findBestFormat(
                formats: formats,
                targetWidth: configuration.width,
                targetHeight: configuration.height,
                targetFps: configuration.fps
            )

            guard let selectedFormat = format else {
                callLogger.error("No suitable video format found")
                return
            }

            let fps = self.findBestFrameRate(for: selectedFormat, target: configuration.fps)
            
            let safeFormat = UncheckedSendable(value: selectedFormat)

            safeCapturer.value.startCapture(
                with: camera,
                format: selectedFormat,
                fps: fps
            ) { error in
                if let error = error {
                    callLogger.error("Failed to start capture: \(error.localizedDescription)")
                    Task { @MainActor in
                        self.delegate?.videoManager(self, didEncounterError: error)
                    }
                } else {
                    callLogger.info("Started capturing video: \(configuration.width)x\(configuration.height) @ \(fps)fps")
                    Task { @MainActor in
                        self.isCapturing = true
                        // We don't need to assign selectedFormat to any MainActor property here, 
                        // but if we did, we would use safeFormat.value
                    }
                }
            }
        }
    }

    func stopCapture() {
        guard let capturer = videoCapturer else { return }
        let safeCapturer = UncheckedSendable(value: capturer)

        videoQueue.async { [weak self] in
            guard let self = self else { return }
            let safeSelf = UncheckedSendable(value: self)

            safeCapturer.value.stopCapture {
                callLogger.info("Stopped capturing video")
                Task { @MainActor in
                    safeSelf.value.isCapturing = false
                }
            }
        }
    }

    func switchCamera() {
        currentCameraPosition.toggle()
        startCapture(position: currentCameraPosition, configuration: currentConfiguration)

        callLogger.info("Switched to \(currentCameraPosition == .front ? "front" : "back") camera")
        delegate?.videoManager(self, didSwitchCamera: currentCameraPosition)
    }

    func setVideoConfiguration(_ configuration: VideoConfiguration) {
        currentConfiguration = configuration

        if isCapturing {
            startCapture(position: currentCameraPosition, configuration: configuration)
        }

        callLogger.info("Video configuration updated: \(configuration.width)x\(configuration.height) @ \(configuration.fps)fps")
    }

    // MARK: - Format Selection

    nonisolated private func findBestFormat(
        formats: [AVCaptureDevice.Format],
        targetWidth: Int,
        targetHeight: Int,
        targetFps: Int
    ) -> AVCaptureDevice.Format? {
        // First, try to find exact match
        var exactMatch = formats.first { format in
            let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            return Int(dimensions.width) == targetWidth && Int(dimensions.height) == targetHeight
        }

        if let match = exactMatch {
            return match
        }

        // Find closest match by resolution
        var closestFormat: AVCaptureDevice.Format?
        var smallestDifference = Int.max

        for format in formats {
            let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            let widthDiff = abs(Int(dimensions.width) - targetWidth)
            let heightDiff = abs(Int(dimensions.height) - targetHeight)
            let totalDiff = widthDiff + heightDiff

            if totalDiff < smallestDifference {
                smallestDifference = totalDiff
                closestFormat = format
            }
        }

        return closestFormat ?? formats.first
    }

    nonisolated private func findBestFrameRate(for format: AVCaptureDevice.Format, target: Int) -> Int {
        let frameRateRanges = format.videoSupportedFrameRateRanges

        guard let range = frameRateRanges.first else {
            return target
        }

        let maxFps = Int(range.maxFrameRate)
        let minFps = Int(range.minFrameRate)

        if target >= minFps && target <= maxFps {
            return target
        } else if target > maxFps {
            return maxFps
        } else {
            return minFps
        }
    }

    // MARK: - Camera Features

    func setZoom(factor: CGFloat) {
        guard let device = currentDevice else { return }

        videoQueue.async {
            do {
                try device.lockForConfiguration()

                let maxZoom = device.activeFormat.videoMaxZoomFactor
                let clampedZoom = max(1.0, min(factor, maxZoom))

                device.videoZoomFactor = clampedZoom

                device.unlockForConfiguration()

                callLogger.debug("Zoom set to: \(clampedZoom)x")

            } catch {
                callLogger.error("Failed to set zoom: \(error.localizedDescription)")
            }
        }
    }

    func setFocus(at point: CGPoint) {
        guard let device = currentDevice,
              device.isFocusPointOfInterestSupported,
              device.isFocusModeSupported(.autoFocus) else {
            return
        }

        videoQueue.async {
            do {
                try device.lockForConfiguration()

                device.focusPointOfInterest = point
                device.focusMode = .autoFocus

                if device.isExposurePointOfInterestSupported {
                    device.exposurePointOfInterest = point
                    device.exposureMode = .autoExpose
                }

                device.unlockForConfiguration()

                callLogger.debug("Focus set to point: \(point)")

            } catch {
                callLogger.error("Failed to set focus: \(error.localizedDescription)")
            }
        }
    }

    func setTorch(enabled: Bool) {
        guard let device = currentDevice,
              device.hasTorch,
              device.isTorchAvailable else {
            callLogger.warn("Torch not available")
            return
        }

        videoQueue.async {
            do {
                try device.lockForConfiguration()

                if enabled {
                    try device.setTorchModeOn(level: 1.0)
                } else {
                    device.torchMode = .off
                }

                device.unlockForConfiguration()

                callLogger.info("Torch \(enabled ? "enabled" : "disabled")")

            } catch {
                callLogger.error("Failed to set torch: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Camera Info

    func getAvailableCameras() -> [AVCaptureDevice] {
        return RTCCameraVideoCapturer.captureDevices()
    }

    func getCameraCapabilities(for position: CameraPosition) -> [String: Any]? {
        let devices = RTCCameraVideoCapturer.captureDevices()

        guard let camera = devices.first(where: { $0.position == position.avPosition }) else {
            return nil
        }

        let formats = RTCCameraVideoCapturer.supportedFormats(for: camera)

        var resolutions: Set<String> = []
        var maxFps: Double = 0

        for format in formats {
            let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            resolutions.insert("\(dimensions.width)x\(dimensions.height)")

            if let range = format.videoSupportedFrameRateRanges.first {
                maxFps = max(maxFps, range.maxFrameRate)
            }
        }

        return [
            "position": position == .front ? "front" : "back",
            "resolutions": Array(resolutions).sorted(),
            "maxFps": Int(maxFps),
            "hasTorch": camera.hasTorch,
            "hasFlash": camera.hasFlash,
            "maxZoom": camera.activeFormat.videoMaxZoomFactor
        ]
    }

    func logCameraCapabilities() {
        callLogger.debug("Camera Capabilities:")

        for position in [CameraPosition.front, CameraPosition.back] {
            if let capabilities = getCameraCapabilities(for: position) {
                callLogger.debug("  \(position == .front ? "Front" : "Back") Camera:")
                for (key, value) in capabilities {
                    callLogger.debug("    \(key): \(value)")
                }
            }
        }
    }

    // MARK: - Cleanup

    func cleanup() {
        stopCapture()
        videoCapturer = nil
        videoSource = nil
        currentDevice = nil

        callLogger.info("VideoManager cleaned up")
    }
}

// MARK: - Video Renderer View (SwiftUI)

struct VideoRendererView: UIViewRepresentable {
    let videoTrack: RTCVideoTrack?
    let contentMode: UIView.ContentMode

    init(videoTrack: RTCVideoTrack?, contentMode: UIView.ContentMode = .scaleAspectFill) {
        self.videoTrack = videoTrack
        self.contentMode = contentMode
    }

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView()
        view.contentMode = contentMode
        view.videoContentMode = contentMode == .scaleAspectFill ? .scaleAspectFill : .scaleAspectFit

        #if arch(arm64)
        view.delegate = context.coordinator
        #endif

        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        if let track = videoTrack {
            track.add(uiView)
        } else {
            // Remove from previous track if any
            context.coordinator.currentTrack?.remove(uiView)
            context.coordinator.currentTrack = nil
        }

        context.coordinator.currentTrack = videoTrack
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    class Coordinator: NSObject, RTCVideoViewDelegate {
        var currentTrack: RTCVideoTrack?

        func videoView(_ videoView: RTCVideoRenderer, didChangeVideoSize size: CGSize) {
            callLogger.debug("Video size changed: \(size)")
        }
    }
}

// MARK: - Video Frame Model

struct VideoFrame {
    let width: Int
    let height: Int
    let rotation: Int
    let timestamp: TimeInterval
}
