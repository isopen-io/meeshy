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

    public init(
        slide: Binding<StorySlide>,
        aspectRatio: CGFloat = CanvasGeometry.portraitRatio,
        cornerRadius: CGFloat = 22,
        onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
        onBackgroundTapped: (() -> Void)? = nil
    ) {
        self._slide = slide
        self.aspectRatio = aspectRatio
        self.cornerRadius = cornerRadius
        self.onItemTapped = onItemTapped
        self.onBackgroundTapped = onBackgroundTapped
    }

    public var body: some View {
        GeometryReader { proxy in
            // Bounds intrinsèques FIXES au ratio, centrés (« fit ») dans la
            // zone bornée que le parent nous donne — jamais l'écran entier.
            let fit = CanvasGeometry.aspectFitSize(in: proxy.size, ratio: aspectRatio)
            StoryComposerCanvasView(
                slide: $slide,
                onItemTapped: onItemTapped,
                onBackgroundTapped: onBackgroundTapped,
                canvasCornerRadius: cornerRadius
            )
            .frame(width: fit.width, height: fit.height)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }
}
