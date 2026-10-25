import AVFoundation
import SwiftUI
import UIKit

/// La caméra qui lit un QR (`AVCaptureMetadataOutput` sur `.qr`) et rend son
/// texte, une fois par code nouveau. En pause, la session tourne toujours mais
/// aucun code n'est rendu : la confirmation ouverte ne se remplace pas.
struct QRCodeCameraView: UIViewControllerRepresentable {
    let isPaused: Bool
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> QRCodeCameraController {
        let controller = QRCodeCameraController()
        controller.onCode = onCode
        return controller
    }

    func updateUIViewController(_ controller: QRCodeCameraController, context: Context) {
        controller.onCode = onCode
        controller.isPaused = isPaused
    }
}

final class QRCodeCameraController: UIViewController {
    nonisolated deinit {}

    var onCode: ((String) -> Void)?
    var isPaused = false

    private let scanner = QRCodeCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    /// Le même code n'est rendu de nouveau qu'après ce délai : une caméra restée
    /// pointée ne rouvre pas l'avis qu'on vient de fermer.
    private var lastCode: (text: String, at: Date)?
    private static let repeatDelay: TimeInterval = 3

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        let layer = AVCaptureVideoPreviewLayer(session: scanner.session)
        layer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(layer)
        previewLayer = layer
        scanner.configure { [weak self] code in
            Task { @MainActor in self?.deliver(code) }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        scanner.start()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        scanner.stop()
    }

    private func deliver(_ code: String) {
        guard !isPaused else { return }
        if let lastCode, lastCode.text == code, Date().timeIntervalSince(lastCode.at) < Self.repeatDelay { return }
        lastCode = (code, Date())
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        onCode?(code)
    }
}

/// La session de capture, configurée, démarrée et arrêtée sur SA file.
/// unchecked: `session` et la sortie ne sont touchées que sur `queue` après la
/// construction ; le délégué est rappelé sur cette même file.
nonisolated final class QRCodeCaptureSession: NSObject, AVCaptureMetadataOutputObjectsDelegate, @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "me.meeshy.e2ee.pairing-scanner")
    private var onCode: (@Sendable (String) -> Void)?

    func configure(onCode: @escaping @Sendable (String) -> Void) {
        queue.async { [self] in
            self.onCode = onCode
            guard let camera = AVCaptureDevice.default(for: .video),
                  let input = try? AVCaptureDeviceInput(device: camera),
                  session.canAddInput(input) else { return }
            session.beginConfiguration()
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            if session.canAddOutput(output) {
                session.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: queue)
                output.metadataObjectTypes = output.availableMetadataObjectTypes.contains(.qr) ? [.qr] : []
            }
            session.commitConfiguration()
        }
    }

    func start() {
        queue.async { [session] in if !session.isRunning { session.startRunning() } }
    }

    func stop() {
        queue.async { [session] in if session.isRunning { session.stopRunning() } }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let code = metadataObjects.compactMap({ ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }).first else { return }
        onCode?(code)
    }
}
