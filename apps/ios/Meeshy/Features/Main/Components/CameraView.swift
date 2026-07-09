import SwiftUI
import Combine
import AVFoundation
import Photos
import MeeshyUI

enum CameraResult {
    case photo(UIImage)
    case video(URL)
}

struct CameraView: View {
    let onCapture: (CameraResult) -> Void
    @Environment(\.dismiss) private var dismiss
    @StateObject private var camera = CameraModel()
    @State private var isVideoMode = false
    @State private var flashMode: AVCaptureDevice.FlashMode = .off

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            CameraPreviewLayer(session: camera.session)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                Spacer()
                bottomControls
            }

            if camera.isTakingPhoto {
                Color.white.ignoresSafeArea()
                    .opacity(0.3)
                    .animation(.easeOut(duration: 0.15), value: camera.isTakingPhoto)
            }
        }
        .onAppear { camera.configure() }
        .onDisappear { camera.stop() }
        .onReceive(camera.$capturedPhotoId) { id in
            guard id != nil, let image = camera.capturedPhoto else { return }
            onCapture(.photo(image))
            dismiss()
        }
        .onReceive(camera.$capturedVideoId) { id in
            guard id != nil, let url = camera.capturedVideoURL else { return }
            onCapture(.video(url))
            dismiss()
        }
        .statusBarHidden()
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    // doctrine 82i — glyphe borné par le cadre tap fixe 44×44
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.black.opacity(0.3)))
            }
            .accessibilityLabel(String(localized: "camera.close", defaultValue: "Fermer", bundle: .main))

            Spacer()

            Button { cycleFlash() } label: {
                Image(systemName: flashIcon)
                    // doctrine 82i — glyphe borné par le cadre tap fixe 44×44
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(flashMode == .off ? .white.opacity(0.6) : .yellow)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.black.opacity(0.3)))
            }
            .accessibilityLabel(flashAccessibilityLabel)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var flashIcon: String {
        switch flashMode {
        case .on: return "bolt.fill"
        case .auto: return "bolt.badge.automatic.fill"
        default: return "bolt.slash.fill"
        }
    }

    private var flashAccessibilityLabel: String {
        switch flashMode {
        case .on: return String(localized: "camera.flash.on", defaultValue: "Flash active", bundle: .main)
        case .auto: return String(localized: "camera.flash.auto", defaultValue: "Flash automatique", bundle: .main)
        default: return String(localized: "camera.flash.off", defaultValue: "Flash desactive", bundle: .main)
        }
    }

    private func cycleFlash() {
        switch flashMode {
        case .off: flashMode = .on
        case .on: flashMode = .auto
        default: flashMode = .off
        }
        HapticFeedback.light()
    }

    // MARK: - Bottom Controls

    private var bottomControls: some View {
        VStack(spacing: 20) {
            if camera.isRecordingVideo {
                recordingIndicator
            }

            modeSwitcher

            HStack(spacing: 40) {
                Spacer()

                captureButton

                Button { camera.switchCamera() } label: {
                    Image(systemName: "camera.rotate.fill")
                        // doctrine 82i — glyphe borné par le cadre tap fixe 50×50
                        .font(.system(size: 22))
                        .foregroundColor(.white)
                        .frame(width: 50, height: 50)
                        .background(Circle().fill(.white.opacity(0.15)))
                }
                .accessibilityLabel(String(localized: "camera.switch", defaultValue: "Changer de camera", bundle: .main))

                Spacer()
            }
        }
        .padding(.bottom, 30)
    }

    private var modeSwitcher: some View {
        HStack(spacing: 24) {
            modeTab("Photo", selected: !isVideoMode) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { isVideoMode = false }
                HapticFeedback.light()
            }
            modeTab("Video", selected: isVideoMode) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { isVideoMode = true }
                HapticFeedback.light()
            }
        }
    }

    private func modeTab(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(MeeshyFont.relative(14, weight: selected ? .bold : .medium))
                .foregroundColor(selected ? .white : .white.opacity(0.5))
        }
    }

    @ViewBuilder
    private var captureButton: some View {
        if isVideoMode {
            videoRecordButton
        } else {
            photoButton
        }
    }

    private var photoButton: some View {
        Button {
            camera.takePhoto(flash: flashMode)
            HapticFeedback.medium()
        } label: {
            ZStack {
                Circle()
                    .stroke(.white, lineWidth: 4)
                    .frame(width: 72, height: 72)
                Circle()
                    .fill(.white)
                    .frame(width: 60, height: 60)
            }
        }
    }

    private var videoRecordButton: some View {
        Button {
            if camera.isRecordingVideo {
                camera.stopRecording()
            } else {
                camera.startRecording()
            }
            HapticFeedback.medium()
        } label: {
            ZStack {
                Circle()
                    .stroke(.white, lineWidth: 4)
                    .frame(width: 72, height: 72)
                if camera.isRecordingVideo {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(MeeshyColors.error)
                        .frame(width: 30, height: 30)
                } else {
                    Circle()
                        .fill(MeeshyColors.error)
                        .frame(width: 60, height: 60)
                }
            }
        }
    }

    private var recordingIndicator: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(MeeshyColors.error)
                .frame(width: 10, height: 10)
            Text(formatDuration(camera.recordingDuration))
                .font(MeeshyFont.relative(16, weight: .semibold, design: .monospaced))
                .foregroundColor(.white)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Capsule().fill(.black.opacity(0.5)))
    }

    private func formatDuration(_ t: TimeInterval) -> String {
        let m = Int(t) / 60
        let s = Int(t) % 60
        return String(format: "%d:%02d", m, s)
    }
}

// MARK: - Camera Model

@MainActor
final class CameraModel: NSObject, ObservableObject {
    nonisolated(unsafe) let session = AVCaptureSession()
    var capturedPhoto: UIImage?
    var capturedVideoURL: URL?
    @Published var capturedPhotoId: String?
    @Published var capturedVideoId: String?
    @Published var isTakingPhoto = false
    @Published var isRecordingVideo = false
    @Published var recordingDuration: TimeInterval = 0

    private var photoOutput = AVCapturePhotoOutput()
    private var videoOutput = AVCaptureMovieFileOutput()
    private var currentDevice: AVCaptureDevice?
    private var currentPosition: AVCaptureDevice.Position = .back
    private var recordingTimer: Timer?

    // Camera-switch-mid-recording (bug fix 2026-07-09): `AVCaptureMovieFileOutput`'s
    // active recording connection breaks when its video input is removed, even
    // transiently inside a single beginConfiguration()/commitConfiguration()
    // transaction — swapping cameras used to silently end the recording early
    // (didFinishRecordingTo fires, the view dismisses with a truncated clip).
    // Fix: on a mid-recording switch, cleanly close the current segment, swap
    // cameras once truly stopped, then open a NEW segment on the new camera —
    // the user sees one continuous recording (duration keeps counting, the
    // `isRecordingVideo` indicator never drops). All segments are stitched into
    // one file via `mergeSegments` when the user finally stops.
    private var recordedSegmentURLs: [URL] = []
    private var isSwitchingCameraDuringRecording = false
    private var pendingSwitchPosition: AVCaptureDevice.Position?
    private var pendingStopRequested = false

    func configure() {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized ||
              AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined else { return }

        AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
            guard granted else { return }
            AVCaptureDevice.requestAccess(for: .audio) { _ in
                Task { @MainActor in self?.setupSession() }
            }
        }
    }

    private func setupSession() {
        session.beginConfiguration()
        session.sessionPreset = .high

        addVideoInput(position: .back)

        if let audioDevice = AVCaptureDevice.default(for: .audio),
           let audioInput = try? AVCaptureDeviceInput(device: audioDevice),
           session.canAddInput(audioInput) {
            session.addInput(audioInput)
        }

        if session.canAddOutput(photoOutput) { session.addOutput(photoOutput) }
        if session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }

        session.commitConfiguration()

        Task.detached { [weak self] in
            self?.session.startRunning()
        }
    }

    private func addVideoInput(position: AVCaptureDevice.Position) {
        session.inputs.compactMap { $0 as? AVCaptureDeviceInput }.filter { $0.device.hasMediaType(.video) }
            .forEach { session.removeInput($0) }

        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else { return }

        session.addInput(input)
        currentDevice = device
        currentPosition = position
    }

    /// Switches the active camera. While recording, this cannot reconfigure the
    /// input in place without losing the capture (see the property doc-comment
    /// on `recordedSegmentURLs`) — it closes the current segment, swaps once
    /// stopped, and reopens a new segment on the new camera. A no-op while a
    /// previous switch is still settling (guards rapid double-taps).
    func switchCamera() {
        guard !isSwitchingCameraDuringRecording else { return }
        if isRecordingVideo {
            isSwitchingCameraDuringRecording = true
            pendingSwitchPosition = currentPosition == .back ? .front : .back
            videoOutput.stopRecording()
            return
        }
        performCameraSwitch(to: currentPosition == .back ? .front : .back)
    }

    private func performCameraSwitch(to position: AVCaptureDevice.Position) {
        session.beginConfiguration()
        addVideoInput(position: position)
        session.commitConfiguration()
        HapticFeedback.light()
    }

    func takePhoto(flash: AVCaptureDevice.FlashMode) {
        let settings = AVCapturePhotoSettings()
        if photoOutput.supportedFlashModes.contains(flash) {
            settings.flashMode = flash
        }
        isTakingPhoto = true
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    func startRecording() {
        recordedSegmentURLs = []
        isSwitchingCameraDuringRecording = false
        pendingSwitchPosition = nil
        pendingStopRequested = false
        recordingDuration = 0
        startSegment()
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.recordingDuration += 0.5
            }
        }
    }

    /// Starts (or restarts, after a mid-recording camera switch) recording to a
    /// fresh temp file. Does not touch `recordingDuration`/`recordingTimer` so a
    /// segment restart is invisible to the recording-duration UI.
    private func startSegment() {
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_\(UUID().uuidString).mov")
        videoOutput.startRecording(to: tempURL, recordingDelegate: self)
        isRecordingVideo = true
    }

    /// Ends the recording. If a camera switch is mid-flight, the stop is queued
    /// and honored the instant the new segment opens — otherwise the user's tap
    /// could race the switch and be silently dropped.
    func stopRecording() {
        guard !isSwitchingCameraDuringRecording else {
            pendingStopRequested = true
            return
        }
        videoOutput.stopRecording()
    }

    func stop() {
        if isRecordingVideo { stopRecording() }
        Task.detached { [weak self] in
            self?.session.stopRunning()
        }
    }

    /// Handles every `fileOutput(didFinishRecordingTo:...)` callback — both the
    /// intermediate segment closes from a mid-recording camera switch and the
    /// final stop. See `recordedSegmentURLs`'s doc-comment for the overall design.
    private func handleSegmentFinished(url: URL, error: Error?) async {
        guard error == nil else {
            // A genuine recording error (not a deliberate mid-switch stop, which
            // always completes with error == nil) — end cleanly, discard segments.
            isSwitchingCameraDuringRecording = false
            isRecordingVideo = false
            recordingTimer?.invalidate()
            recordingTimer = nil
            for segment in recordedSegmentURLs { try? FileManager.default.removeItem(at: segment) }
            recordedSegmentURLs = []
            return
        }
        recordedSegmentURLs.append(url)

        if isSwitchingCameraDuringRecording {
            isSwitchingCameraDuringRecording = false
            if let position = pendingSwitchPosition {
                performCameraSwitch(to: position)
                pendingSwitchPosition = nil
            }
            if pendingStopRequested {
                pendingStopRequested = false
                videoOutput.stopRecording()
            } else {
                startSegment()
            }
            return
        }

        // Final stop.
        isRecordingVideo = false
        recordingTimer?.invalidate()
        recordingTimer = nil

        let segments = recordedSegmentURLs
        recordedSegmentURLs = []

        guard let finalURL = segments.count > 1 ? await Self.mergeSegments(segments) : segments.first else {
            // Merge failed (or there was nothing to merge) — fail soft to the
            // last recorded segment rather than losing the whole capture.
            if let lastSegment = segments.last {
                capturedVideoURL = lastSegment
                capturedVideoId = UUID().uuidString
                Self.saveToPhotoLibrary { PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: lastSegment) }
            }
            return
        }
        capturedVideoURL = finalURL
        capturedVideoId = UUID().uuidString
        Self.saveToPhotoLibrary { PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: finalURL) }
        if segments.count > 1 {
            for segment in segments where segment != finalURL {
                try? FileManager.default.removeItem(at: segment)
            }
        }
    }

    /// Best-effort save of an in-app capture into the user's photo library.
    /// This is what makes a freshly-taken photo/video appear at the front of
    /// `RecentMediaStripModel`'s grid — its own `PHPhotoLibraryChangeObserver`
    /// picks up the addition and re-fetches, so the new item lands there via
    /// the SAME `creationDate`-sorted query as everything else. No index is
    /// ever touched by this code, sidestepping the whole class of bug where a
    /// manual `assets.insert(at: 0)` could race a concurrent PHFetchResult
    /// refresh. Silently skipped (never blocks the capture flow, never
    /// surfaces an error to the user) when the app lacks add permission.
    private static func saveToPhotoLibrary(_ request: @escaping () -> Void) {
        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch status {
        case .authorized, .limited:
            PHPhotoLibrary.shared().performChanges({ request() }, completionHandler: nil)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
                guard newStatus == .authorized || newStatus == .limited else { return }
                PHPhotoLibrary.shared().performChanges({ request() }, completionHandler: nil)
            }
        case .denied, .restricted:
            break
        @unknown default:
            break
        }
    }

    /// Concatenates ordered video segments (each a camera-switch boundary) into
    /// one continuous file via `AVMutableComposition` + export. `nonisolated`
    /// so the composition/export work (CPU-bound, can take a few seconds for
    /// longer recordings) never blocks the main actor.
    ///
    /// Covered by `CameraModelSegmentMergeTests` (the real empty-input fast
    /// path — no AVFoundation asset loading involved) and source-reflection
    /// guards for the rest (`CameraModelSwitchDuringRecordingTests`):
    /// synthesizing throwaway H.264 clips with `AVAssetWriter` purely to
    /// round-trip them back through `AVURLAsset`/`AVAssetExportSession` proved
    /// too fragile in CI (encoder/container edge cases unrelated to this
    /// method's own logic caused spurious failures), so the merge/export
    /// behavior itself is pinned structurally instead of via synthetic media.
    nonisolated static func mergeSegments(_ urls: [URL]) async -> URL? {
        guard !urls.isEmpty else { return nil }
        let composition = AVMutableComposition()
        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else { return nil }

        var cursor = CMTime.zero
        for url in urls {
            let asset = AVURLAsset(url: url)
            guard let duration = try? await asset.load(.duration), duration.isValid, duration > .zero else { continue }
            let range = CMTimeRange(start: .zero, duration: duration)
            if let assetVideoTrack = try? await asset.loadTracks(withMediaType: .video).first {
                try? videoTrack.insertTimeRange(range, of: assetVideoTrack, at: cursor)
            }
            if let assetAudioTrack = try? await asset.loadTracks(withMediaType: .audio).first {
                try? audioTrack.insertTimeRange(range, of: assetAudioTrack, at: cursor)
            }
            cursor = cursor + duration
        }
        guard cursor > .zero,
              let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality)
        else { return nil }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_merged_\(UUID().uuidString).mov")
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mov

        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            exportSession.exportAsynchronously { continuation.resume() }
        }
        return exportSession.status == .completed ? outputURL : nil
    }
}

// MARK: - Photo Delegate

extension CameraModel: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard let data = photo.fileDataRepresentation(), let image = UIImage(data: data) else {
            Task { @MainActor in self.isTakingPhoto = false }
            return
        }
        Task { @MainActor in
            self.isTakingPhoto = false
            self.capturedPhoto = image
            self.capturedPhotoId = UUID().uuidString
            Self.saveToPhotoLibrary { PHAssetChangeRequest.creationRequestForAsset(from: image) }
        }
    }
}

// MARK: - Video Delegate

extension CameraModel: AVCaptureFileOutputRecordingDelegate {
    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL,
                                from connections: [AVCaptureConnection], error: Error?) {
        Task { @MainActor in
            await self.handleSegmentFinished(url: outputFileURL, error: error)
        }
    }
}

// MARK: - Camera Preview

struct CameraPreviewLayer: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        let previewLayer = AVCaptureVideoPreviewLayer(session: session)
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        context.coordinator.previewLayer = previewLayer
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        DispatchQueue.main.async {
            context.coordinator.previewLayer?.frame = uiView.bounds
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    class Coordinator {
        var previewLayer: AVCaptureVideoPreviewLayer?
    }
}
