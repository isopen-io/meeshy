import CoreGraphics
import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Éditer un objet DANS la scène, toutes familles (#9138)

/// **Ce qu'on édite, réduit à ce qui décide de ses sous-outils.**
///
/// Le modèle connaît cinq `MeeshySceneObject.Kind` ; l'édition en a besoin de
/// plus fins, parce qu'une image et une vidéo n'offrent pas les mêmes réglages
/// (le filtre se cuit dans une image) et qu'un média devenu FOND règle le
/// filtre de la slide plutôt que le sien. Le plan du média fait donc partie de
/// la famille : un objet qui devient le fond CHANGE de famille, et son édition
/// se referme (`ComposerInlineEditing.resolved`).
nonisolated enum ComposerInlineFamily: Equatable, Sendable {
    case text
    case image
    case video
    case audio
    case sticker
    case place
    case background(isVideo: Bool)

    /// Seul un MÉDIA peut être le fond : le drapeau ne dit rien d'un texte.
    static func of(kind: MeeshySceneObject.Kind, isVideo: Bool, isBackground: Bool) -> ComposerInlineFamily {
        switch kind {
        case .text:    return .text
        case .sticker: return .sticker
        case .place:   return .place
        case .audio:   return .audio
        case .media:
            if isBackground { return .background(isVideo: isVideo) }
            return isVideo ? .video : .image
        }
    }

    /// Le kind du MODÈLE que les inventaires de l'éditeur d'objet attendent.
    var sceneKind: MeeshySceneObject.Kind {
        switch self {
        case .text:                    return .text
        case .image, .video, .background: return .media
        case .audio:                   return .audio
        case .sticker:                 return .sticker
        case .place:                   return .place
        }
    }

    var isVideo: Bool {
        switch self {
        case .video, .background(isVideo: true): return true
        case .text, .image, .audio, .sticker, .place, .background(isVideo: false): return false
        }
    }

    var isBackground: Bool {
        if case .background = self { return true }
        return false
    }
}

/// **L'édition en cours** — quel objet, de quelle famille, et quel sous-outil a
/// ses options ouvertes. `openSection == nil` ⇒ seuls les sous-outils sont à
/// droite ; aucun panneau n'est encore ouvert.
nonisolated struct ComposerInlineEdit: Equatable, Sendable {
    let objectId: String
    let family: ComposerInlineFamily
    var openSection: ComposerObjectEditorSection?
}

/// **Une seule grammaire pour toutes les familles** (#9138, directive porteur
/// 2026-10-02) :
///
/// > « Il faut revoir le chemin de création et édition de texte pour éviter
/// > l'ouverture inutile de la vue ancienne d'édition de texte, gérer
/// > l'engendrement et positionnement des sous-outils et l'édition d'élément
/// > existant de manière simple et cohérente ! Même chose pour les images de
/// > front et d'arrière plan ! »
///
/// Sélectionner un objet — le créer, le toucher, le double-toucher, « Modifier »
/// — mène au MÊME état : ses sous-outils au rail droit, dans un ordre
/// canonique, puis ses actions, puis `(x)`. Toucher un sous-outil ouvre ses
/// options À DROITE, depuis le haut ; le retoucher les range. Le fond l'avait
/// inauguré (#8847) ; il n'est plus qu'une famille parmi les autres.
///
/// Toutes les portes d'édition passent par un SITE unique
/// (`MeeshyComposerHost.openObjectEditor`) : c'est là que la scène rend l'objet
/// à l'édition en place, une fois, pour le menu du fond, la vignette de slide,
/// « Modifier », les sous-outils, le rognage et les jetons. Hors de la scène
/// (l'atelier, le document), `begin` rend `nil` et l'éditeur d'objet reste la
/// destination.
nonisolated enum ComposerInlineEditing {

    /// **Les sous-outils d'une famille, dans l'ordre que ses inventaires ont
    /// déjà fixé** (`ComposerObjectEditorRail.entries`) — aucune seconde liste.
    ///
    /// **La fenêtre de temps et le plan 2D sont réservés au TEXTE** : leur
    /// réglage n'écrit que sur un objet texte (`ComposerObjectTimingControls`),
    /// et les offrir ailleurs serait servir un contrôle sans effet — ce que la
    /// loi 4 bannit. Un fond, lui, dure la slide entière.
    ///
    /// **Une IMAGE se recadre, d'abord** — l'ordre des décisions de la vue
    /// `2d`. Deux images le servent : le FOND IMAGE d'une pièce retouchée
    /// (#9136), où il se cuit dans la pièce rendue, et l'image POSÉE (#9499),
    /// dont le calque, le lecteur web et la vignette lisent la borne. Un fond
    /// hors retouche ne l'offre pas — le lecteur ne recadre pas un fond — ni une
    /// vidéo, dont le player ne lit pas encore la borne (#9153) : ce seraient
    /// des contrôles sans effet.
    ///
    /// **Les RÉGLAGES vont à tout média qui les PEINT** — l'image posée
    /// (#9175), la vidéo dont le player peint les trames (#9169), et le fond,
    /// image ou vidéo, que sa couche peint par `StoryBackgroundLook` (#9496).
    static func sections(for family: ComposerInlineFamily,
                         hasTrimmableSource: Bool,
                         retouching: Bool = false) -> [ComposerObjectEditorSection] {
        let servies = ComposerObjectEditorRail.entries(for: family.sceneKind,
                                                       hasTrimmableSource: hasTrimmableSource,
                                                       offersFilter: !family.isVideo,
                                                       offersAdjust: family.sceneKind == .media)
            .filter { section in
                switch section {
                case .timing, .plan:  return family == .text
                case .media(let outil): return MediaEditTool.served.contains(outil)
                case .tool:           return true
                }
            }
        let recadre = family == .image || (retouching && family == .background(isVideo: false))
        return (recadre ? [.media(.crop)] : []) + servies
    }

    /// **Une demande d'édition, sur la scène, devient l'édition en place.** La
    /// section demandée s'ouvre si la famille la sert ; sinon, seuls les
    /// sous-outils paraissent — jamais l'ancien écran plein.
    static func begin(objectId: String,
                      family: ComposerInlineFamily,
                      onSceneSurface: Bool,
                      requested: ComposerObjectEditorSection?,
                      hasTrimmableSource: Bool,
                      retouching: Bool = false) -> ComposerInlineEdit? {
        guard onSceneSurface else { return nil }
        let servies = sections(for: family, hasTrimmableSource: hasTrimmableSource, retouching: retouching)
        return ComposerInlineEdit(objectId: objectId,
                                  family: family,
                                  openSection: requested.flatMap { servies.contains($0) ? $0 : nil })
    }

    /// Toucher un sous-outil ouvre ses options ; toucher celui qui est ouvert
    /// les range. Les sous-outils, eux, restent jusqu'au `(x)`.
    static func tapped(_ section: ComposerObjectEditorSection,
                       in edit: ComposerInlineEdit) -> ComposerInlineEdit {
        ComposerInlineEdit(objectId: edit.objectId,
                           family: edit.family,
                           openSection: edit.openSection == section ? nil : section)
    }

    /// **L'édition ne survit ni à sa sélection, ni à son objet, ni à sa
    /// famille.** Désélectionner (le `(x)`, un toucher du fond), supprimer ou
    /// défaire l'objet, en faire le fond, ou monter une autre surface rend la
    /// scène : l'écran ne reste jamais en mode outil sur ce qui n'est plus là.
    /// Une section que l'objet ne sert plus se range, l'édition reste.
    static func resolved(_ edit: ComposerInlineEdit?,
                         selectedId: String?,
                         family: ComposerInlineFamily?,
                         served: [ComposerObjectEditorSection],
                         onSceneSurface: Bool) -> ComposerInlineEdit? {
        guard let edit, onSceneSurface, edit.objectId == selectedId, edit.family == family else {
            return nil
        }
        guard let ouverte = edit.openSection, !served.contains(ouverte) else { return edit }
        return ComposerInlineEdit(objectId: edit.objectId, family: edit.family, openSection: nil)
    }

    /// **« Modifier » n'est offert que s'il mène AILLEURS.** Pour un texte, il
    /// lève le clavier ; pour un son, il ouvre la création audio. Pour un
    /// média, un sticker ou un lieu, l'édition en place EST l'édition : il
    /// rouvrirait l'état où l'on est déjà. Le fond ne sert que ses sous-outils
    /// (#8847).
    static func actions(for family: ComposerInlineFamily,
                        offered: [StoryCanvasContextAction]) -> [StoryCanvasContextAction] {
        switch family {
        case .background:
            return []
        case .text, .audio:
            return offered
        case .image, .video, .sticker, .place:
            return offered.filter { $0 != .edit }
        }
    }
}

// MARK: - Le panneau : à droite, depuis le haut, l'espace disponible

/// **Où s'ouvrent les options d'un sous-outil** (#9138).
///
/// > « […] avec les options des outils qui s'ouvrent à droite partant du haut
/// > (s'assurer de prendre l'espace disponible pour ne pas avoir de l'espace
/// > perdu sur la rangée de droite comme de gauche). »
///
/// ## Pourquoi un panneau de VERRE sur la scène, et pas une scène qui recule
///
/// La scène plein écran (#8281, #8370) a remplacé la géographie « aucun
/// contrôle sur la scène, rails dans les couloirs » (`apps/ios/CLAUDE.md` § 1) :
/// sur un téléphone, la carte 9:16 prend la largeur et il n'y a plus de
/// couloir. Faire reculer la scène à gauche d'un panneau la réduirait au tiers
/// de l'écran ET laisserait du vide au-dessus et au-dessous d'elle — l'espace
/// perdu que la directive interdit. Le panneau FLOTTE donc, comme les rails,
/// en verre teinté du plateau ; et il ÉPOUSE son contenu jusqu'à la hauteur
/// libre : la part de scène qu'il ne demande pas reste visible et touchable,
/// ce que § 1 protégeait (loi 6, zone morte).
///
/// ## La largeur : ce que la colonne gauche, VIDE pendant l'édition, libère
///
/// Pendant une édition, les portes du rail gauche cèdent (`ComposerToolFocus`)
/// : aucun couloir n'est réservé de ce côté, et le panneau s'étend du bord
/// gauche jusqu'à la colonne des sous-outils. Sur grand écran, il reste une
/// carte bornée à côté du rail, comme la bande du Cadre.
nonisolated enum ComposerInlinePanelLayout {

    /// La marge intérieure du verre.
    static let contentPadding: CGFloat = 12

    /// Trois vignettes d'options (56 pt, espacées de 8) et la marge du verre :
    /// ce que la grille en colonne demande au plus étroit des écrans.
    static let minimumWidth: CGFloat = 3 * 56 + 2 * 8 + 2 * contentPadding

    static func width(freeWidth: CGFloat, roomy: Bool) -> CGFloat {
        let bord = ComposerRailGeometry.edgeMargin(roomy: roomy)
        let place = max(0, freeWidth - 2 * bord - ComposerRailGeometry.railWidth - ComposerRailGeometry.gutter)
        return roomy ? min(ComposerRailGeometry.roomyPanelWidth, place) : place
    }

    /// Toute la hauteur libre du couloir, moins la gouttière du haut — jamais le
    /// plafond de 260 pt de l'ancienne bande basse.
    static func maxHeight(freeHeight: CGFloat) -> CGFloat {
        max(1, freeHeight - ComposerRailGeometry.gutter)
    }

    /// Le contenu, borné par la hauteur libre ; jamais nul (une première passe
    /// à zéro ferait clignoter le panneau à chaque ouverture).
    static func height(content: CGFloat, freeHeight: CGFloat) -> CGFloat {
        min(max(content, 1), maxHeight(freeHeight: freeHeight))
    }

    // MARK: Laisser voir l'objet qu'on règle (#9495)

    /// **Les sous-outils qui changent le RENDU de l'objet** — filtre, réglages
    /// et recadrage (#9499). On les juge à l'œil : le panneau ne doit pas cacher ce qu'il
    /// règle, et « Comparer » n'a de sens que si l'image comparée se voit.
    static func keepsObjectInSight(_ section: ComposerObjectEditorSection) -> Bool {
        section == .media(.filter) || section == .media(.adjust) || section == .media(.crop)
    }

    /// **Le haut ou le bas de la scène libre, du côté qui laisse voir l'objet**
    /// (#9495). Le panneau part du haut (#9138) ; il ne descend au bas que si
    /// le haut couvre l'objet ET que le bas le couvre moins. Sans cadre connu,
    /// il reste en haut.
    static func edge(object: CGRect?, free: CGSize, panelHeight: CGFloat,
                     roomy: Bool = false) -> ComposerInlinePanelEdge {
        guard let object, !object.isNull, !object.isEmpty else { return .top }
        let enHaut = covered(object, by: frame(edge: .top, free: free, panelHeight: panelHeight, roomy: roomy))
        guard enHaut > 0 else { return .top }
        let enBas = covered(object, by: frame(edge: .bottom, free: free, panelHeight: panelHeight, roomy: roomy))
        return enBas < enHaut ? .bottom : .top
    }

    /// Le rectangle du panneau dans la scène libre — calé à gauche de la colonne
    /// des sous-outils, sur sa gouttière du haut ou du bas.
    static func frame(edge: ComposerInlinePanelEdge, free: CGSize, panelHeight: CGFloat,
                      roomy: Bool = false) -> CGRect {
        let largeur = width(freeWidth: free.width, roomy: roomy)
        let hauteur = height(content: panelHeight, freeHeight: free.height)
        let droite = free.width - ComposerRailGeometry.edgeMargin(roomy: roomy)
            - ComposerRailGeometry.railWidth - ComposerRailGeometry.gutter
        let y = edge == .top ? ComposerRailGeometry.gutter : free.height - ComposerRailGeometry.gutter - hauteur
        return CGRect(x: droite - largeur, y: max(0, y), width: largeur, height: hauteur)
    }

    /// La part de l'objet que le panneau recouvre, en points carrés.
    static func covered(_ object: CGRect, by panel: CGRect) -> CGFloat {
        let commun = object.intersection(panel)
        return commun.isNull ? 0 : commun.width * commun.height
    }

    /// **Le cadre d'un objet de la carte, ramené dans le repère du panneau** —
    /// la boîte englobante de son rectangle tourné autour de son ancre.
    static func objectFrame(center: CGPoint, size: CGSize, anchor: CGPoint, rotationDegrees: Double,
                            card: CGRect, container: CGRect) -> CGRect {
        let origine = CGPoint(x: card.minX - container.minX + center.x - anchor.x * size.width,
                              y: card.minY - container.minY + center.y - anchor.y * size.height)
        let pivot = CGPoint(x: origine.x + anchor.x * size.width, y: origine.y + anchor.y * size.height)
        let rotation = CGAffineTransform(translationX: pivot.x, y: pivot.y)
            .rotated(by: CGFloat(rotationDegrees) * .pi / 180)
            .translatedBy(x: -pivot.x, y: -pivot.y)
        return CGRect(origin: origine, size: size).applying(rotation)
    }
}

/// Le côté de la scène libre où le panneau d'options se range.
nonisolated enum ComposerInlinePanelEdge: Equatable, Sendable {
    case top
    case bottom
}

nonisolated enum ComposerInlineEditCopy {
    /// Ce que VoiceOver annonce en entrant : les outils du fond, ou l'objet.
    static func entered(_ family: ComposerInlineFamily) -> String {
        if family.isBackground {
            return String(localized: "composer.background.tools.entered",
                          defaultValue: "Outils du fond", bundle: .main)
        }
        return ComposerTrailingRailCopy.railLabel
    }

    static var left: String {
        String(localized: "composer.background.tools.left",
               defaultValue: "Retour à la scène", bundle: .main)
    }
}
