import Foundation
import SwiftUI
import UIKit
import MeeshySDK

// MARK: - Amorces de page blanche — points d'injection app-side
//
// Calque exact de `StoryLocationPickerEnvironment.swift` : la caméra
// (AVCaptureSession, permissions, écran de refus) et la pellicule (PhotoKit,
// autorisation limitée) sont des dépendances SYSTÈME que le SDK ne pilote pas.
// Il expose deux fabriques et présente ce que l'app fournit.
//
// Le défaut `nil` n'est pas un détail : c'est la règle produit. Une amorce qui
// ouvre le vide est pire que pas d'amorce — même doctrine que le chip « Lieu ».

/// Ce que la caméra app-side rend au composer. Le SDK ne référence JAMAIS le
/// type de résultat de l'app (`CameraResult`) : la frontière est cette valeur.
public nonisolated enum StoryCameraCapture {
    case photo(UIImage)
    case video(URL)
}

/// Fabrique de l'écran de capture, **injectée par l'app**.
///
/// Variante « plein écran app-side » retenue contre l'aperçu live dans le
/// canvas : ce dernier obligerait le SDK à décider QUAND démarrer/arrêter une
/// session matérielle (frontière SDK Purity franchie), entrerait en conflit
/// avec le fond auto-appliqué, romprait la parité WYSIWYG canvas/reader/export
/// et contredirait « le canvas naît en pause ». La signature est conçue pour
/// qu'une bascule ultérieure n'exige AUCUNE modification du SDK.
public nonisolated struct StoryCameraCaptureProvider {
    public typealias Make = @MainActor (@escaping (StoryCameraCapture) -> Void) -> AnyView

    private let make: Make

    public init(make: @escaping Make) {
        self.make = make
    }

    @MainActor
    public func makeView(onCapture: @escaping (StoryCameraCapture) -> Void) -> AnyView {
        make(onCapture)
    }
}

public struct StoryCameraCaptureKey: EnvironmentKey {
    public static let defaultValue: StoryCameraCaptureProvider? = nil
}

/// La dernière photo de la pellicule, réduite à ce dont le canvas a besoin :
/// un identifiant opaque (le SDK n'interprète pas les localIdentifier PhotoKit)
/// et une vignette déjà décodée.
public nonisolated struct StoryRecentCameraRollAsset: Equatable, @unchecked Sendable {
    public let identifier: String
    public let thumbnail: UIImage

    public init(identifier: String, thumbnail: UIImage) {
        self.identifier = identifier
        self.thumbnail = thumbnail
    }
}

/// Accès en LECTURE à la dernière photo de la pellicule, **injecté par l'app**.
///
/// Trois opérations : `latest()` pour peindre la vignette, `fullImage(for:)`
/// pour l'insérer au tap, `requestAccess()` pour DEMANDER l'accès sur un geste
/// explicite. L'app décide de l'autorisation, du tri et du downsample ; le SDK
/// ne fait que peindre et poser. Sans injection, la vignette n'est pas rendue et
/// la galerie reste accessible par le `PhotosPicker` de l'amorce de repli.
///
/// La séparation `latest()` / `requestAccess()` porte toute la règle produit :
/// **`latest()` ne demande JAMAIS rien** — il est appelé à l'ouverture du
/// composer, et une alerte système que l'utilisateur n'a pas provoquée est le
/// meilleur moyen d'obtenir un refus définitif. `requestAccess()` n'est appelé
/// que depuis le tap sur la capsule « Galerie ».
public nonisolated struct StoryRecentCameraRollProvider: Sendable {
    public typealias Latest = @Sendable () async -> StoryRecentCameraRollAsset?
    public typealias FullImage = @Sendable (String) async -> UIImage?

    private let latestProvider: Latest
    private let fullImageProvider: FullImage
    private let requestAccessProvider: Latest

    public init(latest: @escaping Latest,
                fullImage: @escaping FullImage,
                requestAccess: @escaping Latest) {
        self.latestProvider = latest
        self.fullImageProvider = fullImage
        self.requestAccessProvider = requestAccess
    }

    public func latest() async -> StoryRecentCameraRollAsset? {
        await latestProvider()
    }

    public func fullImage(for identifier: String) async -> UIImage? {
        await fullImageProvider(identifier)
    }

    /// Demande l'accès en lecture (geste explicite) puis rend la dernière photo
    /// si l'accès est accordé. `nil` = refus, ou pellicule vide : l'appelant
    /// bascule alors sur le `PhotosPicker` système.
    public func requestAccess() async -> StoryRecentCameraRollAsset? {
        await requestAccessProvider()
    }
}

/// Quelle amorce « pellicule » la page blanche propose. Trois états, décidés
/// sur le seul état que le SDK connaît : une vignette a-t-elle été résolue, et
/// l'app a-t-elle injecté un fournisseur.
public nonisolated enum StoryGalleryStarter: Equatable {
    /// Accès déjà accordé et pellicule non vide : vignette de la dernière photo
    /// (1 tap = insertion) + chevron vers le `PhotosPicker`.
    case recentAssetThumbnail
    /// Capsule « Galerie » générique dont le tap DEMANDE l'accès en lecture.
    case accessRequestCapsule
    /// Aucun fournisseur injecté : capsule « Galerie » qui ouvre directement le
    /// `PhotosPicker` système (il ne consomme aucune permission).
    case systemPickerCapsule
}

/// Ce que le tap sur la capsule « Galerie » produit une fois l'accès arbitré.
public nonisolated enum StoryGalleryAccessOutcome: Equatable {
    case insertRecentAsset(StoryRecentCameraRollAsset)
    case presentSystemPicker
}

public struct StoryRecentCameraRollAssetKey: EnvironmentKey {
    public static let defaultValue: StoryRecentCameraRollProvider? = nil
}

extension EnvironmentValues {
    public var storyCameraCapture: StoryCameraCaptureProvider? {
        get { self[StoryCameraCaptureKey.self] }
        set { self[StoryCameraCaptureKey.self] = newValue }
    }

    public var storyRecentCameraRollAsset: StoryRecentCameraRollProvider? {
        get { self[StoryRecentCameraRollAssetKey.self] }
        set { self[StoryRecentCameraRollAssetKey.self] = newValue }
    }
}

// MARK: - Collage (C5b) — le presse-papier entre dans le composer

/// Ce qu'un collage rend au composer, une fois le presse-papier résolu.
///
/// Le SDK ne référence JAMAIS les types du pipeline app-side (`ComposerIngest`,
/// `ComposerDropResolver`, `PasteDestination`) : la frontière est cette valeur,
/// exactement comme `StoryCameraCapture` l'est pour la caméra.
///
/// **Trois cas, et pas quatre.** Un DOCUMENT collé n'apparaît pas ici : la
/// scène de story n'héberge aucune pièce jointe. Il n'est pas pour autant
/// avalé — l'app l'annonce (règle O12 : « document ⇒ pièce jointe, jamais un
/// rejet muet »), et le jour où une surface sait en héberger, c'est elle qui le
/// reçoit. Faire passer par ici un cas que la scène ne sait pas poser
/// obligerait le SDK à le jeter en silence, soit exactement ce que la directive
/// produit du 2026-08-23 interdit.
public nonisolated enum StoryPastedItem: @unchecked Sendable {
    case image(UIImage)
    case video(URL)
    case audio(URL)
    /// **Le TEXTE, ajouté au #4378** (directive porteur 2026-08-30 : « coller
    /// n'apparaisse que si on a une image, un texte ou vidéo »).
    ///
    /// Son absence n'était pas un oubli de câblage : le vocabulaire d'entrée du
    /// canvas ne le NOMMAIT pas, si bien que coller du texte ne pouvait
    /// strictement rien produire. Il était annoncé comme « appartenant à l'outil
    /// texte » — une destination qu'aucun geste n'ouvrait depuis le collage.
    ///
    /// Où il va est décidé par `StoryPastePolicy` : au-delà de dix mots il
    /// DÉCRIT la slide, en deçà il devient un objet de scène.
    case text(String)
}

/// Résolution app-side d'un collage, **injectée par l'app**.
///
/// Même doctrine que `StoryCameraCaptureProvider` : le presse-papier iOS est
/// une dépendance SYSTÈME dont la lecture (représentation fichier vs données,
/// refus des dossiers, autorisation sandbox, nom d'origine) vit déjà app-side
/// dans `ComposerDropResolver` / `ComposerIngestRouter`, branchés sur six sites
/// de production. Le SDK ne réécrit pas ce lecteur — il lui passe les
/// `NSItemProvider` que `PasteButton` lui remet et pose ce qui revient.
///
/// Le défaut `nil` est la règle produit, pas un détail : sans injection, la
/// capsule « Coller » n'est pas rendue. Une amorce qui ouvre le vide est pire
/// que pas d'amorce.
public nonisolated struct StoryPasteProvider {
    public typealias Resolve = @MainActor ([NSItemProvider]) async -> [StoryPastedItem]

    private let resolve: Resolve

    public init(resolve: @escaping Resolve) {
        self.resolve = resolve
    }

    @MainActor
    public func items(from providers: [NSItemProvider]) async -> [StoryPastedItem] {
        await resolve(providers)
    }
}

public struct StoryPasteKey: EnvironmentKey {
    public static let defaultValue: StoryPasteProvider? = nil
}

extension EnvironmentValues {
    public var storyPaste: StoryPasteProvider? {
        get { self[StoryPasteKey.self] }
        set { self[StoryPasteKey.self] = newValue }
    }
}

// MARK: - « Mes stickers » (V3-5) — bibliothèque personnelle, injectée par l'app

/// Une vignette de la bibliothèque personnelle « Mes stickers ». Le SDK
/// n'interprète pas `id` — il ne sert qu'à la stabilité de la grille
/// (`ForEach(id:)`) ; le magasin qui lui donne un sens (budget, éviction,
/// persistance) est app-side.
public nonisolated struct StoryStickerLibraryItem: Identifiable, Equatable, @unchecked Sendable {
    /// Provenance à écrire dans `StorySticker.provider` quand c'est CETTE
    /// bibliothèque qui a fourni l'image. Métadonnée d'ORIGINE : rien ne s'en
    /// déduit au chargement, elle évite seulement que le mot « library » soit
    /// réécrit à la main au site de pose et dans les tests qui le vérifient.
    public static let provider = "library"

    /// **Le plafond de décodage d'une VIGNETTE de la bibliothèque, en pixels**
    /// (#3956) — le ×3 d'un écran Retina sur la case de 52 pt de la grille.
    ///
    /// Il vit ici, et non de chaque côté, parce que les DEUX moitiés le lisent :
    /// l'app décode l'image fixe d'un cycle en relisant le disque, le SDK décode
    /// le cycle lui-même pour l'animer. Deux nombres écrits séparément
    /// donneraient deux résolutions dans la même case, et l'écart ne se verrait
    /// qu'entre un GIF et le PNG posé à côté de lui.
    public static let thumbnailPixelBudget = 156

    public let id: String
    /// **L'image FIXE** — pour un sticker animé, sa première image, celle qu'un
    /// GIF non joué montre. Tout chemin de rendu fixe (vignette de grille,
    /// cover, export, thumbHash) continue de la lire sans rien savoir de
    /// l'animation.
    public let thumbnail: UIImage
    /// **Les octets ANIMÉS du sticker** — `nil` = fixe (#3956).
    ///
    /// Les octets sont la SOURCE ; `thumbnail` en est la projection. C'est
    /// l'inverse qui a fait perdre l'animation jusqu'ici : le collage décodait
    /// une `UIImage` puis la ré-encodait en PNG, si bien que les images 2 à N
    /// étaient détruites AVANT même d'entrer dans la bibliothèque.
    ///
    /// Pourquoi des octets et pas une `UIImage` animée : `UIImage
    /// .animatedImage(with:duration:)` porte ses images dans `.images` et rend
    /// `cgImage` **nil**. Une telle image traverserait `loadedImages` en
    /// annulant en silence le thumbHash, l'encodage PNG, la cover et l'export —
    /// quatre chemins qui lisent tous `cgImage`. Les octets se décodent au
    /// budget du site qui les peint, et ne cassent rien en route.
    public let animatedData: Data?

    public init(id: String, thumbnail: UIImage, animatedData: Data? = nil) {
        self.id = id
        self.thumbnail = thumbnail
        self.animatedData = animatedData
    }

    public static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }
}

/// Accès à « Mes stickers », **injecté par l'app**. Même doctrine que
/// `StoryPasteProvider` : la bibliothèque (budget, éviction LRU, persistance
/// disque) est une dépendance app-side, le SDK ne fait que peindre ce qu'elle
/// rend et lui remettre les `NSItemProvider` que `PasteButton` lui remet.
///
/// Le défaut `nil` est la règle produit, pas un détail : sans injection, la
/// section « Mes stickers » n'est pas rendue — même doctrine que la capsule
/// « Coller » des amorces de page blanche (loi 4 : un outil non offert est
/// absent, jamais grisé).
public nonisolated struct StoryStickerLibraryProvider {
    public typealias Recents = @MainActor () async -> [StoryStickerLibraryItem]
    public typealias Paste = @MainActor ([NSItemProvider]) async -> [StoryStickerLibraryItem]
    /// **Détourer le sujet d'une photo** (#3955) : l'app reçoit les octets
    /// choisis, rend la bibliothèque à jour — ou `nil` si aucun sujet n'a été
    /// trouvé, ce qui est le refus le plus fréquent et doit se DIRE.
    public typealias Lift = @MainActor (Data) async -> [StoryStickerLibraryItem]?

    private let recentsProvider: Recents
    private let pasteProvider: Paste
    private let liftProvider: Lift?

    /// - Parameter lift: `nil` ⇒ **l'entrée « détourer » n'est pas rendue.**
    ///   C'est la loi 4, et ici elle a une raison mesurable : le détourage est
    ///   une API iOS 17 alors que le plancher du projet est 16. Une entrée
    ///   grisée promettrait à un utilisateur d'iOS 16 une capacité que son
    ///   appareil n'a pas.
    public init(recents: @escaping Recents,
                paste: @escaping Paste,
                lift: Lift? = nil) {
        self.recentsProvider = recents
        self.pasteProvider = paste
        self.liftProvider = lift
    }

    /// `false` quand cet appareil ne sait pas détourer — la surface lit ce
    /// prédicat plutôt que de refaire un `#available`, qui la ferait diverger
    /// de la capacité réellement injectée.
    public var canLift: Bool { liftProvider != nil }

    /// `nil` = rien n'est entré dans la bibliothèque (capacité absente, ou
    /// aucun sujet trouvé) : la grille reste inchangée, et c'est l'app qui l'a
    /// dit à l'utilisateur.
    @MainActor
    public func lift(imageData: Data) async -> [StoryStickerLibraryItem]? {
        guard let liftProvider else { return nil }
        return await liftProvider(imageData)
    }

    @MainActor
    public func recents() async -> [StoryStickerLibraryItem] {
        await recentsProvider()
    }

    @MainActor
    public func paste(_ providers: [NSItemProvider]) async -> [StoryStickerLibraryItem] {
        await pasteProvider(providers)
    }
}

public struct StoryStickerLibraryKey: EnvironmentKey {
    public static let defaultValue: StoryStickerLibraryProvider? = nil
}

extension EnvironmentValues {
    public var storyStickerLibrary: StoryStickerLibraryProvider? {
        get { self[StoryStickerLibraryKey.self] }
        set { self[StoryStickerLibraryKey.self] = newValue }
    }
}
