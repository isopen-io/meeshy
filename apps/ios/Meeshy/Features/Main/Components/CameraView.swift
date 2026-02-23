import SwiftUI
import AVFoundation
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
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.black.opacity(0.3)))
            }

            Spacer()

            Button { cycleFlash() } label: {
                Image(systemName: flashIcon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(flashMode == .off ? .white.opacity(0.6) : .yellow)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(.black.opacity(0.3)))
            }
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
                        .font(.system(size: 22))
                        .foregroundColor(.white)
                        .frame(width: 50, height: 50)
                        .background(Circle().fill(.white.opacity(0.15)))
                }

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
                .font(.system(size: 14, weight: selected ? .bold : .medium))
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
                        .fill(.red)
                        .frame(width: 30, height: 30)
                } else {
                    Circle()
                        .fill(.red)
                        .frame(width: 60, height: 60)
                }
            }
        }
    }

    private var recordingIndicator: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(.red)
                .frame(width: 10, height: 10)
            Text(formatDuration(camera.recordingDuration))
                .font(.system(size: 16, weight: .semibold, design: .monospaced))
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
    let session = AVCaptureSession()
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

    func switchCamera() {
        session.beginConfiguration()
        let newPosition: AVCaptureDevice.Position = currentPosition == .back ? .front : .back
        addVideoInput(position: newPosition)
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
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_\(UUID().uuidString).mov")
        videoOutput.startRecording(to: tempURL, recordingDelegate: self)
        isRecordingVideo = true
        recordingDuration = 0
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.recordingDuration += 0.5
            }
        }
    }

    func stopRecording() {
        videoOutput.stopRecording()
        recordingTimer?.invalidate()
        recordingTimer = nil
    }

    func stop() {
        if isRecordingVideo { stopRecording() }
        Task.detached { [weak self] in
            self?.session.stopRunning()
        }
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
        }
    }
}

// MARK: - Video Delegate

extension CameraModel: AVCaptureFileOutputRecordingDelegate {
    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL,
                                from connections: [AVCaptureConnection], error: Error?) {
        Task { @MainActor in
            self.isRecordingVideo = false
            if error == nil {
                self.capturedVideoURL = outputFileURL
                self.capturedVideoId = UUID().uuidString
            }
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
