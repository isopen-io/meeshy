import Foundation
import QuartzCore
import UIKit
import MeeshySDK

/// `CALayer` subclass that renders a `StorySticker` — a template drawing, a
/// pasted bitmap, or a single emoji glyph rasterized by `StoryStickerRasterizer`.
///
/// `baseSize` is interpreted in design pixels (1080-référentiel) and projected
/// through `CanvasGeometry.render(_:)` so stickers retain identical visual
/// proportions across iPhone and iPad canvases.
public final class StoryStickerLayer: CALayer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public private(set) nonisolated(unsafe) var sticker: StorySticker?

    /// Chargeur du bitmap d'un sticker IMAGE publié — le même shim que celui de
    /// `StoryMediaLayer` (`CacheCoordinator.shared.images` : L1 NSCache → disque
    /// → réseau). Remplaçable par `_setImageLoaderForTesting(_:)`.
    private nonisolated(unsafe) var imageLoader: any StoryMediaImageLoading = DiskCacheImageLoader()

    /// Chargement EN VOL du bitmap. Annulé à chaque `configure` : une couche
    /// reconfigurée pour un autre sticker ne doit jamais recevoir le bitmap du
    /// précédent une fois son glyphe posé.
    private nonisolated(unsafe) var currentLoadTask: Task<Void, Never>?

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryStickerLayer does not support NSCoder")
    }

    /// Couture de test : injecte un chargeur déterministe et annule le
    /// chargement en cours, comme le fait `StoryMediaLayer`.
    @MainActor
    public func _setImageLoaderForTesting(_ loader: any StoryMediaImageLoading) {
        currentLoadTask?.cancel()
        currentLoadTask = nil
        imageLoader = loader
    }

    /// Poignée attendable du dernier chargement — `nil` quand le sticker n'a
    /// pas de bitmap à aller chercher.
    @MainActor
    public func _currentImageLoadTaskForTesting() -> Task<Void, Never>? {
        currentLoadTask
    }

    /// **Les clés sous lesquelles le bitmap d'un sticker peut être rangé**, dans
    /// l'ordre où on les essaie (#4852).
    ///
    /// Le composer retient le bitmap collé sous l'id de l'ÉLÉMENT
    /// (`StoryComposerViewModel.addSticker(image:)` → `loadedImages[sticker.id]`)
    /// et ne le re-range JAMAIS quand la publication stampe `postMediaId` : la
    /// cover rendue après téléversement reçoit les effets publiés ET le
    /// dictionnaire keyé par id. Une clé unique — la forme de `StoryMediaLayer`
    /// — aurait donc raté le bitmap sur exactement ce chemin. Le `postMediaId`
    /// passe en premier parce que c'est la clé qu'un lecteur (export, cache
    /// disque) connaît ; l'id d'élément est le repli du composer.
    public nonisolated static func bitmapCacheKeys(for sticker: StorySticker) -> [String] {
        var keys: [String] = []
        for key in [sticker.postMediaId, sticker.id] where !key.isEmpty && !keys.contains(key) {
            keys.append(key)
        }
        return keys
    }

    /// - Parameters:
    ///   - imageCache: bitmaps que le lecteur a déjà en main. Un
    ///     `ComposerImageCacheReader` (composer, cover, export) est lu de façon
    ///     SYNCHRONE — le bitmap est là avant le retour ; tout autre lecteur est
    ///     interrogé dans la tâche de chargement.
    ///   - resolver: `postMediaId` → URL du `PostMedia` publié, la même fermeture
    ///     que celle des médias (`StoryReaderContext.postMediaURLResolver`).
    @MainActor
    public func configure(with sticker: StorySticker,
                          geometry: CanvasGeometry,
                          mode: RenderMode,
                          renderScale: CGFloat = UIScreen.main.scale,
                          imageCache: ImageCacheReader? = nil,
                          resolver: (@Sendable (String) -> URL?)? = nil) {
        self.sticker = sticker
        currentLoadTask?.cancel()
        currentLoadTask = nil

        // Règle partagée avec le composite et l'export — voir
        // `CanvasGeometry.stickerFontSize`, qui les faisait diverger.
        let renderedSide = CanvasGeometry.stickerFontSize(baseSize: sticker.baseSize,
                                                          scale: sticker.scale,
                                                          canvasWidth: geometry.renderSize.width)

        // **Une décoration se dessine, elle ne se rasterise pas en glyphe**
        // (#4718). Un gabarit MESURE son contenu — une heure, un nom de lieu —
        // donc sa boîte n'est pas le carré du glyphe.
        //
        // Un gabarit INCONNU (publié par une version plus récente) retombe sur
        // la branche emoji ci-dessous, qui sert `wireEmoji` : le lecteur voit
        // « 🕐 » plutôt qu'un trou.
        if sticker.kind == .template,
           let (image, taille) = StickerTemplateRenderer.image(
               templateID: sticker.templateId,
               slots: sticker.slots,
               metrics: StickerTemplateMetrics.sticker(geometry: geometry,
                                                       baseSize: sticker.baseSize,
                                                       scale: sticker.scale),
               screenScale: renderScale),
           taille.width > 0, taille.height > 0 {
            contents = image?.cgImage
            bounds = CGRect(origin: .zero, size: taille)
        } else if let bitmap = Self.synchronousBitmap(for: sticker, imageCache: imageCache) {
            // **Un sticker IMAGE se PEINT** (#4852). Le bitmap collé s'ajuste
            // dans le carré du sticker sans déformation — la règle de
            // `StorySlideRenderer.drawAspectFit`, portée sur `CALayer` par la
            // gravité.
            contents = bitmap
            contentsGravity = .resizeAspect
            bounds = CGRect(x: 0, y: 0, width: renderedSide, height: renderedSide)
        } else {
            // `wireEmoji` et non `emoji` : un sticker gabarit posé sans emoji,
            // ou dont le gabarit est inconnu, doit quand même peindre quelque
            // chose — la chaîne vide laisserait un TROU là où l'auteur a posé.
            // Pour un sticker image dont le bitmap n'est pas encore là, c'est
            // le repli 🖼️ qui tient la place le temps du chargement.
            if let cg = StoryStickerRasterizer.shared.cgImage(for: sticker.wireEmoji,
                                                               size: renderedSide) {
                contents = cg
            }
            bounds = CGRect(x: 0, y: 0, width: renderedSide, height: renderedSide)
            startLoadingBitmap(for: sticker, imageCache: imageCache, resolver: resolver)
        }

        let designCenterX = geometry.designLength(forNormalized: CGFloat(sticker.x))
        let designCenterY = geometry.designHeightLength(forNormalized: CGFloat(sticker.y))
        position = geometry.render(CGPoint(x: designCenterX, y: designCenterY))
        anchorPoint = sticker.anchor
        transform = CATransform3DMakeRotation(CGFloat(sticker.rotation) * .pi / 180, 0, 0, 1)
        zPosition = CGFloat(sticker.zIndex)
        contentsScale = renderScale
        name = sticker.id

        // Stickers are pre-rasterized via StoryStickerRasterizer; in .play we
        // additionally flag the layer for the GPU rasterization fast path.
        // Une décoration ANIMÉE reste rasterisable : la pose (#4821) est une
        // transformation de la couche, pas un redessin de son contenu.
        shouldRasterize = mode == .play && sticker.isStatic
        if shouldRasterize { rasterizationScale = renderScale }
    }

    /// Le bitmap qu'un lecteur SYNCHRONE a déjà en main — `nil` sinon.
    ///
    /// Seul `ComposerImageCacheReader` est lu ici : c'est le lecteur du composer,
    /// de la cover (`StoryStaticSnapshot`) et de l'export, trois rendus « en un
    /// coup » où un bitmap arrivé une frame plus tard n'atteindrait jamais
    /// l'image. Le composer y range le sticker collé, l'export ses fichiers
    /// préchargés.
    @MainActor
    private static func synchronousBitmap(for sticker: StorySticker,
                                          imageCache: ImageCacheReader?) -> CGImage? {
        guard let synchronousReader = imageCache as? ComposerImageCacheReader else { return nil }
        return bitmapCacheKeys(for: sticker)
            .lazy
            .compactMap { synchronousReader.images[$0]?.cgImage }
            .first
    }

    /// Chemin ASYNCHRONE — la discipline de `StoryMediaLayer.configureImage` :
    /// (1) le lecteur d'images du contexte (un `PreloadedImageCacheReader` en
    /// preview composer, un cache disque), (2) l'URL du `PostMedia` par le
    /// resolver, servie par `CacheCoordinator.shared.images`.
    ///
    /// Un sticker qui n'adresse rien (glyphe pur, aucun lecteur) ne lance
    /// aucune tâche : le canvas reconstruit ses couches à 60 Hz, et une tâche
    /// par emoji par tick serait du travail pour rien.
    ///
    /// Capture FORTE de `self` : la couche vit dans le `StoryRendererCache` tant
    /// que sa signature tient, mais entre deux ticks du canvas une capture
    /// faible la verrait libérée avant le stamp (cf. `StoryMediaLayer`). Le
    /// cycle Task → self → Task se referme au `return` de la tâche.
    @MainActor
    private func startLoadingBitmap(for sticker: StorySticker,
                                    imageCache: ImageCacheReader?,
                                    resolver: (@Sendable (String) -> URL?)?) {
        let hasPublishedAsset = !sticker.postMediaId.isEmpty
        let asynchronousReader: ImageCacheReader? = imageCache is ComposerImageCacheReader ? nil : imageCache
        guard hasPublishedAsset || asynchronousReader != nil else { return }

        let keys = Self.bitmapCacheKeys(for: sticker)
        let resolvedURL: URL? = hasPublishedAsset ? resolver?(sticker.postMediaId) : nil
        let loader = imageLoader
        currentLoadTask = Task { @MainActor in
            // Une configuration qui a supplanté celle-ci a déjà annulé la tâche :
            // sortir AVANT tout `await`, pour ne jamais suspendre un chargement
            // qu'on abandonnera.
            guard !Task.isCancelled else { return }
            if let asynchronousReader {
                for key in keys {
                    if let cached = await asynchronousReader.cachedImage(for: key)?.cgImage {
                        guard !Task.isCancelled else { return }
                        self.stampBitmap(cached)
                        return
                    }
                    guard !Task.isCancelled else { return }
                }
            }
            guard let url = resolvedURL else { return }
            let loaded = await loader.image(for: url.absoluteString)
            guard !Task.isCancelled, let cgImage = loaded?.cgImage else { return }
            self.stampBitmap(cgImage)
        }
    }

    @MainActor
    private func stampBitmap(_ bitmap: CGImage) {
        contents = bitmap
        contentsGravity = .resizeAspect
    }

    /// **Pose la transformation d'une animation** (#4821) — réappliquée à
    /// CHAQUE tick par la post-passe de `StoryRenderer`, jamais au build : la
    /// couche peut venir du cache d'export, où la transformation du tick
    /// précédent survivrait sinon.
    ///
    /// La rotation de l'AUTEUR et celle de l'animation s'additionnent ; le
    /// décalage est une fraction des `bounds`, donc indépendant de l'écran ; le
    /// pivot reste `anchorPoint`, posé par `configure`. Un bitmap suit la même
    /// pose qu'un glyphe : la transformation porte sur la couche, pas sur ce
    /// qu'elle peint.
    @MainActor
    public func applyAnimationPose(_ pose: StickerAnimation.Pose,
                                   baseRotationDegrees: Double) {
        var pose3D = CATransform3DMakeTranslation(CGFloat(pose.offsetX) * bounds.width,
                                                  CGFloat(pose.offsetY) * bounds.height, 0)
        pose3D = CATransform3DRotate(pose3D,
                                     CGFloat(baseRotationDegrees + pose.rotationDegrees) * .pi / 180,
                                     0, 0, 1)
        pose3D = CATransform3DScale(pose3D, CGFloat(pose.scale), CGFloat(pose.scale), 1)
        transform = pose3D
    }
}
