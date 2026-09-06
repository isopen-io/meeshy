import CoreGraphics
import Foundation
import MeeshySDK

/// **Une carte de fil cadre la scène sur son CONTENU, pas sur son gabarit**
/// (directive porteur 2026-09-06).
///
/// > « Une ou des scènes avec juste une image/vidéo (et pourquoi pas un son de
/// > fond en plus ou un audio, voire d'autres éléments toujours sur la zone /
/// > par-dessus l'image/vidéo), on affiche directement cette zone dans le Feed
/// > plutôt que toute la scène 9:16 ! Ou une scène avec un fond uni : on se
/// > centre sur la zone où il y a du contenu dans les cards du Feed. »
///
/// ## Ce que ça corrige
///
/// La scène est composée en 9:16 parce que c'est le gabarit d'une story. Le
/// FIL, lui, n'est pas vertical : y peindre une scène entière fait payer à
/// chaque carte la hauteur d'un plein écran pour montrer, souvent, une photo
/// paysage entourée de vide. L'auteur a posé une image ; le lecteur voit un
/// cadre.
///
/// > **Le gabarit de COMPOSITION n'est pas le gabarit de RESTITUTION.** La
/// > scène reste 9:16 — c'est ce qui part au plein écran, à l'export et au
/// > reader. La carte, elle, montre la zone qui porte quelque chose.
///
/// ## La règle, en une phrase
///
/// Le cadre est l'UNION de ce que la scène montre : la bande du média de fond,
/// et les ancres des objets visibles. Rien de visible n'en sort, et rien de
/// vide n'y entre.
///
/// C'est cette union qui répond aux deux cas du porteur d'un seul mouvement :
/// une image seule rend sa bande ; une image avec du texte posé dessus rend la
/// bande élargie au texte ; un fond uni rend la seule zone des objets.
///
/// ## L'approximation, dite franchement
///
/// **Un objet de canvas porte une ANCRE, pas une taille.** Sa taille rendue
/// dépend de son contenu — la longueur d'un texte, la police d'un sticker — et
/// n'est connue qu'au rendu. La boîte des ancres est donc élargie d'une marge
/// (`objectPadding`) qui couvre un objet de taille ordinaire.
///
/// Se tromper d'un côté coûte du vide autour du contenu ; de l'autre, un texte
/// coupé. La marge est donc GÉNÉREUSE, et le cadre a un plancher
/// (`minimumSide`) : un sticker seul au centre ne doit pas produire un zoom
/// absurde sur un dixième de scène.
public nonisolated enum SceneFraming {

    /// Le rapport largeur / hauteur d'une scène — le 9:16 de la composition.
    public static let sceneAspect: CGFloat = 9.0 / 16.0

    /// La marge ajoutée autour d'une ancre d'objet, faute de connaître sa
    /// taille rendue. Voir « L'approximation » ci-dessus.
    public static let objectPadding: CGFloat = 0.16

    /// Le cadre ne descend jamais sous cette fraction, en largeur comme en
    /// hauteur : sous ce seuil on ne cadre plus, on zoome.
    public static let minimumSide: CGFloat = 0.42

    /// Position conventionnelle d'un objet ancré à une BANDE. Le fil n'a pas
    /// le moteur de rendu sous la main ; ces deux valeurs disent « en haut » et
    /// « en bas » avec la marge que le reader applique.
    public static let bandTopY: CGFloat = 0.12
    public static let bandBottomY: CGFloat = 0.88

    // MARK: - Ce qui compte comme VISIBLE

    /// **Un objet qui ne produit aucun pixel ne cadre rien.**
    ///
    /// Un son de fond et une mention référencée voyagent avec la scène sans
    /// s'y peindre — le porteur les nomme d'ailleurs comme des compagnons de
    /// l'image (« un son de fond en plus ou un audio »), pas comme du contenu à
    /// cadrer. Les inclure élargirait le cadre au nom de quelque chose que
    /// personne ne voit.
    public static func isVisible(_ object: ObjectV3) -> Bool {
        switch object.kind {
        case .audio, .mention: return false
        case .text, .media, .sticker, .place, .drawing: return true
        case .reserved: return false
        }
    }

    /// **Le média de FOND — et il ne se reconnaît PAS à son plan.**
    ///
    /// Mesuré sur le fil de production (2026-09-06) : un fond réel arrive en
    /// `plane: "content"` avec `isBackground: true` dans son payload. Le plan
    /// `bg` existe au contrat et reste accepté, mais le composer ne l'emploie
    /// pas — une première version de cette règle ne cherchait que `.bg` et
    /// n'aurait donc RIEN trouvé sur aucune publication réelle.
    ///
    /// > Une règle qui interroge le contrat sans regarder les données passe à
    /// > côté de ce que les données disent. Le contrat autorisait les deux
    /// > écritures ; une seule est employée.
    public static func isBackground(_ object: ObjectV3) -> Bool {
        guard object.kind == .media else { return false }
        if object.plane == .bg { return true }
        if case .bool(true)? = object.payload["isBackground"] { return true }
        return false
    }

    public static func backgroundMedia(in scene: SceneV3) -> ObjectV3? {
        scene.objects.first(where: isBackground)
    }

    /// **Le rapport DÉCLARÉ par l'objet lui-même.**
    ///
    /// Le payload d'un média porte `aspectRatio` — mesuré en production. La
    /// règle n'a donc besoin de personne pour connaître la forme du fond : ni
    /// du post, ni d'une résolution par identifiant, ni d'un chargement.
    ///
    /// C'est ce qui la garde PURE et immédiate : une carte peut cadrer avant
    /// que la moindre image ne soit téléchargée, donc sans saut de mise en
    /// page à l'arrivée du média.
    public static func declaredAspect(of object: ObjectV3) -> CGFloat? {
        if case .number(let v)? = object.payload["aspectRatio"], v > 0 { return CGFloat(v) }
        return nil
    }

    /// Le rapport du fond de cette scène, tel qu'elle le déclare.
    public static func backgroundAspect(in scene: SceneV3) -> CGFloat? {
        backgroundMedia(in: scene).flatMap(declaredAspect)
    }

    // MARK: - Le cadre

    /// **La zone à montrer dans une carte de fil**, en fractions de la scène.
    ///
    /// `nil` quand il n'y a rien à resserrer : le cadre couvrirait la scène
    /// entière, ou la scène ne porte rien de visible. Rendre `nil` plutôt
    /// qu'un rectangle plein n'est pas cosmétique — c'est ce qui permet à
    /// l'appelant de garder son rendu actuel sans le savoir.
    ///
    /// - Parameter backgroundAspect: le rapport largeur/hauteur NATUREL du
    ///   média de fond (`FeedMedia.width / .height`), ou `nil` s'il n'y en a
    ///   pas ou qu'il est inconnu. Il ne se déduit pas du canvas : le canvas
    ///   dit qu'un média est là, jamais quelle forme il a.
    /// - Parameter backgroundAspect: passer `nil` laisse la scène le DÉCLARER
    ///   elle-même (`backgroundAspect(in:)`). Le paramètre reste pour qu'un
    ///   appelant qui connaît mieux — un média déjà chargé, dont les pixels
    ///   contredisent le fil — puisse l'imposer.
    public static func focus(scene: SceneV3, backgroundAspect: CGFloat? = nil) -> CGRect? {
        // La bande du média de fond — MESURÉE : elle se déduit de deux
        // rapports connus, sans rien supposer.
        var bande: CGRect?
        let fond = backgroundMedia(in: scene)
        // `Self.` est obligatoire : le PARAMÈTRE porte le même nom que la
        // fonction, et sans qualification Swift résout vers la valeur — donc
        // vers un `CGFloat?` qu'on ne peut pas appeler.
        if fond != nil, let a = backgroundAspect ?? Self.backgroundAspect(in: scene), a > 0 {
            bande = backgroundBand(aspect: a)
        }

        // Les ancres des objets visibles, HORS LE FOND — devinées : un objet
        // porte une ancre, pas une taille.
        //
        // L'exclusion se fait par IDENTITÉ et non par plan : le fond arrive en
        // `plane: content`, et le filtrer sur `.bg` l'aurait laissé entrer ici
        // comme un objet ordinaire — sa boîte d'ancre aurait alors élargi le
        // cadre autour du centre, annulant le resserrement sur sa bande.
        var objets: CGRect?
        for objet in scene.objects
        where isVisible(objet) && objet.id != fond?.id {
            let boite = anchorBox(of: objet)
            objets = objets.map { $0.union(boite) } ?? boite
        }

        // **Le plancher ne s'applique qu'à ce qui est DEVINÉ.**
        //
        // Il existe pour empêcher un sticker seul de produire un zoom absurde
        // sur un dixième de scène — un risque de l'approximation par ancres.
        // L'appliquer à la bande le retournerait contre son but : la bande
        // d'une photo 16:9 fait 0,32 de hauteur, et la regonfler à 0,42
        // rajouterait précisément le vide que ce cadrage sert à retirer.
        //
        // > Un plancher se pose sur une ESTIMATION, jamais sur une mesure.
        if let devines = objets { objets = enforceMinimum(devines) }

        guard var resultat = [bande, objets].compactMap({ $0 })
            .reduce(nil as CGRect?, { acc, r in acc.map { $0.union(r) } ?? r })
        else { return nil }
        resultat = clampToScene(resultat)
        // Un cadre qui couvre tout n'est pas un cadre.
        guard resultat.width < 0.999 || resultat.height < 0.999 else { return nil }
        return resultat
    }

    /// **Le rapport que la carte doit adopter** — dérivé du cadre, jamais posé
    /// à la main. `nil` ⇒ garder le 9:16.
    ///
    /// Un cadre de fractions `(w, h)` sur une scène 9:16 rend un rapport
    /// `(w × 9) / (h × 16)` : la largeur et la hauteur ne se comparent qu'une
    /// fois ramenées à la même unité, et c'est l'erreur que ferait un `w / h`
    /// posé directement.
    public static func cardAspect(scene: SceneV3, backgroundAspect: CGFloat? = nil) -> CGFloat? {
        guard let cadre = focus(scene: scene, backgroundAspect: backgroundAspect),
              cadre.height > 0
        else { return nil }
        return (cadre.width * sceneAspect) / cadre.height
    }

    // MARK: - Les pièces

    /// **La bande qu'occupe un média de fond posé en `.fit`.**
    ///
    /// Un média PLUS LARGE que la scène est mis en boîte aux lettres, et c'est
    /// exactement ce que le porteur décrit — « si c'est en mode paysage, ça se
    /// positionne sur la scène avec en arrière-plan le thumbhash ». Sa bande
    /// est ce qu'il faut montrer.
    ///
    /// Un média plus ÉTROIT remplit la scène : il n'y a pas de bande, donc
    /// rien à resserrer. C'est le cas du portrait, que le porteur décrit comme
    /// prenant « toute la scène ».
    public static func backgroundBand(aspect: CGFloat) -> CGRect {
        guard aspect > sceneAspect else { return CGRect(x: 0, y: 0, width: 1, height: 1) }
        let hauteur = sceneAspect / aspect
        return CGRect(x: 0, y: (1 - hauteur) / 2, width: 1, height: hauteur)
    }

    /// La boîte d'un objet, autour de son ancre et à la marge près.
    static func anchorBox(of object: ObjectV3) -> CGRect {
        let centre: CGPoint
        switch object.anchor {
        case .free(let x, let y):
            centre = CGPoint(x: CGFloat(x), y: CGFloat(y))
        case .band(let edge):
            centre = CGPoint(x: 0.5, y: edge == .top ? bandTopY : bandBottomY)
        }
        // L'échelle de l'objet module la marge : un sticker agrandi occupe
        // davantage, et la boîte doit suivre. Bornée pour qu'un facteur
        // extrême ne fasse pas couvrir toute la scène à un seul objet.
        let facteur = min(max(CGFloat(object.transform.scale), 0.5), 3)
        let marge = objectPadding * facteur
        return CGRect(x: centre.x - marge, y: centre.y - marge,
                      width: marge * 2, height: marge * 2)
    }

    /// Le plancher : sous `minimumSide`, on ne cadre plus, on zoome.
    static func enforceMinimum(_ rect: CGRect) -> CGRect {
        var r = rect
        if r.width < minimumSide {
            let d = (minimumSide - r.width) / 2
            r = r.insetBy(dx: -d, dy: 0)
        }
        if r.height < minimumSide {
            let d = (minimumSide - r.height) / 2
            r = r.insetBy(dx: 0, dy: -d)
        }
        return r
    }

    /// **Ramener dans la scène en GLISSANT, pas en rognant.**
    ///
    /// Un objet posé au bord produit une boîte qui déborde. La rogner
    /// rétrécirait le cadre et couperait ce qu'on voulait montrer ; la
    /// glisser la garde entière tant qu'elle tient dans la scène — et ce
    /// n'est que si elle est plus grande que la scène qu'on la borne.
    static func clampToScene(_ rect: CGRect) -> CGRect {
        var r = rect
        if r.width >= 1 { r.origin.x = 0; r.size.width = 1 }
        else { r.origin.x = min(max(r.origin.x, 0), 1 - r.width) }
        if r.height >= 1 { r.origin.y = 0; r.size.height = 1 }
        else { r.origin.y = min(max(r.origin.y, 0), 1 - r.height) }
        return r
    }
}
