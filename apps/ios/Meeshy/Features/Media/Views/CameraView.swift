//
//  CameraView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//  Updated by Claude on 2025-12-05.
//

import SwiftUI
import AVFoundation
import CoreImage

struct CameraView: View {
    @StateObject private var viewModel = CameraViewModel()
    /// Callback when photo is captured: (image, filter, audioEffect)
    let onCapture: (UIImage, VideoFilter, AudioEffectType) -> Void
    /// Callback when video is captured: (url, filter, audioEffect)
    var onVideoCapture: ((URL, VideoFilter, AudioEffectType) -> Void)?
    var onDismiss: (() -> Void)?  // Optional dismiss callback

    // MARK: - Focus State
    @State private var focusPoint: CGPoint? = nil
    @State private var showFocusIndicator = false

    // MARK: - Lifecycle tracking to prevent rotation crash
    @State private var isViewActive = false

    @Environment(\.dismiss) private var dismiss

    // Thumbnail for filter previews
    @State private var previewThumbnail: UIImage?

    var body: some View {
        ZStack {
            // Camera Preview with Real-Time Filters
            GeometryReader { geometry in
                FilteredCameraPreview(
                    session: viewModel.session,
                    selectedFilter: $viewModel.selectedFilter,
                    onPinchZoom: { scale in
                        viewModel.handlePinchZoom(scale: scale)
                    },
                    onTapToFocus: { point in
                        handleTapToFocus(point: point, in: geometry.size)
                    }
                )
                .ignoresSafeArea()

                // Focus Indicator Overlay
                if showFocusIndicator, let point = focusPoint {
                    FocusIndicatorView()
                        .position(point)
                }
            }

            // Controls Overlay
            VStack(spacing: 0) {
                // Top Controls
                HStack {
                    // Close button
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }

                    Spacer()

                    // Flash button
                    Button {
                        viewModel.toggleFlash()
                    } label: {
                        Image(systemName: flashIcon)
                            .font(.system(size: 20))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }

                    // Zoom Level Indicator
                    if viewModel.currentZoomFactor > 1.0 {
                        Text(String(format: "%.1fx", viewModel.currentZoomFactor))
                            .font(.system(.caption, design: .monospaced))
                            .foregroundColor(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Capsule().fill(Color.black.opacity(0.5)))
                    }

                    Button {
                        viewModel.flipCamera()
                    } label: {
                        Image(systemName: "camera.rotate")
                            .font(.system(size: 20))
                            .foregroundColor(.white)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)

                Spacer()

                // Effects Overlay (retractable panels)
                CameraEffectsOverlay(
                    selectedFilter: $viewModel.selectedFilter,
                    selectedAudioEffect: $viewModel.selectedAudioEffect,
                    showFilterPanel: $viewModel.showFilterPanel,
                    showAudioEffectPanel: $viewModel.showAudioEffectPanel,
                    captureMode: viewModel.captureMode,
                    thumbnail: previewThumbnail
                )

                // Bottom Controls
                VStack(spacing: 16) {
                    // Capture Mode Selector
                    if !viewModel.isRecording {
                        HStack(spacing: 40) {
                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    viewModel.captureMode = .photo
                                }
                            } label: {
                                Text("Photo")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(viewModel.captureMode == .photo ? .yellow : .white.opacity(0.7))
                            }

                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    viewModel.captureMode = .video
                                }
                            } label: {
                                Text("Video")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(viewModel.captureMode == .video ? .yellow : .white.opacity(0.7))
                            }
                        }
                    }

                    // Capture Button
                    captureButton
                }
                .padding(.bottom, 30)
            }

            // NOTE: Preview screens removed - images and videos go directly to editors
            // The editors (ImageEditorView, VideoEditorView) handle the "Retake" functionality

            // Permission Alert
            if viewModel.showPermissionAlert {
                Color.black.opacity(0.8)
                    .ignoresSafeArea()
                    .overlay(
                        PermissionAlertView(
                            permissionType: "Camera",
                            onOpenSettings: {
                                PermissionManager.shared.openSettings()
                            }
                        )
                    )
            }

            // Recording Indicator
            if viewModel.isRecording {
                VStack {
                    HStack {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 12, height: 12)

                        Text(viewModel.recordingDuration)
                            .font(.system(.body, design: .monospaced))
                            .foregroundColor(.white)
                    }
                    .padding(12)
                    .background(
                        Capsule()
                            .fill(Color.black.opacity(0.6))
                    )
                    .padding()

                    Spacer()
                }
            }

            // Capture Error Alert
            if viewModel.showCaptureError {
                VStack {
                    Spacer()

                    VStack(spacing: 16) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 40))
                            .foregroundColor(.orange)

                        Text(viewModel.captureError ?? "Erreur de capture")
                            .font(.headline)
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)

                        Button {
                            viewModel.restartSessionIfNeeded()
                        } label: {
                            Text("Réessayer")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 12)
                                .background(
                                    Capsule()
                                        .fill(Color.blue)
                                )
                        }
                    }
                    .padding(24)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(Color.black.opacity(0.85))
                    )
                    .padding(.horizontal, 40)

                    Spacer()
                }
                .transition(.opacity)
                .animation(.easeInOut, value: viewModel.showCaptureError)
            }
        }
        .onAppear {
            isViewActive = true
            viewModel.startSession()
        }
        .onDisappear {
            // Only stop session if view is truly being dismissed
            // During rotation, onDisappear may be called but isViewActive will be reset
            // We delay the check to allow rotation to complete
            let wasActive = isViewActive
            isViewActive = false

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                // If view didn't become active again (rotation), stop the session
                if !self.isViewActive && wasActive {
                    viewModel.stopSession()
                }
            }
        }
        .statusBar(hidden: true)
        .persistentSystemOverlays(.hidden)
        // Lock interface orientation during video recording to prevent crashes
        .onChange(of: viewModel.isRecording) { _, isRecording in
            if isRecording {
                // Lock to current orientation during recording
                AppDelegate.orientationLock = currentOrientationMask()
            } else {
                // Unlock after recording
                AppDelegate.orientationLock = .all
            }
        }
        // Direct handoff to editors - no preview in CameraView
        .onChange(of: viewModel.capturedImage) { _, newImage in
            if let image = newImage {
                // Immediately send to editor and dismiss
                viewModel.capturedImage = nil
                onCapture(image, viewModel.selectedFilter, viewModel.selectedAudioEffect)
                dismiss()
            }
        }
        .onChange(of: viewModel.capturedVideoURL) { _, newURL in
            if let url = newURL {
                // Immediately send to editor and dismiss
                viewModel.capturedVideoURL = nil
                onVideoCapture?(url, viewModel.selectedFilter, viewModel.selectedAudioEffect)
                dismiss()
            }
        }
    }

    /// Get current orientation mask based on device orientation
    private func currentOrientationMask() -> UIInterfaceOrientationMask {
        switch UIDevice.current.orientation {
        case .portrait: return .portrait
        case .portraitUpsideDown: return .portraitUpsideDown
        case .landscapeLeft: return .landscapeRight // Note: UIInterfaceOrientation is opposite
        case .landscapeRight: return .landscapeLeft
        default: return .portrait
        }
    }

    // MARK: - Handle Tap to Focus

    private func handleTapToFocus(point: CGPoint, in size: CGSize) {
        focusPoint = point
        showFocusIndicator = true

        // Convert tap point to camera coordinate system (0-1 range)
        let normalizedPoint = CGPoint(
            x: point.y / size.height,
            y: 1.0 - (point.x / size.width)
        )

        viewModel.focus(at: normalizedPoint)

        // Hide focus indicator after animation
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            withAnimation {
                showFocusIndicator = false
            }
        }
    }

    // MARK: - Flash Icon

    private var flashIcon: String {
        switch viewModel.flashMode {
        case .auto: return "bolt.badge.automatic"
        case .on: return "bolt.fill"
        case .off: return "bolt.slash.fill"
        @unknown default: return "bolt.badge.automatic"
        }
    }

    // MARK: - Capture Button

    private var captureButton: some View {
        Button {
            if viewModel.captureMode == .photo {
                viewModel.capturePhoto()
            } else {
                if viewModel.isRecording {
                    viewModel.stopRecording()
                } else {
                    viewModel.startRecording()
                }
            }
        } label: {
            ZStack {
                Circle()
                    .strokeBorder(Color.white, lineWidth: 4)
                    .frame(width: 80, height: 80)

                if viewModel.captureMode == .photo {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 68, height: 68)
                } else {
                    if viewModel.isRecording {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.red)
                            .frame(width: 40, height: 40)
                    } else {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 68, height: 68)
                    }
                }
            }
        }
    }

    // NOTE: Preview functions removed - editors now handle preview and retake
}

// MARK: - Focus Indicator View

struct FocusIndicatorView: View {
    @State private var scale: CGFloat = 1.5
    @State private var opacity: Double = 1.0

    var body: some View {
        Circle()
            .stroke(Color.yellow, lineWidth: 2)
            .frame(width: 80, height: 80)
            .scaleEffect(scale)
            .opacity(opacity)
            .onAppear {
                withAnimation(.easeOut(duration: 0.3)) {
                    scale = 1.0
                }
                withAnimation(.easeOut(duration: 1.0).delay(0.5)) {
                    opacity = 0.0
                }
            }
    }
}

// MARK: - Camera ViewModel

enum CaptureMode {
    case photo
    case video
}

@MainActor
final class CameraViewModel: NSObject, ObservableObject {
    @Published var session = AVCaptureSession()
    @Published var capturedImage: UIImage?
    @Published var capturedVideoURL: URL?
    @Published var captureMode: CaptureMode = .photo
    @Published var flashMode: AVCaptureDevice.FlashMode = .auto
    @Published var isRecording = false
    @Published var recordingDuration = "00:00"
    @Published var showPermissionAlert = false
    @Published var currentZoomFactor: CGFloat = 1.0

    // Live effects selection
    @Published var selectedFilter: VideoFilter = .original
    @Published var selectedAudioEffect: AudioEffectType = .normal

    // Effects panel state
    @Published var showFilterPanel = false
    @Published var showAudioEffectPanel = false

    // Error handling
    @Published var showCaptureError = false
    @Published var captureError: String?

    private var currentCamera: AVCaptureDevice?
    private var photoOutput = AVCapturePhotoOutput()
    private var movieOutput = AVCaptureMovieFileOutput()
    private var audioInput: AVCaptureDeviceInput?
    private var recordingTimer: Timer?
    private var recordingStartTime: Date?
    private var minZoomFactor: CGFloat = 1.0
    private var maxZoomFactor: CGFloat = 10.0

    // Video capture callback - set by view
    var videoCaptureCompletion: ((URL) -> Void)?

    override init() {
        super.init()
    }

    // MARK: - Session Management

    func startSession() {
        Task {
            guard await checkCameraPermission() else {
                showPermissionAlert = true
                return
            }

            await setupCamera()

            if !session.isRunning {
                DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                    self?.session.startRunning()
                }
            }
        }
    }

    func stopSession() {
        // Stop recording if active
        if isRecording {
            stopRecording()
        }

        // Invalidate timer
        recordingTimer?.invalidate()
        recordingTimer = nil

        if session.isRunning {
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                self?.session.stopRunning()
            }
        }

        // Reset zoom
        currentZoomFactor = 1.0
    }

    /// Restart the camera session if it's in a failed state
    func restartSessionIfNeeded() {
        mediaLogger.info("[Camera] Attempting to restart camera session")

        // Stop and restart the session
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            // Stop current session
            if self.session.isRunning {
                self.session.stopRunning()
            }

            // Small delay to allow cleanup
            Thread.sleep(forTimeInterval: 0.3)

            // Restart session
            Task { @MainActor in
                await self.setupCamera()
                if !self.session.isRunning {
                    DispatchQueue.global(qos: .userInitiated).async {
                        self.session.startRunning()
                    }
                }
                self.showCaptureError = false
                self.captureError = nil
                mediaLogger.info("[Camera] Camera session restarted")
            }
        }
    }

    // MARK: - Camera Setup

    private func setupCamera(position: AVCaptureDevice.Position = .back) async {
        session.beginConfiguration()

        // Remove existing inputs only (preserve external video data outputs like FilteredCameraPreview)
        session.inputs.forEach { session.removeInput($0) }

        // Remove only our own outputs (photoOutput and movieOutput), not all outputs
        // This preserves FilteredCameraPreview's video data output
        if session.outputs.contains(photoOutput) {
            session.removeOutput(photoOutput)
        }
        if session.outputs.contains(movieOutput) {
            session.removeOutput(movieOutput)
        }

        // Get best available camera device
        guard let camera = selectBestCamera(for: position),
              let input = try? AVCaptureDeviceInput(device: camera) else {
            session.commitConfiguration()
            return
        }

        if session.canAddInput(input) {
            session.addInput(input)
            currentCamera = camera

            // Update zoom limits based on camera capabilities
            minZoomFactor = camera.minAvailableVideoZoomFactor
            maxZoomFactor = min(camera.maxAvailableVideoZoomFactor, 10.0)
            currentZoomFactor = camera.videoZoomFactor
        }

        // Add photo output
        if session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
            photoOutput.maxPhotoQualityPrioritization = .quality

            // iOS 17+ Responsive Capture optimization
            if #available(iOS 17.0, *) {
                photoOutput.isResponsiveCaptureEnabled = photoOutput.isResponsiveCaptureSupported
                photoOutput.isFastCapturePrioritizationEnabled = photoOutput.isFastCapturePrioritizationSupported
            }
        }

        // Add movie output
        if session.canAddOutput(movieOutput) {
            session.addOutput(movieOutput)

            // Configure video stabilization
            configureVideoStabilization()
        }

        // Add audio input for video recording (requires microphone permission)
        setupAudioInput()

        session.commitConfiguration()

        // Notify FilteredCameraPreview to update mirroring for new camera position
        NotificationCenter.default.post(
            name: .cameraPositionDidChange,
            object: session,
            userInfo: ["position": position]
        )
    }

    // MARK: - Select Best Camera

    private func selectBestCamera(for position: AVCaptureDevice.Position) -> AVCaptureDevice? {
        // Priority: Triple camera > Dual camera > Wide angle
        let deviceTypes: [AVCaptureDevice.DeviceType] = [
            .builtInTripleCamera,
            .builtInDualWideCamera,
            .builtInDualCamera,
            .builtInWideAngleCamera
        ]

        let discoverySession = AVCaptureDevice.DiscoverySession(
            deviceTypes: deviceTypes,
            mediaType: .video,
            position: position
        )

        // Return first available camera (ordered by priority)
        for deviceType in deviceTypes {
            if let device = discoverySession.devices.first(where: { $0.deviceType == deviceType }) {
                return device
            }
        }

        // Fallback to default wide angle camera
        return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position)
    }

    // MARK: - Video Stabilization

    private func configureVideoStabilization() {
        guard let connection = movieOutput.connection(with: .video) else { return }

        // Use cinematic video stabilization if available (best quality)
        if connection.isVideoStabilizationSupported {
            // Check for cinematic stabilization (iOS 13+)
            if connection.activeVideoStabilizationMode != .cinematic {
                connection.preferredVideoStabilizationMode = .cinematic
            }

            // Fallback to auto if cinematic not supported
            if connection.activeVideoStabilizationMode == .off {
                connection.preferredVideoStabilizationMode = .auto
            }
        }
    }

    // MARK: - Zoom Control

    func handlePinchZoom(scale: CGFloat) {
        guard let camera = currentCamera else { return }

        let newZoomFactor = currentZoomFactor * scale
        let clampedZoom = max(minZoomFactor, min(newZoomFactor, maxZoomFactor))

        do {
            try camera.lockForConfiguration()
            camera.videoZoomFactor = clampedZoom
            camera.unlockForConfiguration()
            currentZoomFactor = clampedZoom
        } catch {
            print("Error setting zoom: \(error.localizedDescription)")
        }
    }

    func setZoom(_ factor: CGFloat) {
        guard let camera = currentCamera else { return }

        let clampedZoom = max(minZoomFactor, min(factor, maxZoomFactor))

        do {
            try camera.lockForConfiguration()
            camera.videoZoomFactor = clampedZoom
            camera.unlockForConfiguration()
            currentZoomFactor = clampedZoom
        } catch {
            print("Error setting zoom: \(error.localizedDescription)")
        }
    }

    // MARK: - Focus Control

    func focus(at point: CGPoint) {
        guard let camera = currentCamera else { return }

        do {
            try camera.lockForConfiguration()

            // Set focus point if supported
            if camera.isFocusPointOfInterestSupported {
                camera.focusPointOfInterest = point
            }

            // Set focus mode
            if camera.isFocusModeSupported(.autoFocus) {
                camera.focusMode = .autoFocus
            }

            // Set exposure point if supported
            if camera.isExposurePointOfInterestSupported {
                camera.exposurePointOfInterest = point
            }

            // Set exposure mode
            if camera.isExposureModeSupported(.autoExpose) {
                camera.exposureMode = .autoExpose
            }

            camera.unlockForConfiguration()
        } catch {
            print("Error setting focus: \(error.localizedDescription)")
        }
    }

    // MARK: - Capture Photo

    func capturePhoto() {
        let settings = AVCapturePhotoSettings()
        settings.flashMode = flashMode

        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    // MARK: - Record Video

    func startRecording() {
        Task {
            // Request microphone permission if not already granted
            if !PermissionManager.shared.microphoneStatus.isGranted {
                let micGranted = await checkMicrophonePermission()
                if micGranted {
                    // Permission just granted, add audio input
                    session.beginConfiguration()
                    setupAudioInput()
                    session.commitConfiguration()
                } else {
                    mediaLogger.warn("[Camera] Microphone permission denied, recording video without audio")
                }
            }

            // Proceed with recording (with or without audio)
            await MainActor.run {
                startVideoRecording()
            }
        }
    }

    /// Internal method to actually start video recording
    private func startVideoRecording() {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mov")

        // Ensure video stabilization is configured before recording
        configureVideoStabilization()

        // Set video orientation for recording based on current device orientation
        if let connection = movieOutput.connection(with: .video),
           connection.isVideoOrientationSupported {
            connection.videoOrientation = currentVideoOrientation()
        }

        movieOutput.startRecording(to: tempURL, recordingDelegate: self)
        isRecording = true
        recordingStartTime = Date()

        // Start timer
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.updateRecordingDuration()
            }
        }
    }

    /// Get current video orientation based on device orientation
    private func currentVideoOrientation() -> AVCaptureVideoOrientation {
        let orientation = UIDevice.current.orientation
        switch orientation {
        case .portrait: return .portrait
        case .landscapeRight: return .landscapeLeft
        case .landscapeLeft: return .landscapeRight
        case .portraitUpsideDown: return .portraitUpsideDown
        default: return .portrait
        }
    }

    func stopRecording() {
        movieOutput.stopRecording()
        isRecording = false
        recordingTimer?.invalidate()
        recordingTimer = nil
        recordingDuration = "00:00"
    }

    private func updateRecordingDuration() {
        guard let startTime = recordingStartTime else { return }
        let duration = Date().timeIntervalSince(startTime)
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        recordingDuration = String(format: "%02d:%02d", minutes, seconds)
    }

    // MARK: - Camera Controls

    func flipCamera() {
        guard let currentCamera = currentCamera else { return }
        let newPosition: AVCaptureDevice.Position = currentCamera.position == .back ? .front : .back

        Task {
            await setupCamera(position: newPosition)
        }
    }

    func toggleFlash() {
        switch flashMode {
        case .auto:
            flashMode = .on
        case .on:
            flashMode = .off
        case .off:
            flashMode = .auto
        @unknown default:
            flashMode = .auto
        }
    }

    // MARK: - Permission

    private func checkCameraPermission() async -> Bool {
        await PermissionManager.shared.requestCameraAccess()
    }

    private func checkMicrophonePermission() async -> Bool {
        await PermissionManager.shared.requestMicrophoneAccess()
    }

    // MARK: - Audio Setup

    /// Setup audio input for video recording
    private func setupAudioInput() {
        // Remove existing audio input if any
        if let existingAudioInput = audioInput {
            session.removeInput(existingAudioInput)
            audioInput = nil
        }

        // Check if microphone permission is granted
        guard PermissionManager.shared.microphoneStatus.isGranted else {
            mediaLogger.warn("[Camera] Microphone permission not granted, video will have no audio")
            return
        }

        // Get default audio device
        guard let audioDevice = AVCaptureDevice.default(for: .audio) else {
            mediaLogger.warn("[Camera] No audio device available")
            return
        }

        do {
            let audioInputDevice = try AVCaptureDeviceInput(device: audioDevice)
            if session.canAddInput(audioInputDevice) {
                session.addInput(audioInputDevice)
                audioInput = audioInputDevice
                mediaLogger.debug("[Camera] Audio input added successfully")
            }
        } catch {
            mediaLogger.error("[Camera] Failed to add audio input: \(error.localizedDescription)")
        }
    }
}

// MARK: - Photo Capture Delegate

extension CameraViewModel: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: Error?
    ) {
        // Handle capture error
        if let error = error {
            Task { @MainActor in
                mediaLogger.error("[Camera] Photo capture error: \(error.localizedDescription)")
                self.captureError = "Erreur de capture: \(error.localizedDescription)"
                self.showCaptureError = true
            }
            return
        }

        // Try to get image data
        guard let imageData = photo.fileDataRepresentation() else {
            Task { @MainActor in
                mediaLogger.error("[Camera] Failed to get photo data representation")
                self.captureError = "Impossible de traiter la photo. Veuillez réessayer."
                self.showCaptureError = true
                // Try to restart the session
                self.restartSessionIfNeeded()
            }
            return
        }

        guard let image = UIImage(data: imageData) else {
            Task { @MainActor in
                mediaLogger.error("[Camera] Failed to create UIImage from data")
                self.captureError = "Erreur lors de la création de l'image. Veuillez réessayer."
                self.showCaptureError = true
            }
            return
        }

        Task { @MainActor in
            mediaLogger.info("[Camera] Photo captured successfully: \(image.size.width)x\(image.size.height)")
            self.capturedImage = image
            self.showCaptureError = false
            self.captureError = nil
        }
    }
}

// MARK: - Video Recording Delegate

extension CameraViewModel: AVCaptureFileOutputRecordingDelegate {
    nonisolated func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        Task { @MainActor in
            if let error = error {
                print("Video recording error: \(error.localizedDescription)")
                // Clean up failed recording file
                try? FileManager.default.removeItem(at: outputFileURL)
                return
            }

            // Store the captured video URL for preview
            self.capturedVideoURL = outputFileURL
        }
    }
}
