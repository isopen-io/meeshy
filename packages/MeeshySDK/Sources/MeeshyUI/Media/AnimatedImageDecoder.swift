import Foundation
import ImageIO
import UIKit

/// **Décoder une image ANIMÉE — ou dire qu'elle ne l'est pas** (#4925).
///
/// ## Ce que ce type ferme
///
/// Relevé du 2026-09-02 sur `apps/ios/` + `packages/MeeshySDK/Sources/`, hors
/// dépendances : `UIImage.animatedImage(with:duration:)` → **0** occurrence,
/// `CGImageSourceGetCount` → **0**, `kCGImagePropertyGIFDictionary` → **0**.
/// Tous les chemins d'image du produit descendent en
/// `CGImageSourceCreateThumbnailAtIndex` — **à l'index 0, toujours**. Aucune
/// image animée n'animait nulle part : ni un sticker de commentaire, ni un
/// sticker de message, ni un sticker de scène.
///
/// Le dépôt SAVAIT pourtant que le cas existe — `MeeshyImageWatermark` refuse de
/// marquer un `gif`/`apng` « qu'on aplatirait », `MediaSaveBranding` sert un GIF
/// animé BRUT pour ne pas le détruire, `MediaCompressor` mappe `image/webp`.
///
/// > **Trois sites PROTÉGEAIENT une animation que rien ne jouait.** Une
/// > protection déclarée n'est pas une capacité : le fichier arrivait intact
/// > jusqu'au disque, jusqu'au cache, jusqu'à la vue — et la vue en montrait la
/// > première image. Aucun site ne rougissait, parce que rien n'était en panne.
///
/// ## `nil` n'est pas un échec
///
/// Une image FIXE rend `nil`, et c'est le contrat : un chemin animé qui
/// accepterait le cas fixe ferait payer à chaque avatar et chaque vignette un
/// `UIImageView` et un tableau de frames. La distinction est la valeur de
/// retour, jamais un drapeau posé à côté — c'est ce qui permet aux appelants de
/// garder leur chemin actuel intact et de brancher l'animé sur un `if let`.
///
/// ## Les quatre formats, et pourquoi ils sont lus par une TABLE
///
/// GIF, APNG, WebP animé et HEICS rangent leur délai dans un dictionnaire de
/// propriétés PROPRE au format, sous des clés différentes. Écrire quatre `if`
/// ferait de l'ajout d'un cinquième format une modification de la boucle ; la
/// table ci-dessous en fait une ligne de données.
///
/// Chaque format expose DEUX clés de délai : la « unclamped » (la valeur écrite
/// dans le fichier) et l'autre (ramenée par le système à un minimum). On lit la
/// première, et `AnimatedImageTiming` applique la convention des délais
/// négligeables — parce que cette convention est une décision de PRODUIT
/// (« un GIF joue à la vitesse à laquelle son auteur l'a vu jouer »), pas un
/// détail de décodage à déléguer au système.
/// **`nonisolated` — et ce n'est pas une concession au compilateur.**
///
/// Décoder N images, c'est N `CGImageSourceCreateThumbnailAtIndex` : sur un GIF
/// de trente images, une fraction de seconde entière. Laisser ce travail sur le
/// thread principal ferait sauter le défilement au moment précis où un sticker
/// animé entre à l'écran — la dimension 4 de la roadmap (« y a-t-il UNE image
/// perdue pendant le geste ? ») répondrait non.
///
/// L'isolation par défaut du paquet est `MainActor` ; l'annotation ci-dessous
/// est donc ce qui REND POSSIBLE l'appel depuis une tâche de fond. Elle a été
/// trouvée par les témoins, qui ne compilaient pas — le genre d'erreur qu'on
/// aurait « corrigée » en annotant le test.
nonisolated public enum AnimatedImageDecoder {

    /// Une animation décodée, prête pour `UIImageView`.
    nonisolated public struct Decoded {
        /// Les images du CYCLE, déjà rééchantillonnées par
        /// `AnimatedImageTiming` — une image lente y apparaît plusieurs fois.
        /// **Ne pas s'en servir pour compter les images du FICHIER** : les deux
        /// nombres diffèrent par construction.
        public let frames: [CGImage]
        /// Durée d'un cycle complet.
        public let duration: TimeInterval
        /// `0` = boucle infinie, la valeur par défaut de tous les formats.
        public let loopCount: Int

        /// La forme qu'`UIImageView` anime tout seul.
        public var animatedImage: UIImage? {
            guard !frames.isEmpty else { return nil }
            return UIImage.animatedImage(
                with: frames.map { UIImage(cgImage: $0) },
                duration: duration
            )
        }

        /// La PREMIÈRE image, servie telle quelle quand le mouvement est réduit
        /// (`UIAccessibility.isReduceMotionEnabled`). Figer sur l'image 1 est ce
        /// que fait un GIF non joué : le lecteur voit ce que l'auteur a choisi
        /// comme vignette.
        public var stillImage: UIImage? {
            frames.first.map(UIImage.init(cgImage:))
        }
    }

    /// **La table est en `String`, jamais en `CFString`, et c'est une contrainte
    /// de CONCURRENCE, pas un goût.**
    ///
    /// `CFString` n'est pas `Sendable`. Une `static let [FormatKeys]` qui en
    /// contient est « shared mutable state » aux yeux du compilateur, qui
    /// REPOUSSE alors tout l'enum sur le `MainActor` — l'exact contraire de ce
    /// que ce décodeur doit être.
    ///
    /// > Le symptôme était à quinze lignes de sa cause : les erreurs
    /// > désignaient les APPELS depuis les témoins (« main actor-isolated static
    /// > method »), jamais la table qui provoquait l'isolation. Annoter les
    /// > témoins les aurait fait compiler en laissant le décodeur sur le thread
    /// > principal — un vert qui aurait scellé le défaut.
    ///
    /// Les clés d'ImageIO sont des `CFString` qui se pontent en `String` sans
    /// copie, et les dictionnaires de propriétés se lisent aussi bien en
    /// `[String: Any]`. La table Sendable est donc gratuite. (Le dictionnaire
    /// d'options de `frame(from:at:maxPixelSize:)` reste en `CFString` : c'est
    /// une valeur LOCALE, jamais partagée.)
    private struct FormatKeys: Sendable {
        let container: String
        let unclampedDelay: String
        let delay: String
        let loopCount: String
    }

    private static let formats: [FormatKeys] = [
        FormatKeys(container: kCGImagePropertyGIFDictionary as String,
                   unclampedDelay: kCGImagePropertyGIFUnclampedDelayTime as String,
                   delay: kCGImagePropertyGIFDelayTime as String,
                   loopCount: kCGImagePropertyGIFLoopCount as String),
        FormatKeys(container: kCGImagePropertyPNGDictionary as String,
                   unclampedDelay: kCGImagePropertyAPNGUnclampedDelayTime as String,
                   delay: kCGImagePropertyAPNGDelayTime as String,
                   loopCount: kCGImagePropertyAPNGLoopCount as String),
        FormatKeys(container: kCGImagePropertyHEICSDictionary as String,
                   unclampedDelay: kCGImagePropertyHEICSUnclampedDelayTime as String,
                   delay: kCGImagePropertyHEICSDelayTime as String,
                   loopCount: kCGImagePropertyHEICSLoopCount as String)
    ]

    /// **Ces octets animent-ils VRAIMENT ?** (#3956)
    ///
    /// `AnimatedImageEligibility` répond « peut-être » — et pour le HEIC, elle
    /// le répond à TOUTE photo d'iPhone, puisque la structure d'une séquence
    /// vit hors de l'en-tête. Un site qui doit DÉCIDER quoi GARDER (le collage
    /// d'un sticker : les octets d'origine, ou un PNG réduit ?) ne peut pas se
    /// contenter d'un peut-être : il rangerait une photo de douze mégapixels
    /// entière dans une bibliothèque bornée à 64 Mo.
    ///
    /// La réponse EXACTE coûte une construction de source et une lecture de
    /// compte — **aucune image décodée**. C'est la moitié bon marché de
    /// `decode`, isolée pour les appelants qui n'ont pas besoin des images.
    public static func animates(_ data: Data) -> Bool {
        guard AnimatedImageEligibility.mayBeAnimated(data),
              let source = CGImageSourceCreateWithData(data as CFData, nil)
        else { return false }
        return CGImageSourceGetCount(source) > 1
    }

    /// `nil` ⇒ l'image est FIXE (ou illisible) : l'appelant garde son chemin
    /// habituel.
    ///
    /// - Parameter maxPixelSize: plafond de décodage, en pixels, sur le plus
    ///   grand côté. Un sticker fait ≤ 512 px ; décoder N images en pleine
    ///   résolution pour les afficher dans 120 pt coûterait N bitmaps inutiles.
    ///   `nil` = taille native.
    public static func decode(_ data: Data, maxPixelSize: Int? = nil) -> Decoded? {
        // **La porte AVANT la source** (`AnimatedImageEligibility`). Construire
        // un `CGImageSource` pour apprendre qu'un JPEG n'est pas animé se paie
        // à chaque avatar et à chaque vignette du fil ; la porte répond en
        // lisant au plus 1 Ko, sans allouer. Elle ne dit jamais « non » à un
        // fichier animé — c'est la seule erreur qui coûterait, et sa direction
        // est choisie plutôt que subie.
        guard AnimatedImageEligibility.mayBeAnimated(data) else { return nil }
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let count = CGImageSourceGetCount(source)
        guard count > 1 else { return nil }

        var delays: [TimeInterval] = []
        var images: [CGImage] = []
        delays.reserveCapacity(count)
        images.reserveCapacity(count)

        for index in 0..<count {
            guard let image = frame(from: source, at: index, maxPixelSize: maxPixelSize) else { continue }
            images.append(image)
            delays.append(delay(from: source, at: index) ?? AnimatedImageTiming.defaultDelay)
        }

        // Une source qui ANNONCE plusieurs images mais n'en rend qu'une n'est
        // pas une animation — cas des fichiers tronqués, qui arrivent quand un
        // téléchargement s'interrompt.
        guard let plan = AnimatedImageTiming.plan(delays: delays) else { return nil }

        var cycle: [CGImage] = []
        cycle.reserveCapacity(plan.totalFrames)
        for (image, repeats) in zip(images, plan.repeats) {
            cycle.append(contentsOf: repeatElement(image, count: repeats))
        }

        return Decoded(frames: cycle, duration: plan.duration, loopCount: loops(from: source))
    }

    private static func frame(from source: CGImageSource, at index: Int, maxPixelSize: Int?) -> CGImage? {
        guard let maxPixelSize else {
            return CGImageSourceCreateImageAtIndex(source, index, nil)
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, index, options as CFDictionary)
    }

    private static func properties(from source: CGImageSource, at index: Int) -> [String: Any]? {
        CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [String: Any]
    }

    private static func delay(from source: CGImageSource, at index: Int) -> TimeInterval? {
        guard let props = properties(from: source, at: index) else { return nil }
        for format in formats {
            guard let container = props[format.container] as? [String: Any] else { continue }
            if let unclamped = container[format.unclampedDelay] as? Double, unclamped > 0 {
                return unclamped
            }
            if let clamped = container[format.delay] as? Double {
                return clamped
            }
        }
        return nil
    }

    private static func loops(from source: CGImageSource) -> Int {
        guard let props = CGImageSourceCopyProperties(source, nil) as? [String: Any] else { return 0 }
        for format in formats {
            if let container = props[format.container] as? [String: Any],
               let loops = container[format.loopCount] as? Int {
                return loops
            }
        }
        return 0
    }
}
