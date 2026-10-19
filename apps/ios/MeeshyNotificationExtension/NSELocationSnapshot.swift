import MapKit
import UIKit
import os

/// **L'instantané de carte d'une position partagée** (#8858).
///
/// Une position arrivait sur l'écran verrouillé avec un corps vide : rien ne
/// disait OÙ. L'extension rend ici une petite carte épinglée, écrite en PNG
/// sur disque pour devenir un `UNNotificationAttachment`.
///
/// Trois contraintes de l'extension, tenues ici :
/// - **le délai est borné** par l'appelant (`NotificationDetailPolicy
///   .snapshotTimeout`) : passé ce délai, `NSEDeadline` annule l'instantané et
///   la bannière part avec son texte ;
/// - **l'échec est silencieux** : pas de tuile, pas de réseau, pas de carte —
///   l'appel rend `nil`, jamais une erreur ;
/// - **la mémoire reste petite** : 320 × 180 pt en @2x, soit ≈ 0,9 Mo de
///   pixels, loin du plafond de 8 Mio des pièces jointes (#7003).
enum NSELocationSnapshot {

    static let size = CGSize(width: 320, height: 180)

    static func render(
        latitude: Double,
        longitude: Double,
        timeout: TimeInterval
    ) async -> URL? {
        let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        let outcome = await NSEDeadline.race(timeout: timeout) { await capture(center: center) }
        return outcome ?? nil
    }

    private static func capture(center: CLLocationCoordinate2D) async -> URL? {
        let options = MKMapSnapshotter.Options()
        options.region = MKCoordinateRegion(center: center, latitudinalMeters: 900, longitudinalMeters: 900)
        options.size = size
        options.scale = 2
        let snapshotter = OSAllocatedUnfairLock<MKMapSnapshotter?>(uncheckedState: MKMapSnapshotter(options: options))
        return await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<URL?, Never>) in
                snapshotter.withLockUnchecked { $0 }?.start(with: .global(qos: .userInitiated)) { snapshot, _ in
                    continuation.resume(returning: snapshot.flatMap { writePinned(snapshot: $0, center: center) })
                }
            }
        } onCancel: {
            snapshotter.withLockUnchecked { $0 }?.cancel()
        }
    }

    private static func writePinned(snapshot: MKMapSnapshotter.Snapshot, center: CLLocationCoordinate2D) -> URL? {
        let base = snapshot.image
        let format = UIGraphicsImageRendererFormat()
        // L'échelle est FIXÉE : le simulateur rend l'instantané à l'échelle de
        // l'écran (@3x) malgré `options.scale`, et c'est la sortie qui compte.
        format.scale = 2
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
