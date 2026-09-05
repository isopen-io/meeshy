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

    /// **Les octets ANIMÉS qui servent ce sticker, s'il y en a** (#3956) —
    /// jumelle exacte de `bitmapCacheKeys`, et pour la même raison : le
    /// composer range sous l'id de l'ÉLÉMENT, un lecteur sous le `postMediaId`.
    ///
    /// Elle est PURE et publique parce que la décision — « ces octets-ci
    /// animent ce sticker-là » — se prouve sans monter une couche ; le reste
    /// (décoder, poser une `CAKeyframeAnimation`) est du Core Animation qu'un
    /// témoin ne peut qu'observer indirectement.
    public nonisolated static func animatedBytes(for sticker: StorySticker,
                                                 in animations: [String: Data]) -> Data? {
        guard !animations.isEmpty else { return nil }
        return bitmapCacheKeys(for: sticker)
            .lazy
            .compactMap { animations[$0] }
            .first
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
            contents = CanvasImageOrientation.displayCGImage(image)
            bounds = CGRect(origin: .zero, size: taille)
        } else if let decoded = Self.synchronousAnimation(
                    for: sticker, imageCache: imageCache,
                    maxPixelSize: Self.decodeBudget(side: renderedSide, scale: renderScale)) {
            // **Un sticker COLLÉ anime dès le composer** (#3956). Les octets
            // priment sur le bitmap parce qu'ils le CONTIENNENT : `loadedImages`
            // n'en porte que la première image. L'ordre inverse aurait peint
            // cette image-là et l'aurait laissée là, sans qu'aucun site rougisse
            // — la panne muette du #4925, rejouée sur le chemin synchrone.
            bounds = CGRect(x: 0, y: 0, width: renderedSide, height: renderedSide)
            stampAnimated(decoded)
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
        // `playsAnimatedContents` est la TROISIÈME condition, et elle n'est pas
        // décorative : `stampAnimated` retire la rasterisation, et cette ligne —
        // exécutée APRÈS lui sur le chemin synchrone — la remettrait, figeant le
        // GIF sur son cache de première image. L'optimisation juste annulerait
        // la feature, sans erreur nulle part.
        shouldRasterize = mode == .play && sticker.isStatic && !playsAnimatedContents
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

    /// Les octets animés qu'un lecteur SYNCHRONE a déjà en main, décodés au
    /// budget de la couche — `nil` sinon, et `nil` n'est pas un échec : c'est
    /// le cas nominal d'un sticker fixe, qui garde son chemin.
    ///
    /// Le plafond est passé en paramètre plutôt que lu sur `bounds` : à cet
    /// instant, `configure` n'a pas encore posé la boîte, et décoder N images en
    /// pleine résolution pour les peindre dans 120 pt coûterait N bitmaps pour
    /// rien.
    @MainActor
    private static func synchronousAnimation(for sticker: StorySticker,
                                             imageCache: ImageCacheReader?,
                                             maxPixelSize: Int) -> AnimatedImageDecoder.Decoded? {
        guard let synchronousReader = imageCache as? ComposerImageCacheReader,
              let bytes = animatedBytes(for: sticker, in: synchronousReader.animations),
              let key = bitmapCacheKeys(for: sticker).first
        else { return nil }
        // **Mémorisé** : `configure` est rappelée à chaque mutation de
        // l'élément — donc à chaque image d'un déplacement. Décoder là ferait
        // sauter le geste qu'on est en train de faire.
        return AnimatedImageMemo.decoded(key: key, bytes: bytes, maxPixelSize: maxPixelSize)
    }

    /// Le plafond de décodage en PIXELS pour une couche qui n'a pas encore de
    /// boîte. Le plancher à 64 px protège du cas dégénéré — un côté nul rendrait
    /// un plafond de 0, ImageIO refuserait toute vignette, et le sticker
    /// n'apparaîtrait jamais **sans erreur nulle part** ; le test de finitude
    /// protège d'une géométrie dégénérée, `Int(_:)` piégeant sur un NaN.
    private nonisolated static func decodeBudget(side: CGFloat, scale: CGFloat) -> Int {
        let pixels = side * scale
        guard pixels.isFinite, pixels > 0 else { return 64 }
        return max(64, Int(pixels.rounded()))
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
        let resolvedURL: URL? = hasPublishedAsset ? resolver?(sticker.postMediaId) : nil
        // Un sticker qui n'adresse rien — ni lecteur asynchrone, ni adresse
        // résolue — ne lance aucune tâche : une cover ou un export sans
        // résolveur en créerait une par couche pour la voir sortir aussitôt.
        guard asynchronousReader != nil || resolvedURL != nil else { return }

        let keys = Self.bitmapCacheKeys(for: sticker)
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
            // **Les OCTETS d'abord, l'image ensuite** (#4925). `image(for:)` rend
            // UNE image : pour un GIF ou un APNG, l'animation est déjà perdue
            // quand on la reçoit. On demande donc les octets, et on ne retombe
            // sur le chemin habituel que s'ils ne portent pas d'animation.
            //
            // Le surcoût est borné par `AnimatedImageEligibility`, qui tranche
            // en lisant au plus 1 Ko : un sticker fixe paie une lecture de cache
            // déjà servie par la même pile (L1 NSCache, L2 disque), jamais un
            // second téléchargement.
            if let bytes = await loader.data(for: url.absoluteString),
               let animated = AnimatedImageDecoder.decode(bytes, maxPixelSize: self.decodePixelBudget) {
                guard !Task.isCancelled else { return }
                self.stampAnimated(animated)
                return
            }
            let loaded = await loader.image(for: url.absoluteString)
            guard !Task.isCancelled, let cgImage = CanvasImageOrientation.displayCGImage(loaded) else { return }
            self.stampBitmap(cgImage)
        }
    }

    @MainActor
    private func stampBitmap(_ bitmap: CGImage) {
        removeAnimation(forKey: Self.animatedContentsKey)
        playsAnimatedContents = false
        contents = bitmap
        contentsGravity = .resizeAspect
    }

    /// **Le plafond de décodage, en PIXELS**, dérivé de la couche elle-même
    /// plutôt que passé en paramètre : `configure` a déjà posé `bounds` et
    /// `contentsScale`, et la tâche de chargement s'exécute après. Décoder N
    /// images en pleine résolution pour les peindre dans un carré de 120 pt
    /// coûterait N bitmaps pour rien — sur un GIF de trente images, c'est la
    /// différence entre quelques mégaoctets et quelques dizaines.
    ///
    /// Le plancher à 64 px protège du cas dégénéré : une couche encore à
    /// `bounds.zero` rendrait un plafond de 0, et ImageIO refuserait toute
    /// vignette — un sticker qui n'apparaît jamais, sans erreur nulle part.
    @MainActor
    private var decodePixelBudget: Int {
        max(64, Int((bounds.width * contentsScale).rounded()))
    }

    /// La clé de l'animation de CONTENU. Nommée et unique : une couche
    /// reconfigurée doit pouvoir retirer l'ancienne, sinon deux cycles se
    /// superposeraient sur la même couche recyclée par `StoryRendererCache`.
    private static let animatedContentsKey = "meeshy.sticker.animatedContents"

    /// Cette couche joue-t-elle un CONTENU animé ? Lu par la queue de
    /// `configure` pour ne pas ré-armer la rasterisation par-dessus.
    private nonisolated(unsafe) var playsAnimatedContents = false

    /// **Jouer une image animée sur une COUCHE** (#4925).
    ///
    /// `UIImageView` anime tout seul une `UIImage.animatedImage` ; un `CALayer`,
    /// non — il faut lui poser une `CAKeyframeAnimation` sur `contents`. C'est
    /// la raison pour laquelle ce lot a DEUX moitiés qui ne se partagent que le
    /// décodeur : la scène ne passe par aucune vue SwiftUI.
    ///
    /// `calculationMode = .discrete` est la ligne qui décide : sans elle,
    /// Core Animation INTERPOLE entre deux images et rend un fondu enchaîné
    /// permanent au lieu d'un défilement d'images. Le défaut serait visible mais
    /// difficile à nommer — « le GIF est flou » plutôt que « les images se
    /// mélangent ».
    ///
    /// Le mouvement réduit fige sur la première image plutôt que de masquer :
    /// retirer l'image priverait le lecteur du contenu, la figer lui rend le
    /// contenu sans le mouvement.
    @MainActor
    private func stampAnimated(_ decoded: AnimatedImageDecoder.Decoded) {
        removeAnimation(forKey: Self.animatedContentsKey)
        playsAnimatedContents = false
        contents = decoded.frames.first
        contentsGravity = .resizeAspect

        guard !UIAccessibility.isReduceMotionEnabled, decoded.frames.count > 1 else { return }
        playsAnimatedContents = true

        // **La rasterisation doit tomber.** `configure` pose
        // `shouldRasterize = mode == .play && sticker.isStatic` : une couche
        // rasterisée peint son cache, donc la première image, pour toujours.
        // C'est le genre d'optimisation juste qui annule silencieusement la
        // feature qu'on vient d'ajouter.
        shouldRasterize = false

        let animation = CAKeyframeAnimation(keyPath: "contents")
        animation.values = decoded.frames
        animation.duration = decoded.duration
        animation.calculationMode = .discrete
        // `loopCount == 0` est la valeur par défaut de TOUS les formats et
        // signifie « à l'infini » — jamais « ne pas jouer ».
        animation.repeatCount = decoded.loopCount == 0 ? .infinity : Float(decoded.loopCount)
        animation.isRemovedOnCompletion = false
        animation.fillMode = .forwards
        add(animation, forKey: Self.animatedContentsKey)
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
