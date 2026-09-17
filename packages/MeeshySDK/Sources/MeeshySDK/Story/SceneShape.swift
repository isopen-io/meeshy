import CoreGraphics
import Foundation

/// **Une scène a UNE forme — 9:16 — et UNE carte** (décision porteur du
/// 2026-09-17 sur #6896, lot #6904 ; les deux plein écrans ramenés à une seule
/// carte par la directive du même jour, 3e message).
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
/// ## Le plein écran : UNE carte, deux viewports
///
/// La loi a porté DEUX états jusqu'au 2026-09-17 — cadré (scène ajustée, fond
/// autour) et immersif (scène étendue, RIEN autour). La directive porteur du
/// même jour les ramène à un seul :
///
/// > « Ce que je vois dans les stories me plaît ! Il faut reproduire exactement
/// > la même chose partout ! » puis « On préserve le même fond que pour la
/// > story ! »
///
/// Il n'y a donc qu'une carte : la scène 9:16 AJUSTÉE, centrée, arrondie au
/// rayon de la story, sur le fond de la story (`cardedBackdrop`). Ce qui
/// distingue les surfaces n'est pas une forme, c'est le VIEWPORT qu'elles
/// passent — la zone libre du plateau pour un cadré, l'écran ENTIER pour un
/// immersif (aucun couloir, chrome masqué).
///
/// > **`Fullscreen` et `OffscreenPainter` ont disparu avec le second état.**
/// > L'immersif était la seule surface qui ROGNAIT une scène, et son `.none`
/// > la seule raison d'avoir une loi du peintre. Un seul état ⇒ un seul
/// > peintre ⇒ il se dit par la STRUCTURE (`SceneCard` peint le fond dans la
/// > carte), pas par un champ constant que plus personne ne peut contredire.
///
/// ## Ce que la loi FERME, ce qu'elle DÉCLARE, ce qui reste DEHORS
///
/// Mesuré le 2026-09-17, tour 3 bis du lot #6904 — l'état précédent de ce
/// paragraphe (« AUCUN hôte ne les appelle encore ») était vrai au tour 2 et a
/// cessé de l'être au tour 3 :
///
/// | règle | câblée en production ? |
/// |---|---|
/// | 1 · `aspect` (toujours 9:16) | OUI, sur tous les hôtes du player (garde de source) |
/// | 4 · `layout` / `Backdrop` / `cardedBackdrop` / `cardedCornerRadius` | OUI — les QUATRE surfaces plein écran, par `SceneCard` |
/// | 2 · `mediaBand` | non — déclarée et testée en isolation |
/// | 3 · `frame` (le cadre binaire) | non — déclarée et testée en isolation |
///
/// Les quatre surfaces plein écran câblées : le plein écran **cadré** d'un
/// post et son **immersif** (`GallerySceneStage` → `GalleryScenePage`), le
/// **lecteur de stories** (`StoryCardView` → `readerCard`) et le **réel**
/// composé (`ReelSceneView`). Le témoin
/// `SceneShapeSourceGuardTests.test_lesSurfacesPleinEcran_montentLaCarteDeScene`
/// les nomme une par une : c'est la seule forme qui empêche une cinquième
/// surface de naître muette.
///
/// **Ce qui reste DEHORS, et par décision du porteur du 2026-09-17** : la
/// CARTE DU FIL et les pages de carrousel gardent leur cadrage d'APERÇU
/// (`SceneFraming.focus`, union des objets, plafond 1,4 — #6697/#6708). Ce
/// n'est pas une dette : un aperçu n'est pas un plein écran, et les y faire
/// entrer romprait des surfaces mesurées au simulateur.
///
/// **Ce qui reste déclaré sans appelant, et pourquoi il n'est pas retiré** :
/// `SceneFraming.presentationAspect`/`presentedSize` n'ont plus de
/// consommateur de production depuis #6896, mais une douzaine de témoins
/// (`ScenePresentationTests`, `SceneFramingTests`) mesurent par eux la loi
/// d'ÉCHELLE que les surfaces d'aperçu partagent — les retirer retirerait
/// cette mesure, ce qui est un lot d'aperçus, pas un lot de plein écran.
/// `StoryImageOnlyPresentation` et `StorySceneFootprint`, eux, sont partis
/// avec ce tour : leurs seuls appelants étaient l'un l'autre.
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
    /// **Un fond REMPLI n'a pas de bande** — il couvre déjà toute la scène,
    /// rognant ce qui dépasse plutôt que de laisser du fond visible. Calculer
    /// une bande depuis son seul `aspectRatio` déclaré y montrerait une zone
    /// que le renderer ne respecte pas : un hôte qui s'y resserrerait
    /// rognerait un média qui, à l'écran, remplit le 9:16 en entier.
    ///
    /// **Ce qui compte comme « rempli » est `StoryBackgroundFraming.
    /// rendersFilled`, jamais une égalité locale à `"fill"`** (revue #6904,
    /// tour 2) : `nil` en est un ALIAS, pas un troisième état — c'est le
    /// défaut du RENDERER pour tout ce qui n'a jamais reçu de cadrage,
    /// composer comme passerelle. Seul un cadrage explicite `"fit"` garde le
    /// calcul habituel ; l'ABSENCE de valeur suit désormais le même défaut que
    /// le renderer, pas celui du geste de composition.
    public nonisolated static func mediaBand(scene: SceneV3,
                                             backgroundAspect: CGFloat? = nil) -> CGRect? {
        guard let rapport = resolvedBackgroundAspect(scene: scene, override: backgroundAspect)
        else { return nil }
        if StoryBackgroundFraming.rendersFilled(declaredFitMode(in: scene)) { return unitRect }
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

    // MARK: - 4 · La carte de la scène

    /// Ce sur quoi une scène se pose. La loi en ÉLIT un (`cardedBackdrop`) ;
    /// l'énumération reste le vocabulaire de `SceneBackdropView`, qui sait
    /// peindre les trois — un hôte qui aurait une raison d'en nommer un autre
    /// (un aperçu, un export) le nommerait, et le nommer se verrait.
    public enum Backdrop: Equatable, Sendable {
        case black
        /// La couleur dominante du ThumbHash — préférence du porteur.
        case thumbHashDominantColor
        /// Le ThumbHash lui-même, étiré.
        case thumbHash
    }

    /// Ce qu'un plein écran de scène prescrit dans un viewport donné.
    public struct Layout: Equatable, Sendable {
        /// Le cadre de la scène dans le repère du viewport — AJUSTÉ, centré,
        /// donc toujours contenu dans le viewport.
        public let sceneFrame: CGRect
        /// Ce qui habille le hors-champ, DANS la carte. Jamais `nil` : une
        /// scène 9:16 ajustée laisse toujours quelque chose autour d'elle dès
        /// que le viewport n'est pas exactement 9:16, et ce quelque chose est
        /// une surface de COMPOSITION, pas un vide.
        public let backdrop: Backdrop
        public let cornerRadius: CGFloat
    }

    /// **L'arrondi d'une scène — celui de la STORY, parce que c'est elle la
    /// référence** (directive porteur du 2026-09-17 : « ce que je vois dans les
    /// stories me plaît, il faut reproduire exactement la même chose
    /// partout »).
    ///
    /// Il valait 20 ici et 22 chez le lecteur de stories comme chez le composer
    /// (`StoryComposerView+Canvas`), donc la même carte se reconnaissait à ses
    /// coins selon la surface qui l'ouvrait. Unifier VERS la loi aurait
    /// rectifié la story ; c'est l'inverse qui est demandé — la story est ce
    /// qu'on reproduit, pas ce qu'on corrige.
    public nonisolated static let cardedCornerRadius: CGFloat = 22

    /// **En PLEIN ÉCRAN, la carte n'a AUCUN rayon** (directive porteur du
    /// 2026-09-18, verbatim) :
    ///
    /// > « Lorsqu'on met en plein écran, il faut enlever l'arrondi sur le
    /// > composant et garder les bords angle exacte ! »
    ///
    /// Un angle droit EXACT n'a pas de rayon : la constante est 0, et elle
    /// existe pour être NOMMÉE — un `cornerRadius: 0` écrit chez un hôte serait
    /// le zéro de cet hôte, indiscernable d'un oubli. `layout(in:immersive:)`
    /// est le seul site qui l'élit.
    ///
    /// Elle n'est pas le pendant d'un choix d'esthétique : c'est la
    /// conséquence de ce qu'un plein écran EST. Une carte cadrée flotte dans un
    /// plateau — ses coins la détachent ; une carte qui occupe le viewport
    /// entier n'a plus rien de quoi se détacher, et ses coins arrondis y
    /// laissaient voir le sol par quatre encoches.
    public nonisolated static let immersiveCornerRadius: CGFloat = 0

    /// **Le fond d'une scène — le MÊME sur toutes les surfaces** (directive
    /// porteur du 2026-09-17 : « On préserve le même fond que pour la story ! »).
    ///
    /// La loi ne CHOISISSAIT pas, et chaque hôte élisait donc le sien : le
    /// lecteur de stories la couleur dominante, la galerie le hachage étiré,
    /// l'immersif RIEN. Trois fonds pour une même carte, chacun juste chez lui,
    /// aucun témoin capable de rougir. La couleur PLATE l'emporte pour la
    /// raison de #6797 : deux surfaces qui étirent le MÊME hachage dans deux
    /// cadres différents rendent deux dégradés voisins mais distincts — ce qui
    /// se lit comme un défaut de rendu —, alors qu'une couleur unie ne peut pas
    /// diverger d'un cadre à l'autre.
    public nonisolated static let cardedBackdrop: Backdrop = .thumbHashDominantColor

    /// **Le cadre de la scène dans un viewport — UN seul, pour toute surface
    /// plein écran** (directive porteur du 2026-09-17, 3e message).
    ///
    /// La scène est AJUSTÉE (elle tient entière, centrée) et le fond habille ce
    /// qui reste. Il n'y a plus de second état : l'immersif d'un post n'est pas
    /// une autre FORME, c'est la même carte dans un AUTRE VIEWPORT — celui de
    /// l'écran entier, sans couloir de plateau ni chrome. Le seul paramètre qui
    /// distingue les surfaces est donc le viewport qu'elles passent, et c'est
    /// l'hôte qui le sait.
    ///
    /// > **`Fullscreen`/`OffscreenPainter` ont DISPARU, et ce n'est pas un
    /// > nettoyage : c'est la directive.** L'immersif rendait un aspect-FILL
    /// > sans fond (`offscreenPainter == .none`) — une scène rognée, la seule
    /// > surface du produit qui retirait des pixels que l'auteur avait posés.
    /// > Avec un seul état, `offscreenPainter` vaudrait `.stage` partout : une
    /// > loi qui calcule une valeur constante que personne ne peut plus lire
    /// > autrement. Le peintre est désormais dit par la STRUCTURE — c'est
    /// > `SceneCard`, et elle seule, qui peint le fond DANS la carte.
    ///
    /// ## `immersive` — le SEUL état de la carte, et il est SANS défaut
    ///
    /// Il ne change ni le cadre, ni le fond : il ne change que le RAYON
    /// (`immersiveCornerRadius` contre `cardedCornerRadius`), parce que c'est
    /// tout ce que la directive B du 2026-09-18 demande — « lorsqu'on met en
    /// plein écran, il faut enlever l'arrondi sur le composant et garder les
    /// bords angle exacte ! ».
    ///
    /// **Aucune valeur par défaut, et c'est le fond du correctif.** Avec un
    /// défaut, la galerie et le réel auraient continué à rendre 22 en immersif
    /// sans qu'une seule ligne les dénonce — c'est exactement le défaut qu'ils
    /// portaient avant ce tour. Sans défaut, chaque hôte DÉCLARE l'état de son
    /// viewport, et un hôte qui en ajouterait un ne compile pas tant qu'il ne
    /// l'a pas dit.
    public nonisolated static func layout(in viewport: CGSize, immersive: Bool) -> Layout {
        let rayon = immersive ? immersiveCornerRadius : cardedCornerRadius
        guard viewport.width > 0, viewport.height > 0 else {
            return Layout(sceneFrame: .zero, backdrop: cardedBackdrop, cornerRadius: rayon)
        }
        let largeur = min(viewport.width, viewport.height * aspect)
        let hauteur = largeur / aspect
        return Layout(sceneFrame: CGRect(x: (viewport.width - largeur) / 2,
                                         y: (viewport.height - hauteur) / 2,
                                         width: largeur, height: hauteur),
                      backdrop: cardedBackdrop,
                      cornerRadius: rayon)
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


// =============================================================================
//  L'EMPREINTE avec laquelle le fond d'une carte se calcule
// =============================================================================

public extension StoryItem {

    /// **L'empreinte que le fond d'une carte de scène étire ou moyenne.**
    ///
    /// `SceneShape.cardedBackdrop` dit QUOI peindre ; ce hachage dit avec quelle
    /// matière. La cascade est celle du lecteur de stories depuis #6141 — la
    /// scène d'abord, son premier média ensuite — et elle vit ici parce que
    /// **le lecteur de stories n'est plus la seule surface à la descendre** :
    /// le plein écran cadré d'un post et le RÉEL montent la même carte
    /// (directive porteur du 2026-09-17). Elle est restée une extension de
    /// `StoryItem` et non une méthode d'hôte pour cette seule raison : trois
    /// hôtes qui la recopient sont trois fonds qui divergeront, et c'est
    /// exactement ce que ce lot retire.
    ///
    /// Une chaîne VIDE ne compte pas pour une empreinte : `SceneBackdropView`
    /// retombe alors sur son sol, ce qui est la réponse juste quand il n'y a
    /// aucune matière — et non un repli honteux.
    var sceneBackdropHash: String? {
        if let hash = storyEffects?.thumbHash, !hash.isEmpty { return hash }
        return media.compactMap(\.thumbHash).first { !$0.isEmpty }
    }
}
