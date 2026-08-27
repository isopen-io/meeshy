import SwiftUI
import MeeshySDK

/// **Le canvas de scène EMBARQUABLE — Phase 1 du composer unifié (#3939).**
///
/// Rend le canvas de story ÉDITABLE (`StoryCanvasUIView`, via
/// `StoryComposerCanvasView`) à l'intérieur d'un **cadre BORNÉ arrondi**
/// fourni par le parent — SANS le shell plein écran de `StoryComposerView`
/// (pas de `.ignoresSafeArea()`, pas de `.statusBarHidden()`, pas de
/// revendication de la safe-area). C'est le building block qui permettra à la
/// scène 9:16 de vivre EN HAUT de l'écran document, à taille variable, au lieu
/// d'un atelier plein écran distinct.
///
/// **SDK-pur (test du grain).** Paramètres opaques (`slide` en `@Binding`,
/// ratio, rayon), aucun singleton app, aucune décision « quand faire X » :
/// l'orchestration (quand le monter, comment le cadrer selon l'outil actif)
/// reste app-side. Additif — monté par personne pour l'instant : zéro
/// régression sur l'atelier existant.
///
/// **On n'anime JAMAIS la frame** du canvas (sinon `layoutSubviews →
/// rebuildLayers()` à chaque frame = tempête perf, cf. `canvasComposerLayer`).
/// Les bounds sont FIXES, cadrés au ratio par `CanvasGeometry.aspectFitSize` ;
/// un placement animé (carding) se fera plus tard par `scaleEffect`/`offset`
/// sur le CONTENEUR, jamais sur la frame intrinsèque.
///
/// La rondeur vit sur le layer UIKit (`canvasCornerRadius`) — un `.clipShape`
/// SwiftUI seul ne masque pas l'arbre CALayer embarqué ; les deux sont posés
/// au même rayon pour une carte nette (contenu ET letterbox arrondis).
public struct EmbeddedSceneCanvas: View {
    /// La slide éditée. Le canvas remonte ses mutations (déplacement d'objet,
    /// édition de texte inline) par ce `@Binding` — la source de vérité reste
    /// chez l'hôte.
    @Binding public var slide: StorySlide

    /// Ratio LARGEUR / HAUTEUR de la carte. 9:16 par défaut
    /// (`CanvasGeometry.portraitRatio` = 0,5625) ; un fond paysage passera
    /// `CanvasGeometry.landscapeRatio` (16:9) — même source de vérité que
    /// l'atelier et le reader, donc bounds identiques (pas de dérive dessin).
    public var aspectRatio: CGFloat

    /// Rayon de la carte, en points ÉCRAN. Posé sur le layer UIKit ET en
    /// `.clipShape`.
    public var cornerRadius: CGFloat

    /// Notifié quand l'utilisateur tape un objet de la scène (texte, média,
    /// sticker, lieu) — transmis tel quel à `StoryComposerCanvasView`.
    ///
    /// **Lot 3A du composer unifié (#4035).** Avant ce champ, la scène
    /// incrustée ne transmettait AUCUN rappel de sélection : taper un objet
    /// ne remontait rien à l'hôte, qui n'avait donc aucun moyen de faire
    /// paraître ses contrôles. Paramètre opaque (une closure, pas une
    /// décision) — SDK-pur : quel contrôle montrer pour quel objet reste une
    /// décision app-side.
    public var onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?

    /// Notifié quand l'utilisateur tape le FOND de la scène (hors de tout
    /// objet) — l'hôte l'utilise typiquement pour effacer sa sélection.
    public var onBackgroundTapped: (() -> Void)?

    /// **Les bitmaps du composer, keyés par id d'objet média (#4038).**
    ///
    /// Sans eux, un fond MÉDIA ne se stampe pas : `StoryCanvasUIView` résout ses
    /// images par `ComposerImageCacheReader`, alimenté par ce cache. La Phase 2
    /// n'a jamais montré que des fonds de COULEUR — le manque n'a donc mordu
    /// qu'au premier post à photos, où la carte se peignait au tiers de sa
    /// taille, calée en haut à gauche.
    public var loadedImages: [String: UIImage]

    /// Cookie monotone : les dictionnaires d'`UIImage` ne sont pas `Equatable`,
    /// donc c'est LUI qui dit au canvas qu'un bitmap a changé. Le transmettre
    /// sans le cookie laisserait le canvas sur sa version périmée.
    public var loadedImagesVersion: UInt64

    public init(
        slide: Binding<StorySlide>,
        aspectRatio: CGFloat = CanvasGeometry.portraitRatio,
        cornerRadius: CGFloat = 22,
        onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
        onBackgroundTapped: (() -> Void)? = nil,
        loadedImages: [String: UIImage] = [:],
        loadedImagesVersion: UInt64 = 0,
        referenceViewport: CGSize = CGSize(width: 402, height: 874)
    ) {
        self._slide = slide
        self.aspectRatio = aspectRatio
        self.cornerRadius = cornerRadius
        self.onItemTapped = onItemTapped
        self.onBackgroundTapped = onBackgroundTapped
        self.loadedImages = loadedImages
        self.loadedImagesVersion = loadedImagesVersion
        self.referenceViewport = referenceViewport
    }

    /// **Taille de RÉFÉRENCE du canvas, avant réduction (#4038).**
    ///
    /// Le canvas est monté à CETTE taille puis ramené à la carte par
    /// `scaleEffect` — jamais monté petit. C'est ce que fait l'atelier plein
    /// écran (`canvasComposerLayer` : `canvasCore(...).frame(fit).scaleEffect(...)`),
    /// et la raison est mesurable : monté directement à la taille de la carte,
    /// un fond MÉDIA se peignait au tiers de sa taille, calé en haut à gauche.
    /// La Phase 2 n'ayant jamais montré que des fonds de COULEUR — que le layer
    /// étire quelles que soient ses bounds — le défaut a attendu le premier post
    /// à photos pour se voir.
    ///
    /// Défaut : un viewport de téléphone, celui auquel l'atelier monte son
    /// propre canvas (mesuré 392×696 sur iPhone 16 Pro).
    public var referenceViewport: CGSize

    public var body: some View {
        GeometryReader { proxy in
            // Bounds intrinsèques FIXES au ratio, centrés (« fit ») dans la
            // zone bornée que le parent nous donne — jamais l'écran entier.
            let fit = CanvasGeometry.aspectFitSize(in: proxy.size, ratio: aspectRatio)
            let reference = CanvasGeometry.aspectFitSize(in: referenceViewport, ratio: aspectRatio)
            let scale = reference.width > 0 ? fit.width / reference.width : 1
            StoryComposerCanvasView(
                slide: $slide,
                onItemTapped: onItemTapped,
                onBackgroundTapped: onBackgroundTapped,
                loadedImages: loadedImages,
                loadedImagesVersion: loadedImagesVersion,
                // Rayon compensé par l'échelle : la carte est rendue à sa taille
                // de référence PUIS réduite, donc un rayon UIKit de
                // `cornerRadius / scale` atterrit bien à `cornerRadius` à l'écran
                // (même compensation que `canvasComposerLayer`).
                canvasCornerRadius: scale > 0 ? cornerRadius / scale : 0
            )
            .frame(width: reference.width, height: reference.height)
            .scaleEffect(scale, anchor: .center)
            .frame(width: fit.width, height: fit.height)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }
}
