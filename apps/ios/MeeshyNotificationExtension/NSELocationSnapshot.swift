import MapKit
import UIKit

/// **L'instantané de carte d'une position partagée** (#8858).
///
/// Une position arrivait sur l'écran verrouillé avec un corps vide : rien ne
/// disait OÙ. L'extension rend ici une petite carte épinglée, écrite en PNG
/// sur disque pour devenir un `UNNotificationAttachment`.
///
/// Trois contraintes de l'extension, tenues ici :
/// - **le délai est borné** par l'appelant (`NotificationDetailPolicy
///   .snapshotTimeout`) : passé ce délai, l'instantané est annulé et la
///   bannière part avec son texte ;
/// - **l'échec est silencieux** : pas de tuile, pas de réseau, pas de carte —
///   la complétion reçoit `nil`, jamais une erreur ;
/// - **la mémoire reste petite** : 320 × 180 pt en @2x, soit ≈ 0,9 Mo de
///   pixels, loin du plafond de 8 Mio des pièces jointes (#7003).
nonisolated enum NSELocationSnapshot {

    static let size = CGSize(width: 320, height: 180)

    static func render(
        latitude: Double,
        longitude: Double,
        timeout: TimeInterval,
        completion: @escaping @Sendable (URL?) -> Void
    ) {
        let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        let options = MKMapSnapshotter.Options()
        options.region = MKCoordinateRegion(center: center, latitudinalMeters: 900, longitudinalMeters: 900)
        options.size = size
        options.scale = 2
        nonisolated(unsafe) let snapshotter = MKMapSnapshotter(options: options)
        let gate = CompletionGate(completion)

        DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: .now() + timeout) {
            guard gate.claim() else { return }
            snapshotter.cancel()
            gate.finish(nil)
        }

        snapshotter.start(with: .global(qos: .userInitiated)) { snapshot, _ in
            guard gate.claim() else { return }
            guard let snapshot else { return gate.finish(nil) }
            gate.finish(writePinned(snapshot: snapshot, center: center))
        }
    }

    private static func writePinned(snapshot: MKMapSnapshotter.Snapshot, center: CLLocationCoordinate2D) -> URL? {
        let base = snapshot.image
        let format = UIGraphicsImageRendererFormat()
        format.scale = base.scale
        let image = UIGraphicsImageRenderer(size: base.size, format: format).image { _ in
            base.draw(at: .zero)
            drawPin(at: snapshot.point(for: center))
        }
        guard let data = image.pngData() else { return nil }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("png")
        do {
            try data.write(to: url)
            return url
        } catch {
            return nil
        }
    }

    /// L'épingle : un disque blanc sous le symbole `mappin.circle.fill`
    /// rouge, la pointe posée sur la coordonnée.
    private static func drawPin(at point: CGPoint) {
        let side: CGFloat = 34
        let frame = CGRect(x: point.x - side / 2, y: point.y - side, width: side, height: side)
        UIColor.white.setFill()
        UIBezierPath(ovalIn: frame.insetBy(dx: 3, dy: 3)).fill()
        let configuration = UIImage.SymbolConfiguration(pointSize: side, weight: .semibold)
        UIImage(systemName: "mappin.circle.fill", withConfiguration: configuration)?
            .withTintColor(.systemRed, renderingMode: .alwaysOriginal)
            .draw(in: frame)
    }
}

/// La complétion ne part qu'UNE fois : le délai et l'instantané courent l'un
/// contre l'autre, et le perdant ne doit rien rendre.
private nonisolated final class CompletionGate: @unchecked Sendable {
    private let lock = NSLock()
    private var claimed = false
    private let completion: @Sendable (URL?) -> Void

    init(_ completion: @escaping @Sendable (URL?) -> Void) {
        self.completion = completion
    }

    func claim() -> Bool {
        lock.withLock {
            guard !claimed else { return false }
            claimed = true
            return true
        }
    }

    func finish(_ url: URL?) {
        completion(url)
    }
}
