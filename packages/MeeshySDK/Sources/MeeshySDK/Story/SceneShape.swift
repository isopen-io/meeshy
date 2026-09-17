import CoreGraphics
import Foundation

/// **Une scène a UNE forme — 9:16 — et le plein écran a DEUX états**
/// (décision porteur du 2026-09-17 sur #6896, lot #6904).
///
/// > « 9:16 figé, le fond lorsqu'on doit rogner est en 9:16 si des éléments en
/// > plus de l'image/vidéo sortent de la zone de ce média. »
///
/// ## Ce que cette loi ferme
///
/// L'audit du 2026-09-17 a compté sur `dev` : **onze montages** du player,
/// **quatorze fichiers de loi** dont douze nés en dix jours, et **trois lois de
/// ratio qui ne s'accordent pas** — `SceneFullscreenFraming.ratio` (le
/// porteur), `SceneFraming.presentationAspect` (l'image quand la scène n'est
/// qu'une image), `readerCanvasRatio` (portrait/paysage discrétisé). Le même
/// document avait trois formes selon la surface : 1,3 rognée dans le fil, 4:1
/// entière au détail, 16:9 rognée dans le lecteur.
///
/// Le moteur (`StoryCanvasUIView`) ne connaît aucun rapport : il peint dans les
/// bounds qu'on lui donne. **La forme était donc décidée par chaque hôte** — et
/// onze hôtes ont décidé onze fois.
///
/// ## Les trois règles de forme
///
/// 1. **La scène est TOUJOURS 9:16** (`aspect`). Gabarit de composition ET de
///    restitution. Personne ne la recalcule — ni depuis le média, ni depuis
///    `carrierAspect`, qui redevient ce que le contrat S8 en dit : une mémoire
///    d'ÉDITION pour la migration v1, que plus aucun lecteur ne consulte.
/// 2. **Le média se pose dans le 9:16 sans être rogné** (`mediaBand`). Un
///    panorama occupe une bande au milieu ; un portrait remplit la hauteur ;
///    un média plus vertical encore que la scène occupe une colonne. Le fond
///    de scène habille le reste.
/// 3. **Ce qu'on MONTRE est BINAIRE** (`frame`) : rien ne sort de la zone du
///    média ⇒ on peut resserrer sur elle ; quelque chose en sort ⇒ les bandes
///    sont une surface composée, on garde le 9:16 entier avec son fond. Rien
///    n'est jamais rogné.
///
/// Le troisième point rend un type SOMME et non un rapport flottant : un cadre
/// intermédiaire — l'union que `SceneFraming.focus` calculait — est la
/// quatrième forme possible d'un même document, et c'est précisément ce que
/// onze hôtes ne peuvent pas garantir ensemble.
///
/// ## Les deux plein écrans
///
/// - **Cadré** (`Fullscreen.carded`) : la scène AJUSTÉE, arrondie, centrée, sur
///   un fond que l'hôte choisit (noir, couleur dominante du ThumbHash, ou le
///   ThumbHash lui-même comme le lecteur de story). Le chrome vit sur le
///   PLATEAU (#6760), et **c'est le plateau qui peint le hors-champ**.
/// - **Immersif** (`Fullscreen.immersive`) : la scène occupe le viewport
///   ENTIER, son contenu visible et centré. Il ne reste rien à peindre autour —
///   donc **personne ne le peint**, et la troisième couche de #6806 disparaît
///   par construction plutôt que par consigne.
///
/// > **Un seul acteur peint le hors-champ.** Le défaut que l'audit nomme
/// > « cause 5 » n'était pas un oubli d'hôte : c'était l'absence d'une loi
/// > disant QUI peint autour du média. `offscreenPainter` la dit, et son
/// > `.none` n'est pas un trou — c'est la réponse de l'immersif.
///
/// ## Où elle vit, et pourquoi
///
/// Dans `MeeshySDK` et non `MeeshyUI`, pour la raison que `StoryLetterboxFill`
/// écrit déjà : `MeeshyUI` compile sous `defaultIsolation: MainActor`, donc la
/// conformance `Equatable` d'un type qui y naît est isolée au `MainActor` et
/// une suite non-`@MainActor` ne peut plus comparer ses valeurs. Le placement
/// suit d'ailleurs le tableau du `CLAUDE.md` du SDK : un moteur de règles sans
/// état, à paramètres opaques, est un atome — donc du SDK core.
public enum SceneShape {

    // MARK: - 1 · La scène est toujours 9:16

    /// **Le rapport largeur / hauteur d'une scène. LE site unique.**
    ///
    /// `SceneFraming.sceneAspect`, `CanvasGeometry.portraitRatio` et
    /// `StoryCanvasAspect.portrait.ratio` en sont des projections ; la garde de
    /// source `SceneShapeSourceGuardTests` interdit qu'une quatrième écriture
    /// apparaisse.
    public nonisolated static let aspect: CGFloat = 9.0 / 16.0

    /// **La forme d'une scène — quelle que soit la scène.**
    ///
    /// La fonction existe bien qu'elle ignore son paramètre, et c'est tout son
    /// objet : un hôte qui se demande « quelle forme a CETTE scène ? » trouve
    /// ici la réponse, au lieu de la chercher dans `carrierAspect` ou dans le
    /// rapport du média. Les deux ont produit, chacun à leur tour, une forme
    /// par surface.
    public nonisolated static func aspect(of scene: SceneV3) -> CGFloat { aspect }

    // MARK: - 2 · La zone du média, posée en FIT

    /// **La zone qu'occupe le média de fond dans le 9:16, posé sans rognage**,
    /// en fractions de la scène.
    ///
    /// Un média plus LARGE que la scène est mis en boîte aux lettres : pleine
    /// largeur, fraction de hauteur, centré. Un média plus ÉTROIT occupe une
    /// colonne : pleine hauteur, fraction de largeur, centrée. Un média au
    /// gabarit couvre tout.
    ///
    /// La colonne n'est pas une subtilité : « quelque chose déborde-t-il de la
    /// zone ? » se pose dans les DEUX dimensions, et une règle qui ne connaît
    /// que la hauteur laisse passer un sticker posé à gauche d'un média 1:4.
    public nonisolated static func mediaBand(backgroundAspect: CGFloat) -> CGRect {
        guard backgroundAspect.isFinite, backgroundAspect > 0 else { return unitRect }
        if backgroundAspect > aspect {
            let hauteur = aspect / backgroundAspect
            return CGRect(x: 0, y: (1 - hauteur) / 2, width: 1, height: hauteur)
        }
        if backgroundAspect < aspect {
            let largeur = backgroundAspect / aspect
            return CGRect(x: (1 - largeur) / 2, y: 0, width: largeur, height: 1)
        }
        return unitRect
    }

    /// **La zone du média de CETTE scène — et la loi ne devine rien.**
    ///
    /// `nil` quand la scène ne porte pas de fond média, ou qu'aucun rapport
    /// n'est connu : ni déclaré par l'objet (`payload.aspectRatio`, ce que pose
    /// le composer), ni fourni par l'appelant.
    ///
    /// C'est le cas de la forme PASSERELLE — un `plane: bg` avec le seul
    /// `payload.mediaId`, sans mode d'ajustement ni rapport (#6894, #6895).
    /// L'appelant qui tient le post connaît, lui, `media.width / media.height` :
    /// la loi le lui DEMANDE plutôt que d'inventer une forme que rien ne mesure.
    ///
    /// **Un fond posé en REMPLISSAGE explicite (`transform.videoFitMode ==
    /// "fill"`, le double-tap fond) n'a pas de bande** — il couvre déjà toute
    /// la scène, rognant ce qui dépasse plutôt que de laisser du fond visible.
    /// Calculer une bande depuis son seul `aspectRatio` déclaré y montrerait
    /// une zone que le renderer ne respecte pas : un hôte qui s'y resserrerait
    /// rognerait un média qui, à l'écran, remplit le 9:16 en entier. `"fit"`
    /// (le défaut du composer, `StoryBackgroundFraming.posedFitMode`) et
    /// l'absence de valeur gardent le calcul habituel — seul le REMPLISSAGE
    /// explicite change la réponse.
    public nonisolated static func mediaBand(scene: SceneV3,
                                             backgroundAspect: CGFloat? = nil) -> CGRect? {
        guard let rapport = resolvedBackgroundAspect(scene: scene, override: backgroundAspect)
        else { return nil }
        if declaredFitMode(in: scene) == StoryBackgroundFraming.fill { return unitRect }
        return mediaBand(backgroundAspect: rapport)
    }

    /// **Le cadrage qu'un fond a REÇU** (`transform.videoFitMode`), tel que le
    /// composer ou la passerelle l'a posé — `nil` si rien ne le dit.
    ///
    /// Le champ voyage sur l'objet qui porte l'adresse du média (forme
    /// passerelle, un seul objet) OU sur le porteur `bg` réservé qui
    /// l'accompagne (forme composer, deux objets — `CanvasV3Migration.
    /// migratedScene`) : la loi regarde donc CHAQUE objet de fond de la scène,
    /// jamais seulement celui que `backgroundMedia` élit pour ses pixels.
    nonisolated static func declaredFitMode(in scene: SceneV3) -> String? {
        for objet in scene.objects where isBackground(objet) {
            if case .object(let transform)? = objet.payload["transform"],
               case .string(let mode)? = transform["videoFitMode"] {
                return mode
            }
        }
        return nil
    }

    // MARK: - 3 · Ce qu'on montre — binaire

    /// **Le cadre à montrer : la zone du média, ou la scène entière.**
    ///
    /// Deux valeurs, jamais un rapport intermédiaire — c'est ce qui rend la
    /// forme garantissable sur onze hôtes.
    public enum Frame: Equatable, Sendable {
        /// On peut resserrer sur la zone du média : rien d'autre n'en sort.
        case mediaBand(CGRect)
        /// Le 9:16 entier, avec son fond : quelque chose déborde de la zone,
        /// ou la forme du média n'est pas connue.
        case wholeScene

        /// Le rectangle, en fractions de la scène — la projection explicite
        /// qu'un hôte applique.
        public var rect: CGRect {
            switch self {
            case .mediaBand(let zone): return zone
            case .wholeScene: return SceneShape.unitRect
            }
        }

        /// Y a-t-il quelque chose à resserrer ? Une zone qui couvre déjà toute
        /// la scène n'en est pas un.
        public var tightensAnything: Bool {
            switch self {
            case .mediaBand(let zone): return zone != SceneShape.unitRect
            case .wholeScene: return false
            }
        }
    }

    /// **Quelque chose déborde-t-il de la zone du média ?**
    ///
    /// Elle échoue FERMÉE : sans rapport connu, on montre le 9:16 entier.
    /// Montrer trop coûte du vide autour du contenu ; montrer trop peu coupe ce
    /// que l'auteur a posé.
    public nonisolated static func frame(scene: SceneV3,
                                         backgroundAspect: CGFloat? = nil) -> Frame {
        guard let fond = backgroundMedia(in: scene),
              let zone = mediaBand(scene: scene, backgroundAspect: backgroundAspect)
        else { return .wholeScene }
        let deborde = scene.objects.contains { objet in
            objet.id != fond.id && paintsPixels(objet) && !contains(zone, anchorBox(of: objet))
        }
        return deborde ? .wholeScene : .mediaBand(zone)
    }

    // MARK: - 4 · Les deux plein écrans

    /// Ce sur quoi la scène cadrée se pose. L'hôte choisit ; la loi ne préjuge
    /// pas d'une couleur qu'elle ne sait pas calculer.
    public enum Backdrop: Equatable, Sendable {
        case black
        /// La couleur dominante du ThumbHash — préférence du porteur.
        case thumbHashDominantColor
        /// Le ThumbHash lui-même, comme le fait le lecteur de story.
        case thumbHash
    }

    /// **Qui peint le hors-champ — un seul acteur, jamais deux.**
    public enum OffscreenPainter: Equatable, Sendable {
        /// Le plateau, et lui seul. Le canvas ne peint pas par-dessus.
        case stage
        /// Personne : il ne reste rien à peindre.
        case none
    }

    /// Les deux états du plein écran.
    public enum Fullscreen: Equatable, Sendable {
        /// La scène en grand, arrondie, avec contrôleurs et détails.
        case carded(Backdrop)
        /// Rien que le contenu.
        case immersive
    }

    /// Ce qu'un état de plein écran prescrit dans un viewport donné.
    public struct Layout: Equatable, Sendable {
        /// Le cadre de la scène dans le repère du viewport. En immersif il
        /// DÉBORDE du viewport — c'est ce que « occuper le viewport entier »
        /// veut dire pour une forme figée.
        public let sceneFrame: CGRect
        public let offscreenPainter: OffscreenPainter
        /// `nil` en immersif : il n'y a pas de fond à choisir.
        public let backdrop: Backdrop?
        public let cornerRadius: CGFloat
    }

    /// L'arrondi de la scène cadrée. Zéro en immersif — un coin arrondi sur un
    /// bord d'écran laisserait voir ce que personne ne peint.
    public nonisolated static let cardedCornerRadius: CGFloat = 20

    /// **Le cadre de la scène dans un viewport, et qui peint autour.**
    ///
    /// Cadré : la scène est AJUSTÉE (elle tient entière, centrée) et le plateau
    /// habille ce qui reste. Immersif : la scène est ÉTENDUE jusqu'à couvrir le
    /// viewport (centrée, donc son contenu visible reste au milieu) et il ne
    /// reste rien à habiller.
    public nonisolated static func layout(_ mode: Fullscreen, in viewport: CGSize) -> Layout {
        guard viewport.width > 0, viewport.height > 0 else {
            return Layout(sceneFrame: .zero,
                          offscreenPainter: mode == .immersive ? .none : .stage,
                          backdrop: mode.backdrop,
                          cornerRadius: mode == .immersive ? 0 : cardedCornerRadius)
        }
        let auGabarit = viewport.height * aspect
        let largeur: CGFloat
        switch mode {
        case .carded: largeur = min(viewport.width, auGabarit)
        case .immersive: largeur = max(viewport.width, auGabarit)
        }
        let hauteur = largeur / aspect
        let cadre = CGRect(x: (viewport.width - largeur) / 2,
                           y: (viewport.height - hauteur) / 2,
                           width: largeur, height: hauteur)
        return Layout(sceneFrame: cadre,
                      offscreenPainter: mode == .immersive ? .none : .stage,
                      backdrop: mode.backdrop,
                      cornerRadius: mode == .immersive ? 0 : cardedCornerRadius)
    }

    // MARK: - Ce que la loi lit d'une scène

    /// **Le média de FOND — et il ne se reconnaît PAS à son plan.**
    ///
    /// Mesuré sur le fil de production : un fond réel arrive en
    /// `plane: "content"` avec `isBackground: true`. Le plan `bg` reste au
    /// contrat, et `CanvasV3.migratedScene` émet en tête de scène un PORTEUR
    /// `bg` sans adresse ni forme dès que le fond a un cadrage. Élire le
    /// premier objet de fond élirait ce porteur : on élit donc celui qui porte
    /// l'IMAGE, et le porteur ne reste le fond qu'à défaut (il porte alors la
    /// couleur).
    public nonisolated static func backgroundMedia(in scene: SceneV3) -> ObjectV3? {
        scene.objects.first { isBackground($0) && carriesPicture($0) }
            ?? scene.objects.first(where: isBackground)
    }

    public nonisolated static func isBackground(_ object: ObjectV3) -> Bool {
        guard object.kind == .media else { return false }
        if object.plane == .bg { return true }
        if case .bool(true)? = object.payload["isBackground"] { return true }
        return false
    }

    /// Un objet porte-t-il des pixels à lui — une adresse, une identité de
    /// média, ou une forme déclarée ? Le porteur `bg` d'une couleur n'en porte
    /// aucun. Les deux orthographes d'une référence comptent également (#6894) :
    /// `ObjectV3.mediaReference` en est le site unique.
    public nonisolated static func carriesPicture(_ object: ObjectV3) -> Bool {
        if case .string(let url)? = object.payload["mediaURL"], !url.isEmpty { return true }
        if object.mediaReference != nil { return true }
        return declaredAspect(of: object) != nil
    }

    /// **Le rapport DÉCLARÉ par l'objet lui-même** (`payload.aspectRatio`, ce
    /// que pose le composer). C'est ce qui garde la loi pure et immédiate : un
    /// hôte cadre avant qu'aucune image ne soit téléchargée, donc sans saut de
    /// mise en page à l'arrivée du média.
    public nonisolated static func declaredAspect(of object: ObjectV3) -> CGFloat? {
        if case .number(let valeur)? = object.payload["aspectRatio"], valeur > 0 {
            return CGFloat(valeur)
        }
        return nil
    }

    /// Le rapport du fond de cette scène, tel qu'elle le déclare.
    public nonisolated static func backgroundAspect(in scene: SceneV3) -> CGFloat? {
        backgroundMedia(in: scene).flatMap(declaredAspect)
    }

    /// **Un objet qui ne produit aucun pixel ne fait rien déborder.** Un son de
    /// fond et une mention voyagent avec la scène sans s'y peindre ; les
    /// compter élargirait le cadre au nom de ce que personne ne voit.
    public nonisolated static func paintsPixels(_ object: ObjectV3) -> Bool {
        switch object.kind {
        case .audio, .mention, .reserved: return false
        case .text, .sticker, .place, .drawing: return true
        case .media: return !isBackground(object) || carriesPicture(object)
        }
    }

    /// **La boîte d'un objet — DEVINÉE, et dite franchement.**
    ///
    /// Un objet de canvas porte une ANCRE, pas une taille : sa taille rendue
    /// n'est connue qu'au rendu. La boîte est donc l'ancre élargie d'une marge
    /// qui couvre un objet de taille ordinaire, modulée par l'échelle et bornée
    /// pour qu'un facteur extrême ne fasse pas couvrir la scène à un seul
    /// objet.
    ///
    /// Se tromper d'un côté coûte un resserrement qu'on n'a pas pris ; de
    /// l'autre, un texte coupé. La marge est donc GÉNÉREUSE : la loi préfère
    /// montrer le 9:16 entier.
    public nonisolated static let objectPadding: CGFloat = 0.16

    public nonisolated static func anchorBox(of object: ObjectV3) -> CGRect {
        let centre: CGPoint
        switch object.anchor {
        case .free(let x, let y):
            centre = CGPoint(x: CGFloat(x), y: CGFloat(y))
        case .band(let edge):
            centre = CGPoint(x: 0.5, y: edge == .top ? bandTopY : bandBottomY)
        }
        let facteur = min(max(CGFloat(object.transform.scale), 0.5), 3)
        let marge = objectPadding * facteur
        return CGRect(x: centre.x - marge, y: centre.y - marge,
                      width: marge * 2, height: marge * 2)
    }

    /// Position conventionnelle d'un objet ancré à une BANDE — « en haut » et
    /// « en bas », avec la marge que le reader applique.
    public nonisolated static let bandTopY: CGFloat = 0.12
    public nonisolated static let bandBottomY: CGFloat = 0.88

    // MARK: - Pièces internes

    nonisolated static let unitRect = CGRect(x: 0, y: 0, width: 1, height: 1)

    /// La tolérance du test d'inclusion : une boîte qui affleure le bord de la
    /// zone au millième près n'en sort pas — sinon l'arrondi d'un `.fit`
    /// déciderait à la place de la règle.
    nonisolated static let containmentTolerance: CGFloat = 0.001

    nonisolated static func contains(_ zone: CGRect, _ boite: CGRect) -> Bool {
        boite.minX >= zone.minX - containmentTolerance
            && boite.maxX <= zone.maxX + containmentTolerance
            && boite.minY >= zone.minY - containmentTolerance
            && boite.maxY <= zone.maxY + containmentTolerance
    }

    nonisolated static func resolvedBackgroundAspect(scene: SceneV3,
                                                     override: CGFloat?) -> CGFloat? {
        guard backgroundMedia(in: scene) != nil else { return nil }
        guard let rapport = override ?? backgroundAspect(in: scene),
              rapport.isFinite, rapport > 0 else { return nil }
        return rapport
    }
}

private extension SceneShape.Fullscreen {
    var backdrop: SceneShape.Backdrop? {
        switch self {
        case .carded(let fond): return fond
        case .immersive: return nil
        }
    }
}
