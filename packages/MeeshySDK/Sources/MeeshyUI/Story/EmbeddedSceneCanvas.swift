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

    /// **Ce qui se pose SUR la carte, dans SES bornes** (#4515).
    ///
    /// La carte est ajustée au ratio puis CENTRÉE dans la zone que le parent
    /// donne : son rectangle dessiné est presque toujours plus petit que son
    /// cadre de mise en page. Un `overlay` posé par l'appelant couvre le CADRE,
    /// pas la CARTE — et sur un fond paysage dans une zone haute, l'écart est
    /// énorme.
    ///
    /// Mesuré au simulateur le 2026-08-31 : un trait de l'outil dessin
    /// descendait bien SOUS la carte, sur le plateau. Tracé hors du canvas, il
    /// est perdu à la publication — le rendu final ne connaît que la carte.
    ///
    /// Ce slot existe pour que ce qui doit s'aligner sur la carte le fasse par
    /// CONSTRUCTION : seul ce corps connaît `fit`, et le lui faire calculer
    /// ailleurs redonnerait deux géométries à tenir d'accord.
    public var canvasOverlay: AnyView?

    /// **Les objets POSÉS sur la carte — un slot qui ne CAPTURE pas** (#4722).
    ///
    /// Distinct de `canvasOverlay`, et la différence n'est pas cosmétique :
    /// celui-là éteint le hit-test du canvas (`allowsHitTesting(canvasOverlay
    /// == nil)`), parce qu'un outil qui trace doit recevoir le doigt sur TOUTE
    /// la carte. Un objet posé dessus, lui, ne veut que sa propre surface — le
    /// texte et le sticker sous lui doivent rester saisissables.
    ///
    /// > Faire passer la puce audio par `canvasOverlay` aurait rendu la scène
    /// > entière inerte pour tous les autres objets. Deux slots parce que deux
    /// > rapports au doigt, pas parce que deux endroits où dessiner.
    ///
    /// Reçoit la taille de la CARTE (`fit`) : une puce porte des coordonnées
    /// normalisées `0…1` et ne peut se placer sans elle. Seul ce corps la
    /// connaît — la faire recalculer chez l'appelant redonnerait deux
    /// géométries à tenir d'accord, ce que la note de `canvasOverlay` dit déjà.
    ///
    /// Rendu SOUS `canvasOverlay` : pendant qu'un outil capture la carte, ce
    /// qui est posé dessus ne doit ni le masquer ni lui disputer le doigt.
    public var objectOverlay: ((CGSize) -> AnyView)?

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

    /// **Le canvas doit RETIRER son calque de dessin persisté pendant qu'une
    /// surface de dessin est active** (#4092).
    ///
    /// Sans ce drapeau, le trait s'affiche DEUX fois : une par le calque du
    /// canvas — projeté dans l'espace design —, une par la surface live, en
    /// coordonnées de bounds. Les deux ne tombent pas au même endroit : le
    /// symptôme est un dessin « écrit en double », décalé (défaut 2026-05-27,
    /// déjà payé par l'atelier).
    ///
    /// Il est REÇU, jamais déduit : la scène incrustée ne sait pas si son hôte
    /// a monté une surface de dessin par-dessus elle.
    public var isDrawingOverlayActive: Bool = false

    /// **L'édition de texte EN LIGNE, sur la scène incrustée** (#4401).
    ///
    /// `StoryCanvasUIView` sait éditer un texte à sa vraie place depuis
    /// toujours — c'est ce que l'atelier utilise. La scène incrustée ne
    /// transmettait aucune des trois entrées, si bien qu'un objet texte posé
    /// ici n'aurait eu aucun moyen d'être rempli : une coquille vide, donc
    /// invisible, donc un contrôle sans effet.
    public var editingTextId: String?
    public var onInlineTextChanged: ((String, String) -> Void)?
    public var onInlineTextEditEnded: ((String) -> Void)?

    /// **L'objet SÉLECTIONNÉ et son badge** (#4073, vue `1c`). La scène
    /// incrustée remontait `onItemTapped` sans que rien ne redescende désigner
    /// l'objet : « un seul objet à la fois » n'avait aucun témoin à l'écran.
    ///
    /// Paramètres OPAQUES — un id et une chaîne déjà composée. Quel objet est
    /// sélectionné et comment on le nomme restent des décisions app-side.
    public var selectedItemId: String?
    public var selectionBadge: String?

    /// **« Modifier », depuis l'appui long ou VoiceOver** (#4074, vue `1d`).
    ///
    /// La scène incrustée ne transmettait PAS ce rappel, si bien que
    /// `StoryCanvasContextAction.offered` recevait `hasEditor: false` et que le
    /// menu n'offrait que deux actions sur quatre. Le porteur du contrat, lui,
    /// l'acceptait déjà avec un défaut `nil` — rien n'était à écrire côté
    /// canvas, seulement à brancher.
    ///
    /// `editableKinds` dit à quels objets l'hôte sait répondre : la scène
    /// incrustée sert `[.text]` tant qu'aucun éditeur média n'y est monté, pour
    /// que « Modifier » ne soit jamais offert sur un objet qu'elle ignore.
    public var onItemDoubleTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)?
    public var editableKinds: Set<StoryCanvasUIView.CanvasItemKind>

    public init(
        slide: Binding<StorySlide>,
        aspectRatio: CGFloat = CanvasGeometry.portraitRatio,
        cornerRadius: CGFloat = 22,
        canvasOverlay: AnyView? = nil,
        objectOverlay: ((CGSize) -> AnyView)? = nil,
        onItemTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
        onItemDoubleTapped: ((String, StoryCanvasUIView.CanvasItemKind) -> Void)? = nil,
        editableKinds: Set<StoryCanvasUIView.CanvasItemKind> = [.text, .media],
        onBackgroundTapped: (() -> Void)? = nil,
        loadedImages: [String: UIImage] = [:],
        loadedImagesVersion: UInt64 = 0,
        isDrawingOverlayActive: Bool = false,
        editingTextId: String? = nil,
        onInlineTextChanged: ((String, String) -> Void)? = nil,
        onInlineTextEditEnded: ((String) -> Void)? = nil,
        selectedItemId: String? = nil,
        selectionBadge: String? = nil,
        referenceViewport: CGSize = CGSize(width: 402, height: 874)
    ) {
        self._slide = slide
        self.aspectRatio = aspectRatio
        self.cornerRadius = cornerRadius
        self.canvasOverlay = canvasOverlay
        self.objectOverlay = objectOverlay
        self.onItemTapped = onItemTapped
        self.onItemDoubleTapped = onItemDoubleTapped
        self.editableKinds = editableKinds
        self.onBackgroundTapped = onBackgroundTapped
        self.loadedImages = loadedImages
        self.loadedImagesVersion = loadedImagesVersion
        self.isDrawingOverlayActive = isDrawingOverlayActive
        self.editingTextId = editingTextId
        self.onInlineTextChanged = onInlineTextChanged
        self.onInlineTextEditEnded = onInlineTextEditEnded
        self.selectedItemId = selectedItemId
        self.selectionBadge = selectionBadge
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
                onItemDoubleTapped: onItemDoubleTapped,
                editableKinds: editableKinds,
                editingTextId: editingTextId,
                onInlineTextChanged: onInlineTextChanged,
                onInlineTextEditEnded: onInlineTextEditEnded,
                selectedItemId: selectedItemId,
                selectionBadge: selectionBadge,
                onBackgroundTapped: onBackgroundTapped,
                isDrawingOverlayActive: isDrawingOverlayActive,
                loadedImages: loadedImages,
                loadedImagesVersion: loadedImagesVersion,
                // Rayon compensé par l'échelle : la carte est rendue à sa taille
                // de référence PUIS réduite, donc un rayon UIKit de
                // `cornerRadius / scale` atterrit bien à `cornerRadius` à l'écran
                // (même compensation que `canvasComposerLayer`).
                canvasCornerRadius: scale > 0 ? cornerRadius / scale : 0
            )
            // **Le canvas cesse de recevoir les touches pendant qu'un calque
            // les capture** — sinon le doigt qui trace déplacerait aussi
            // l'objet sous lui : deux gestes pour un seul mouvement.
            //
            // La garde vit ICI et non chez l'appelant, et c'est le correctif :
            // posée dehors, elle couvrait le calque LUI-MÊME depuis qu'il est
            // borné à la carte, et le dessin ne recevait plus rien. Mesuré à
            // l'écran — aucun trait, sur une surface pourtant active.
            .allowsHitTesting(canvasOverlay == nil)
            // **Le badge de sélection se DIT** (2026-09-02).
            //
            // Il est peint DANS le canvas UIKit — `StoryComposerCanvasView` le
            // rend en couche, au-dessus de l'objet encadré. Mesuré à l'écran :
            // « TEXT · FG PLANE · z 1 » est parfaitement lisible, et
            // TOTALEMENT absent de l'arbre d'accessibilité.
            //
            // > Un texte peint par UIKit sous un hôte SwiftUI ne rejoint aucun
            // > arbre : il n'est ni un `Text`, ni un élément d'accessibilité,
            // > et rien ne rougit. La seule façon de s'en apercevoir est de
            // > comparer ce que l'ŒIL reçoit à ce que `describe-all` rend —
            // > deux relevés du même écran qui ne disent pas la même chose.
            //
            // Ce que son absence coûtait : le badge est la SEULE chose qui dise
            // quel objet est sélectionné. Sans lui, un lecteur d'écran entend
            // « STYLE · CLASSIC », « SIZE 96 » — des réglages sans sujet. Il
            // règle la taille de quelque chose qu'on ne lui a pas nommé.
            //
            // La valeur est portée par `accessibilityValue` et non par un
            // `Text` caché : le badge n'est pas un contrôle, c'est l'ÉTAT du
            // canvas. VoiceOver l'annonce alors avec l'élément qu'il qualifie,
            // au lieu d'en faire une halte de plus dans le balayage.
            .accessibilityElement(children: .contain)
            .accessibilityValue(selectionBadge.map(Text.init) ?? Text(verbatim: ""))
            .frame(width: reference.width, height: reference.height)
            .scaleEffect(scale, anchor: .center)
            .frame(width: fit.width, height: fit.height)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            // Le calque de l'appelant est BORNÉ à la carte — même taille, même
            // découpe. C'est ce qui aligne l'outil de dessin sur le canvas
            // final au lieu du cadre de mise en page (#4515).
            // Ce qui est POSÉ sur la carte, sous l'outil qui la capture — même
            // découpe, même taille, mais le canvas garde ses touches.
            .overlay {
                if let objectOverlay {
                    objectOverlay(fit)
                        .frame(width: fit.width, height: fit.height)
                        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                }
            }
            .overlay {
                if let canvasOverlay {
                    canvasOverlay
                        .frame(width: fit.width, height: fit.height)
                        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }
}
