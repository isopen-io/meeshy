//
//  ScreenShareManager.swift
//  Meeshy
//
//  Screen sharing and broadcast upload extension support for WebRTC
//  Supports iOS 12+ ReplayKit screen broadcasting
//

import Foundation
import ReplayKit
// import WebRTC

// MARK: - Screen Share State

enum ScreenShareState: Equatable {
    case idle
    case starting
    case active
    case paused
    case stopping
    case failed(Error)

    var isActive: Bool {
        return self == .active
    }

    static func == (lhs: ScreenShareState, rhs: ScreenShareState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle),
             (.starting, .starting),
             (.active, .active),
             (.paused, .paused),
             (.stopping, .stopping):
            return true
        case (.failed, .failed):
            return true
        default:
            return false
        }
    }
}

// MARK: - Screen Share Configuration

struct ScreenShareConfiguration {
    let fps: Int
    let bitrate: Int // kbps
    let scale: CGFloat // 1.0 = full resolution, 0.5 = half resolution

    static var `default`: ScreenShareConfiguration {
        ScreenShareConfiguration(fps: 15, bitrate: 2000, scale: 0.75)
    }

    static var high: ScreenShareConfiguration {
        ScreenShareConfiguration(fps: 30, bitrate: 4000, scale: 1.0)
    }

    static var low: ScreenShareConfiguration {
        ScreenShareConfiguration(fps: 10, bitrate: 1000, scale: 0.5)
    }
}

// MARK: - Screen Share Delegate

@MainActor
protocol ScreenShareManagerDelegate: AnyObject {
    func screenShareManager(_ manager: ScreenShareManager, didChangeState state: ScreenShareState)
    func screenShareManager(_ manager: ScreenShareManager, didCaptureFrame buffer: CVPixelBuffer, timestamp: CMTime)
    func screenShareManager(_ manager: ScreenShareManager, didEncounterError error: Error)
}

// MARK: - Screen Share Manager

@MainActor
final class ScreenShareManager: NSObject, ObservableObject {

    // MARK: - Singleton

    static let shared = ScreenShareManager()

    // MARK: - Published Properties

    @Published private(set) var state: ScreenShareState = .idle
    @Published private(set) var isSharing: Bool = false
    @Published private(set) var configuration: ScreenShareConfiguration = .default

    // MARK: - Properties

    weak var delegate: ScreenShareManagerDelegate?

    private var screenRecorder: RPScreenRecorder?
    private var videoSource: RTCVideoSource?
    private var screenTrack: RTCVideoTrack?

    private let videoQueue = DispatchQueue(label: "com.meeshy.screenshare")

    // Frame buffer
    private var lastFrameTime: CMTime = .zero
    private let minFrameInterval: Double

    // MARK: - Initialization

    override private init() {
        self.minFrameInterval = 1.0 / Double(ScreenShareConfiguration.default.fps)
        super.init()

        screenRecorder = RPScreenRecorder.shared()
        setupNotifications()

        callLogger.info("ScreenShareManager initialized")
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Setup

    private func setupNotifications() {
        // Screen recorder availability
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenRecorderDidChangeAvailability),
            name: UIScreen.capturedDidChangeNotification,
            object: nil
        )

        callLogger.info("ScreenShareManager notifications configured")
    }

    func setup(with videoSource: RTCVideoSource, peerConnectionFactory: RTCPeerConnectionFactory) {
        self.videoSource = videoSource

        // Create screen share video track
        let trackId = "screen0"
        screenTrack = peerConnectionFactory.videoTrack(with: videoSource, trackId: trackId)

        callLogger.info("ScreenShareManager setup complete")
    }

    // MARK: - Screen Sharing Control

    func startScreenShare(configuration: ScreenShareConfiguration = .default) async throws {
        guard let recorder = screenRecorder else {
            throw ScreenShareError.recorderNotAvailable
        }

        guard recorder.isAvailable else {
            throw ScreenShareError.recorderNotAvailable
        }

        guard !isSharing else {
            callLogger.warn("Screen sharing already active")
            return
        }

        self.configuration = configuration
        updateState(.starting)

        do {
            // Request permission if needed
            if #available(iOS 15.0, *) {
                // iOS 15+ has better screen recording APIs
                callLogger.debug("Using iOS 15+ screen recording")
            }

            // Start capturing
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                recorder.startCapture { [weak self] sampleBuffer, bufferType, error in
                    guard let self = self else { return }

                    if let error = error {
                        Task { @MainActor in
                            callLogger.error("Screen capture error: \(error.localizedDescription)")
                            self.updateState(.failed(error))
                            self.delegate?.screenShareManager(self, didEncounterError: error)
                        }
                        return
                    }

                    // Handle captured frame
                    Task { @MainActor in
                        self.handleCapturedSampleBuffer(sampleBuffer, type: bufferType)
                    }

                } completionHandler: { [weak self] error in
                    if let error = error {
                        callLogger.error("Failed to start screen capture: \(error.localizedDescription)")
                        continuation.resume(throwing: error)
                    } else {
                        callLogger.info("Screen capture started successfully")
                        Task { @MainActor in
                            self?.isSharing = true
                            self?.updateState(.active)
                        }
                        continuation.resume()
                    }
                }
            }

        } catch {
            updateState(.failed(error))
            throw error
        }
    }

    func stopScreenShare() async {
        guard let recorder = screenRecorder else { return }

        updateState(.stopping)

        await withCheckedContinuation { continuation in
            recorder.stopCapture { [weak self] error in
                if let error = error {
                    callLogger.error("Error stopping screen capture: \(error.localizedDescription)")
                } else {
                    callLogger.info("Screen capture stopped")
                }

                Task { @MainActor in
                    self?.isSharing = false
                    self?.updateState(.idle)
                }

                continuation.resume()
            }
        }
    }

    func pauseScreenShare() {
        guard isSharing else { return }

        // Pause by stopping frame processing
        updateState(.paused)
        callLogger.info("Screen sharing paused")
    }

    func resumeScreenShare() {
        guard state == .paused else { return }

        updateState(.active)
        callLogger.info("Screen sharing resumed")
    }

    // MARK: - Frame Processing

    private func handleCapturedSampleBuffer(_ sampleBuffer: CMSampleBuffer, type: RPSampleBufferType) {
        guard state.isActive else { return }

        switch type {
        case .video:
            handleVideoSampleBuffer(sampleBuffer)

        case .audioApp:
            // Handle app audio if needed
            break

        case .audioMic:
            // Handle microphone audio if needed
            break

        @unknown default:
            callLogger.warn("Unknown sample buffer type")
        }
    }

    private func handleVideoSampleBuffer(_ sampleBuffer: CMSampleBuffer) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            return
        }

        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)

        // Throttle frame rate
        let timeSinceLastFrame = timestamp.seconds - lastFrameTime.seconds
        if timeSinceLastFrame < minFrameInterval {
            return
        }

        lastFrameTime = timestamp

        // Scale if needed
        let scaledBuffer: CVPixelBuffer
        if configuration.scale < 1.0 {
            scaledBuffer = scalePixelBuffer(pixelBuffer, scale: configuration.scale) ?? pixelBuffer
        } else {
            scaledBuffer = pixelBuffer
        }

        // Create RTCVideoFrame
        let rtcBuffer = RTCCVPixelBuffer(pixelBuffer: scaledBuffer)
        let rotation: RTCVideoRotation = .rotation0

        let timeStampNs = Int64(timestamp.seconds * 1_000_000_000)
        let width = Int32(CVPixelBufferGetWidth(scaledBuffer))
        let height = Int32(CVPixelBufferGetHeight(scaledBuffer))

        // TODO: RTCVideoFrame initialization when WebRTC is fully implemented
        // let rtcFrame = RTCVideoFrame(buffer: rtcBuffer, rotation: rotation, timeStampNs: timeStampNs)

        // Send to video source
        videoQueue.async { [weak self] in
            guard let self = self, let videoSource = self.videoSource else { return }

            // TODO: Uncomment when WebRTC VideoSource API is available
            // videoSource.adaptOutputFormat(toWidth: width, height: height, fps: Int32(self.configuration.fps))

            Task { @MainActor in
                self.delegate?.screenShareManager(self, didCaptureFrame: scaledBuffer, timestamp: timestamp)
            }
        }
    }

    private func scalePixelBuffer(_ pixelBuffer: CVPixelBuffer, scale: CGFloat) -> CVPixelBuffer? {
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)

        let scaledWidth = Int(CGFloat(width) * scale)
        let scaledHeight = Int(CGFloat(height) * scale)

        var scaledPixelBuffer: CVPixelBuffer?

        let status = CVPixelBufferCreate(
            kCFAllocatorDefault,
            scaledWidth,
            scaledHeight,
            CVPixelBufferGetPixelFormatType(pixelBuffer),
            nil,
            &scaledPixelBuffer
        )

        guard status == kCVReturnSuccess, let outputBuffer = scaledPixelBuffer else {
            return nil
        }

        // Use Core Image to scale
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let scaleTransform = CGAffineTransform(scaleX: scale, y: scale)
        let scaledImage = ciImage.transformed(by: scaleTransform)

        let context = CIContext()
        context.render(scaledImage, to: outputBuffer)

        return outputBuffer
    }

    // MARK: - State Management

    private func updateState(_ newState: ScreenShareState) {
        state = newState
        delegate?.screenShareManager(self, didChangeState: newState)

        callLogger.info("Screen share state: \(String(describing: newState))")
    }

    // MARK: - Notifications

    @objc private func screenRecorderDidChangeAvailability(_ notification: Notification) {
        Task { @MainActor in
            guard let recorder = screenRecorder else { return }

            callLogger.info("Screen recorder availability changed: \(recorder.isAvailable)")

            if !recorder.isAvailable && isSharing {
                // Stop sharing if recorder becomes unavailable
                await stopScreenShare()
            }
        }
    }

    // MARK: - Screen Share Info

    func isScreenRecorderAvailable() -> Bool {
        return screenRecorder?.isAvailable ?? false
    }

    func getScreenShareCapabilities() -> [String: Any] {
        guard let recorder = screenRecorder else {
            return [:]
        }

        return [
            "available": recorder.isAvailable,
            "recording": recorder.isRecording,
            "microphoneEnabled": recorder.isMicrophoneEnabled,
            "cameraEnabled": recorder.isCameraEnabled
        ]
    }

    func logScreenShareInfo() {
        let capabilities = getScreenShareCapabilities()
        callLogger.debug("Screen Share Capabilities:")
        for (key, value) in capabilities {
            callLogger.debug("  \(key): \(value)")
        }
    }

    // MARK: - Cleanup

    func cleanup() {
        Task {
            if isSharing {
                await stopScreenShare()
            }
        }

        videoSource = nil
        screenTrack = nil

        callLogger.info("ScreenShareManager cleaned up")
    }
}

// MARK: - Screen Share Error

enum ScreenShareError: LocalizedError {
    case recorderNotAvailable
    case permissionDenied
    case captureFailed
    case notSupported

    var errorDescription: String? {
        switch self {
        case .recorderNotAvailable:
            return "Screen recorder is not available"
        case .permissionDenied:
            return "Screen recording permission denied"
        case .captureFailed:
            return "Failed to capture screen"
        case .notSupported:
            return "Screen sharing not supported on this device"
        }
    }
}

// MARK: - Broadcast Upload Extension Support

/**
 To enable screen sharing via Broadcast Upload Extension:

 1. Create a Broadcast Upload Extension target in Xcode
 2. Implement SampleHandler to capture screen and send to main app
 3. Use App Groups to share data between extension and main app
 4. Send captured frames via shared memory or sockets to WebRTC

 Example SampleHandler.swift:

 ```swift
 import ReplayKit
 import WebRTC

 class SampleHandler: RPBroadcastSampleHandler {

     override func broadcastStarted(withSetupInfo setupInfo: [String : NSObject]?) {
         // Setup WebRTC connection
     }

     override func broadcastPaused() {
         // Pause sending frames
     }

     override func broadcastResumed() {
         // Resume sending frames
     }

     override func broadcastFinished() {
         // Cleanup
     }

     override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with sampleBufferType: RPSampleBufferType) {
         switch sampleBufferType {
         case .video:
             // Send video frame to WebRTC
             break
         case .audioApp:
             // Send app audio
             break
         case .audioMic:
             // Send mic audio
             break
         @unknown default:
             break
         }
     }
 }
 ```
 */
