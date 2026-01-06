//
//  FilteredCameraPreview.swift
//  Meeshy
//
//  Metal-accelerated camera preview with real-time CIFilter effects.
//  Uses AVCaptureVideoDataOutput for frame processing and MTKView for GPU rendering.
//
//  iOS 16+
//

import SwiftUI
import AVFoundation
import MetalKit
import CoreImage

// MARK: - Notification for Camera Position Change

extension Notification.Name {
    static let cameraPositionDidChange = Notification.Name("cameraPositionDidChange")
}

// MARK: - Filtered Camera Preview (SwiftUI Wrapper)

struct FilteredCameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    @Binding var selectedFilter: VideoFilter
    var onPinchZoom: ((CGFloat) -> Void)?
    var onTapToFocus: ((CGPoint) -> Void)?

    func makeUIView(context: Context) -> FilteredCameraMetalView {
        let view = FilteredCameraMetalView(session: session)
        view.coordinator = context.coordinator
        context.coordinator.metalView = view

        // Add pinch gesture for zoom
        let pinchGesture = UIPinchGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handlePinch(_:))
        )
        view.addGestureRecognizer(pinchGesture)

        // Add tap gesture for focus
        let tapGesture = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleTap(_:))
        )
        view.addGestureRecognizer(tapGesture)

        return view
    }

    func updateUIView(_ uiView: FilteredCameraMetalView, context: Context) {
        uiView.selectedFilter = selectedFilter
        context.coordinator.onPinchZoom = onPinchZoom
        context.coordinator.onTapToFocus = onTapToFocus
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onPinchZoom: onPinchZoom, onTapToFocus: onTapToFocus)
    }

    static func dismantleUIView(_ uiView: FilteredCameraMetalView, coordinator: Coordinator) {
        uiView.stopProcessing()
        coordinator.cleanup()
    }

    // MARK: - Coordinator

    class Coordinator: NSObject {
        weak var metalView: FilteredCameraMetalView?
        var onPinchZoom: ((CGFloat) -> Void)?
        var onTapToFocus: ((CGPoint) -> Void)?
        private var lastZoomScale: CGFloat = 1.0

        init(onPinchZoom: ((CGFloat) -> Void)?, onTapToFocus: ((CGPoint) -> Void)?) {
            self.onPinchZoom = onPinchZoom
            self.onTapToFocus = onTapToFocus
        }

        func cleanup() {
            metalView?.stopProcessing()
        }

        @objc func handlePinch(_ gesture: UIPinchGestureRecognizer) {
            switch gesture.state {
            case .began:
                lastZoomScale = 1.0
            case .changed:
                let scale = gesture.scale / lastZoomScale
                lastZoomScale = gesture.scale
                onPinchZoom?(scale)
            default:
                break
            }
        }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let view = gesture.view else { return }
            let location = gesture.location(in: view)
            onTapToFocus?(location)
        }
    }
}

// MARK: - Metal View for Filtered Camera

class FilteredCameraMetalView: MTKView {
    // MARK: - Properties

    weak var coordinator: FilteredCameraPreview.Coordinator?

    /// Thread-safe filter access - use this property to set/get filter from any thread
    var selectedFilter: VideoFilter {
        get {
            filterLock.lock()
            defer { filterLock.unlock() }
            return _selectedFilter
        }
        set {
            filterLock.lock()
            _selectedFilter = newValue
            filterLock.unlock()
        }
    }
    private var _selectedFilter: VideoFilter = .original
    private let filterLock = NSLock()

    private let session: AVCaptureSession
    private var videoDataOutput: AVCaptureVideoDataOutput?
    private let videoProcessingQueue = DispatchQueue(label: "com.meeshy.videoProcessing", qos: .userInteractive)

    // Metal & Core Image
    private var ciContext: CIContext?
    private var commandQueue: MTLCommandQueue?
    private var currentCIImage: CIImage?
    private let colorSpace = CGColorSpaceCreateDeviceRGB()

    // Orientation
    private var currentOrientation: AVCaptureVideoOrientation = .portrait

    // MARK: - Init

    init(session: AVCaptureSession) {
        self.session = session

        // Setup Metal device
        guard let metalDevice = MTLCreateSystemDefaultDevice() else {
            super.init(frame: .zero, device: nil)
            return
        }

        super.init(frame: .zero, device: metalDevice)

        // Configure MTKView
        self.framebufferOnly = false
        self.colorPixelFormat = .bgra8Unorm
        self.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
        self.enableSetNeedsDisplay = false
        self.isPaused = true // We manually trigger draws
        self.contentMode = .scaleAspectFill
        self.clipsToBounds = true

        // Setup Metal command queue
        commandQueue = metalDevice.makeCommandQueue()

        // Setup Core Image context with Metal
        ciContext = CIContext(mtlDevice: metalDevice, options: [
            .useSoftwareRenderer: false,
            .highQualityDownsample: true,
            .cacheIntermediates: false
        ])

        // Observe orientation changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(orientationDidChange),
            name: UIDevice.orientationDidChangeNotification,
            object: nil
        )

        // Observe when session starts running to setup video output
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(sessionDidStartRunning),
            name: .AVCaptureSessionDidStartRunning,
            object: session
        )

        // Observe camera position changes to update mirroring
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(cameraPositionDidChange(_:)),
            name: .cameraPositionDidChange,
            object: session
        )
    }

    required init(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        stopProcessing()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Setup

    private func setupVideoDataOutput() {
        // Prevent duplicate setup
        guard videoDataOutput == nil else { return }

        videoDataOutput = AVCaptureVideoDataOutput()

        guard let output = videoDataOutput else { return }

        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        output.alwaysDiscardsLateVideoFrames = true
        output.setSampleBufferDelegate(self, queue: videoProcessingQueue)

        // Add to session
        session.beginConfiguration()
        if session.canAddOutput(output) {
            session.addOutput(output)

            // Configure connection
            if let connection = output.connection(with: .video) {
                if connection.isVideoMirroringSupported {
                    // Only mirror front camera
                    let isFrontCamera = session.inputs.compactMap { $0 as? AVCaptureDeviceInput }
                        .first { $0.device.hasMediaType(.video) }?
                        .device.position == .front
                    connection.isVideoMirrored = isFrontCamera
                }
                updateVideoOrientation(connection: connection)
            }
        }
        session.commitConfiguration()
    }

    func stopProcessing() {
        if let output = videoDataOutput {
            session.beginConfiguration()
            session.removeOutput(output)
            session.commitConfiguration()
            videoDataOutput = nil
        }
    }

    // MARK: - Session Notifications

    @objc private func sessionDidStartRunning() {
        // Session is now running with inputs configured, safe to add our video output
        DispatchQueue.main.async { [weak self] in
            self?.setupVideoDataOutput()
        }
    }

    @objc private func cameraPositionDidChange(_ notification: Notification) {
        // Update mirroring when camera switches between front and back
        guard let position = notification.userInfo?["position"] as? AVCaptureDevice.Position,
              let connection = videoDataOutput?.connection(with: .video),
              connection.isVideoMirroringSupported else {
            return
        }

        // Mirror only for front camera
        let shouldMirror = (position == .front)

        // Update on main thread since we're modifying capture connection
        DispatchQueue.main.async {
            self.session.beginConfiguration()
            connection.isVideoMirrored = shouldMirror
            self.session.commitConfiguration()
        }
    }

    // MARK: - Orientation

    @objc private func orientationDidChange() {
        if let connection = videoDataOutput?.connection(with: .video) {
            updateVideoOrientation(connection: connection)
        }
    }

    private func updateVideoOrientation(connection: AVCaptureConnection) {
        guard connection.isVideoOrientationSupported else { return }

        let deviceOrientation = UIDevice.current.orientation
        let videoOrientation: AVCaptureVideoOrientation

        switch deviceOrientation {
        case .portrait:
            videoOrientation = .portrait
        case .landscapeRight:
            videoOrientation = .landscapeLeft
        case .landscapeLeft:
            videoOrientation = .landscapeRight
        case .portraitUpsideDown:
            videoOrientation = .portraitUpsideDown
        default:
            videoOrientation = .portrait
        }

        connection.videoOrientation = videoOrientation
        currentOrientation = videoOrientation
    }

    // MARK: - Filter Application

    private func applyFilter(to ciImage: CIImage) -> CIImage {
        // Read filter once (thread-safe access)
        let filter = selectedFilter

        guard filter != .original,
              let filterName = filter.ciFilterName,
              let ciFilter = CIFilter(name: filterName) else {
            return ciImage
        }

        ciFilter.setValue(ciImage.clampedToExtent(), forKey: kCIInputImageKey)

        // Special handling for vibrance filter
        if filter == .vivid {
            ciFilter.setValue(0.5, forKey: "inputAmount")
        }

        return ciFilter.outputImage?.cropped(to: ciImage.extent) ?? ciImage
    }

    // MARK: - Rendering

    private func render(_ ciImage: CIImage) {
        guard let drawable = currentDrawable,
              let commandBuffer = commandQueue?.makeCommandBuffer() else {
            return
        }

        let drawableSize = self.drawableSize
        guard drawableSize.width > 0 && drawableSize.height > 0 else { return }

        // Calculate scaling to fill the view (aspect fill)
        let imageExtent = ciImage.extent
        let scaleX = drawableSize.width / imageExtent.width
        let scaleY = drawableSize.height / imageExtent.height
        let scale = max(scaleX, scaleY)

        // Center the image
        let scaledWidth = imageExtent.width * scale
        let scaledHeight = imageExtent.height * scale
        let offsetX = (drawableSize.width - scaledWidth) / 2
        let offsetY = (drawableSize.height - scaledHeight) / 2

        let scaledImage = ciImage
            .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            .transformed(by: CGAffineTransform(translationX: offsetX, y: offsetY))

        let bounds = CGRect(origin: .zero, size: drawableSize)

        ciContext?.render(
            scaledImage,
            to: drawable.texture,
            commandBuffer: commandBuffer,
            bounds: bounds,
            colorSpace: colorSpace
        )

        commandBuffer.present(drawable)
        commandBuffer.commit()
    }

    override func draw(_ rect: CGRect) {
        guard let ciImage = currentCIImage else { return }
        render(ciImage)
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension FilteredCameraMetalView: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
            return
        }

        // Create CIImage from pixel buffer
        var ciImage = CIImage(cvPixelBuffer: pixelBuffer)

        // Apply the selected filter (selectedFilter is thread-safe)
        ciImage = applyFilter(to: ciImage)

        // Store for rendering
        currentCIImage = ciImage

        // Trigger draw on main thread (isPaused=true, enableSetNeedsDisplay=false means we draw manually)
        DispatchQueue.main.async { [weak self] in
            self?.draw()
        }
    }

    func captureOutput(
        _ output: AVCaptureOutput,
        didDrop sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        // Frame dropped - this is normal under heavy load
    }
}

// MARK: - Preview Provider

#if DEBUG
struct FilteredCameraPreview_Previews: PreviewProvider {
    static var previews: some View {
        FilteredCameraPreview(
            session: AVCaptureSession(),
            selectedFilter: .constant(.vivid)
        )
        .ignoresSafeArea()
    }
}
#endif
