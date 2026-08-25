import AVFoundation
import CoreGraphics
import CoreImage
import Foundation
import UIKit

/// Grave le filigrane Meeshy ANIMÉ — celui des exports de story — dans une
/// vidéo quelconque (pièce jointe, réel, média de post) au moment de
/// l'enregistrer en local.
///
/// Différence avec `StoryExporter` : là-bas le filigrane se peint dans des
/// frames que Meeshy rend lui-même ; ici la vidéo existe déjà et n'est pas une
/// story. On la ré-encode donc en composant, frame par frame, la seule TUILE
/// du filigrane par-dessus l'image source.
///
/// SDK — atome : paramètres opaques (une URL, un filigrane). La décision
/// « quand marquer » reste app-side (`MediaSaveBranding`).
public enum MeeshyVideoWatermarkBaker {

    /// Durée au-delà de laquelle on renonce à marquer.
    ///
    /// Un bake est un ré-encodage complet : son coût est linéaire en frames.
    /// Passé ce plafond, l'attente deviendrait le sujet à la place de
    /// l'enregistrement — on livre alors la vidéo NUE plutôt que de faire
    /// patienter des minutes pour un logo. Les pièces jointes Meeshy sont très
    /// en-deçà.
    public static let maximumDuration: TimeInterval = 600

    /// Cadence de rafraîchissement de l'animation du filigrane, indépendante
    /// de celle de la vidéo. La respiration du logo et le fondu de bascule
    /// restent fluides à 15 Hz, et une tuile rendue est réutilisée par toutes
    /// les frames du même intervalle — sur une vidéo à 60 fps, c'est 4× moins
    /// de rendus.
    ///
    /// `nonisolated` : lue par `animationTime` (nonisolated, cf. sa doc) et par
    /// `MeeshyMediaBrandingGeometryTests` hors MainActor.
    public static nonisolated let animationFPS: Double = 15

    /// Marge autour du bloc, pour que l'ombre portée (offset 2, flou 6) ne
    /// soit pas coupée par les bords de la tuile.
    static let shadowPadding: CGFloat = 14

    public enum BakeError: Error, Equatable {
        case noVideoTrack
        case tooLong(seconds: Double)
        /// `AVFoundation` n'a pas redressé la source : le gabarit de rendu ne
        /// correspond pas à la taille naturelle transformée. Marquer quand
        /// même produirait une vidéo COUCHÉE — on préfère ne pas marquer.
        case orientationUnhandled
        case exportSessionUnavailable
        case exportFailed(String)
    }

    // MARK: - Géométrie (pure, testable sans AVFoundation)

    /// Taille du rendu une fois la `preferredTransform` de la piste appliquée
    /// — c'est-à-dire les dimensions telles que le spectateur les voit.
    ///
    /// `nonisolated` : pure géométrie, appelée depuis `MeeshyMediaBrandingGeometryTests`
    /// hors MainActor — pas de raison de porter l'isolation par défaut du module.
    public static nonisolated func orientedSize(natural: CGSize, transform: CGAffineTransform) -> CGSize {
        let rect = CGRect(origin: .zero, size: natural).applying(transform)
        return CGSize(width: abs(rect.width), height: abs(rect.height))
    }

    /// Comparaison tolérante de deux gabarits — l'encodeur arrondit aux
    /// multiples de 2 px.
    public static nonisolated func sizesMatch(_ lhs: CGSize, _ rhs: CGSize, tolerance: CGFloat = 2) -> Bool {
        abs(lhs.width - rhs.width) <= tolerance && abs(lhs.height - rhs.height) <= tolerance
    }

    /// Instant d'animation servi pour le temps `seconds` : quantifié à
    /// `animationFPS`, ce qui rend le cache de tuiles efficace.
    ///
    /// `nonisolated` : appelé depuis `WatermarkTilePainter.paint`, qui tourne
    /// hors MainActor (cf. sa propre doc) — cette fonction est de toute façon
    /// une pure fonction de temps, sans état ni besoin d'isolation.
    public static nonisolated func animationTime(for seconds: Double) -> Double {
        guard seconds.isFinite, seconds > 0 else { return 0 }
        return (seconds * animationFPS).rounded() / animationFPS
    }

    // MARK: - Bake

    /// Ré-encode `source` avec le filigrane gravé et retourne l'URL du MP4
    /// produit, dont l'appelant devient propriétaire.
    ///
    /// Ne modifie JAMAIS `source` — c'est très souvent le fichier du cache
    /// disque, qui doit rester la copie fidèle de l'original.
    ///
    /// - Important: à appeler hors du MainActor. Le peintre de tuiles y
    ///   remonte en `DispatchQueue.main.sync` (le rendu du filigrane est
    ///   MainActor-isolé, comme dans `StoryAVCompositor`) : appeler `bake`
    ///   depuis un contexte qui BLOQUE le main thread interbloquerait.
    public static func bake(source: URL, watermark: StoryExportWatermark) async throws -> URL {
        let asset = AVURLAsset(url: source)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else {
            throw BakeError.noVideoTrack
        }
        let duration = try await asset.load(.duration).seconds
        guard duration.isFinite, duration <= maximumDuration else {
            throw BakeError.tooLong(seconds: duration)
        }

        let natural = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        let expected = orientedSize(natural: natural, transform: transform)

        let painter = WatermarkTilePainter(watermark: watermark)
        // `@Sendable` EXPLICITE sur le bloc, pas seulement sur `paint`. Sans
        // lui, l'isolation du bloc dépend de l'annotation d'AVFoundation : sur
        // un SDK où `applyingCIFiltersWithHandler:` n'est pas encore marqué
        // `@Sendable`, le littéral hérite du MainActor de `bake` (isolation par
        // défaut du module, SE-0466). AVFoundation l'appelle depuis SON thread —
        // et l'appel synchrone vers le peintre tente alors de faire transiter
        // `AVAsynchronousCIImageFilteringRequest` (non-Sendable) à travers un
        // hop : c'est exactement `sending 'request' risks causing data races`.
        // Le marquer ici cloue le bloc non-isolé, quelle que soit la version du
        // SDK. Le seul saut MainActor reste celui, volontaire, de `render(at:)`.
        let videoComposition = AVMutableVideoComposition(asset: asset) { @Sendable request in
            painter.paint(request)
        }

        // Garde d'orientation. `applyingCIFiltersWithHandler` redresse la
        // source et cale `renderSize` sur la taille transformée ; si ce n'était
        // pas le cas, la composition perdrait la rotation de la piste et
        // livrerait une vidéo couchée — un défaut SILENCIEUX, invisible tant
        // qu'on ne regarde pas le fichier produit. On préfère renoncer à la
        // marque : l'appelant enregistre alors la vidéo d'origine.
        guard sizesMatch(videoComposition.renderSize, expected) else {
            throw BakeError.orientationUnhandled
        }

        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-branded-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let outputURL = directory.appendingPathComponent(
            source.deletingPathExtension().lastPathComponent + ".mp4")

        guard let session = AVAssetExportSession(asset: asset,
                                                 presetName: AVAssetExportPresetHighestQuality)
        else { throw BakeError.exportSessionUnavailable }
        session.outputURL = outputURL
        session.outputFileType = .mp4
        session.videoComposition = videoComposition
        session.shouldOptimizeForNetworkUse = true

        // MÊME appel que les chemins d'export de story : `export()` sans
        // argument, qui lit `outputURL`/`outputFileType` posés ci-dessus. Le
        // `export(to:as:)` d'iOS 18 est proscrit — combiné à ces deux
        // propriétés il fait tomber le process en SIGSEGV (constaté 18.2).
        await session.export()
        guard session.status == .completed else {
            try? FileManager.default.removeItem(at: directory)
            throw BakeError.exportFailed(session.error?.localizedDescription ?? "unknown")
        }
        return outputURL
    }
}

// MARK: - Peintre de tuiles

/// Rend la TUILE du filigrane (le bloc logo + texte, plus la marge d'ombre) et
/// la compose sur la frame source.
///
/// Ne rend jamais une planche pleine taille : à 1080p ce serait 8 Mo alloués,
/// dessinés et copiés PAR FRAME, pour un bloc qui occupe moins de 4 % de la
/// surface. La tuile est mémoïsée par intervalle d'animation, si bien qu'une
/// vidéo à 30 fps ne déclenche que ~15 rendus par seconde.
private final class WatermarkTilePainter: @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    /// `@unchecked Sendable` : tout l'état mutable est gardé par `lock`, et le
    /// filigrane lui-même ne porte que des valeurs immuables.
    ///
    /// The module defaults to `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`
    /// (SE-0466). `paint(_:)` is invoked from the `@Sendable`, non-isolated
    /// handler closure AVFoundation hands to
    /// `AVMutableVideoComposition(asset:applyingCIFiltersWithHandler:)` — a
    /// synchronous call from there into an (implicitly) MainActor-isolated
    /// method would force a hop and try to send the non-Sendable
    /// `AVAsynchronousCIImageFilteringRequest` across it, which is exactly
    /// what `error: sending 'request' risks causing data races` flags. So
    /// `paint` and everything it calls before the deliberate `render(at:)`
    /// hop (mirrors `StoryAVCompositor`'s pattern for the same AVFoundation
    /// callback-thread constraint) must be explicitly `nonisolated`.
    private nonisolated let watermark: StoryExportWatermark
    private nonisolated let lock = NSLock()
    private nonisolated(unsafe) var cachedTime: Double = .nan
    private nonisolated(unsafe) var cachedSize: CGSize = .zero
    private nonisolated(unsafe) var cachedTile: CIImage?

    /// Boîte de transport : `MainActor.assumeIsolated` exige un retour
    /// `Sendable`, or `CIImage` ne l'est pas. La boîte naît et meurt dans le
    /// `sync`, sans jamais être partagée. `image` est lu hors de tout bloc
    /// `assumeIsolated`, depuis `renderOnMain` (nonisolated) : il doit donc
    /// lui-même être `nonisolated(unsafe)`, pas hériter du défaut MainActor.
    private final class TileBox {
        nonisolated(unsafe) var image: CIImage?
        nonisolated init() {}
        // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
        // défaut) → double-free (abrt) — la boîte « naît et meurt dans le sync »
        // hors main. Jumelle de la `nonisolated deinit {}` de WatermarkTilePainter ;
        // attrapée par MeeshyUIDeinitSourceGuardTests après l'intégration d'origin/main.
        nonisolated deinit {}
    }

    nonisolated init(watermark: StoryExportWatermark) {
        self.watermark = watermark
    }

    nonisolated func paint(_ request: AVAsynchronousCIImageFilteringRequest) {
        let source = request.sourceImage
        let extent = source.extent
        guard extent.width >= 1, extent.height >= 1, extent.isInfinite == false else {
            request.finish(with: source, context: nil)
            return
        }
        let time = MeeshyVideoWatermarkBaker.animationTime(for: request.compositionTime.seconds)
        guard let tile = tile(at: time, renderSize: extent.size) else {
            request.finish(with: source, context: nil)
            return
        }
        request.finish(with: tile.composited(over: source).cropped(to: extent), context: nil)
    }

    private nonisolated func tile(at time: Double, renderSize: CGSize) -> CIImage? {
        lock.lock()
        if time == cachedTime, cachedSize == renderSize {
            let cached = cachedTile
            lock.unlock()
            return cached
        }
        lock.unlock()

        let rendered = renderOnMain(at: time, renderSize: renderSize)

        lock.lock()
        cachedTime = time
        cachedSize = renderSize
        cachedTile = rendered
        lock.unlock()
        return rendered
    }

    /// Le rendu du filigrane est MainActor-isolé : on y remonte en `sync`,
    /// comme `StoryAVCompositor.startRequest`. L'appelant (`bake`) est
    /// explicitement documenté comme ne devant pas bloquer le main thread.
    private nonisolated func renderOnMain(at time: Double, renderSize: CGSize) -> CIImage? {
        let box = TileBox()
        if Thread.isMainThread {
            MainActor.assumeIsolated {
                box.image = self.render(at: time, renderSize: renderSize)
            }
        } else {
            DispatchQueue.main.sync {
                MainActor.assumeIsolated {
                    box.image = self.render(at: time, renderSize: renderSize)
                }
            }
        }
        return box.image
    }

    @MainActor
    private func render(at time: Double, renderSize: CGSize) -> CIImage? {
        guard watermark.alpha(at: time) > 0.01 else { return nil }

        let padding = MeeshyVideoWatermarkBaker.shadowPadding
        let block = watermark.blockRect(renderSize: renderSize, at: time).insetBy(dx: -padding, dy: -padding)
        let tileRect = CGRect(x: block.minX.rounded(.down),
                              y: block.minY.rounded(.down),
                              width: block.width.rounded(.up),
                              height: block.height.rounded(.up))
        guard tileRect.width >= 1, tileRect.height >= 1 else { return nil }

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let image = UIGraphicsImageRenderer(size: tileRect.size, format: format).image { context in
            // Le filigrane se place lui-même dans un repère PLEIN CADRE : on
            // décale le contexte pour que ce placement retombe dans la tuile.
            context.cgContext.translateBy(x: -tileRect.minX, y: -tileRect.minY)
            watermark.draw(in: context.cgContext, renderSize: renderSize, at: time)
        }
        guard let cgImage = image.cgImage else { return nil }

        // `CIImage` a son origine en BAS à gauche, le filigrane raisonne en
        // repère UIKit (haut à gauche) : on retourne la position verticale.
        let flippedY = renderSize.height - tileRect.maxY
        return CIImage(cgImage: cgImage)
            .transformed(by: CGAffineTransform(translationX: tileRect.minX, y: flippedY))
    }
}
