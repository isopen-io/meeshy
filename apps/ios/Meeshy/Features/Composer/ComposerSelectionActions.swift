import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - La sélection : une barre d'actions libellées (#13839, L5)
//
// > Maquette validée par le porteur, état 3 : « Un élément
// > sélectionné. Les outils se retirent et une seule barre d'actions apparaît
// > sur la scène, avec ses libellés. Toucher la scène à vide la referme. »
//
// La barre remplace le rail droit de 8 à 15 glyphes sans libellé et son ✕
// « Quitter l'objet », collé à la corbeille. Elle ne fabrique aucune action :
// elle COMPOSE celles que l'objet admet (`StoryCanvasContextAction.offered`,
// filtrées par `ComposerTrailingRailPolicy`), et le menu d'appui long n'en est
// plus qu'un raccourci.

/// **Une action de la barre**, dans l'ordre de la maquette : Retirer, la seule
/// qui détruit, à l'autre bout.
nonisolated enum ComposerSelectionAction: String, CaseIterable, Equatable, Sendable {
    case modify
    case order
    case duplicate
    case time
    case remove

    var symbol: String {
        switch self {
        case .modify:    return "pencil"
        case .order:     return "square.3.layers.3d"
        case .duplicate: return "plus.square.on.square"
        case .time:      return "clock"
        case .remove:    return "trash"
        }
    }

    var isDestructive: Bool { self == .remove }
}

/// **Un choix du menu « Ordre »** — devant, derrière, mettre en fond, sortir de
/// la scène ; pour un fond, revenir devant.
nonisolated enum ComposerSelectionOrder: Hashable, Sendable {
    case forward
    case backward
    case makeBackground(replacing: Bool)
    case foreground
    case leaveScene
}

/// **Ce que « Modifier » ouvre, famille par famille.**
nonisolated enum ComposerSelectionModifyRoute: Equatable, Sendable {
    /// Le texte : la frappe, barre collée au clavier (L4).
    case typing
    /// Une image, une vidéo ou le fond : la feuille non destructive (L2).
    case mediaSheet
    /// Un sticker : la feuille Stickers, dont le choix REMPLACE l'ancien.
    case stickerSheet
    /// Un son : sa feuille Son.
    case soundSheet
    /// Un lieu : la feuille Lieu, dont le choix repointe la pastille.
    case placeSheet
}

/// **Ce que la feuille « Modifier » d'un média offre en plus de ses réglages.**
nonisolated enum ComposerSelectionMediaExtra: String, CaseIterable, Equatable, Sendable {
    /// Détourer le sujet de l'image et le poser en sticker (inventaire H3).
    case makeSticker
    /// Reprendre la photo du fond au viseur (inventaire D8).
    case retakePhoto

    var symbol: String {
        switch self {
        case .makeSticker: return "person.crop.square.badge.camera"
        case .retakePhoto: return "camera"
        }
    }
}

nonisolated enum ComposerSelectionActions {

    /// **La barre d'un élément, par famille** — une action absente plutôt
    /// qu'inerte (loi 4).
    ///
    /// - Modifier : l'objet a un éditeur, ou c'est le fond (ses réglages).
    /// - Ordre : au moins un choix d'empilement a un effet.
    /// - Dupliquer : jamais un fond — il deviendrait un second fond.
    /// - Temps : toute famille POSÉE ; un fond dure la slide entière.
    /// - Retirer : l'objet n'est pas verrouillé.
    static func served(family: ComposerInlineFamily,
                       offered: [StoryCanvasContextAction],
                       isLocked: Bool) -> [ComposerSelectionAction] {
        let ordre = order(family: family, offered: offered)
        return ComposerSelectionAction.allCases.filter { action in
            switch action {
            case .modify:    return !isLocked && (family.isBackground || offered.contains(.edit))
            case .order:     return !ordre.isEmpty
            case .duplicate: return !family.isBackground && offered.contains(.duplicate)
            case .time:      return !family.isBackground && !isLocked
            case .remove:    return offered.contains(.delete)
            }
        }
    }

    /// **Les choix d'« Ordre »** — pour TOUTES les familles, le texte compris :
    /// il n'avait aucun empilement atteignable. Seule une image ou une vidéo
    /// posée devient le fond ; un fond revient devant.
    static func order(family: ComposerInlineFamily,
                      offered: [StoryCanvasContextAction]) -> [ComposerSelectionOrder] {
        let sortie: [ComposerSelectionOrder] = offered.contains(.leaveScene) ? [.leaveScene] : []
        guard !family.isBackground else { return [.foreground] + sortie }
        let estMedia = family == .image || family == .video
        let devant: [ComposerSelectionOrder] = offered.contains(.bringForward) ? [.forward] : []
        let derriere: [ComposerSelectionOrder] = offered.contains(.sendBackward) ? [.backward] : []
        let fond: [ComposerSelectionOrder] = !estMedia ? []
            : offered.contains(.replaceBackground) ? [.makeBackground(replacing: true)]
            : offered.contains(.setAsBackground) ? [.makeBackground(replacing: false)]
            : []
        return devant + derriere + fond + sortie
    }

    static func modifyRoute(_ family: ComposerInlineFamily) -> ComposerSelectionModifyRoute {
        switch family {
        case .text:                        return .typing
        case .image, .video, .background:  return .mediaSheet
        case .sticker:                     return .stickerSheet
        case .audio:                       return .soundSheet
        case .place:                       return .placeSheet
        }
    }

    /// Faire un sticker : une IMAGE, posée ou en fond, quand le détourage existe
    /// (iOS 17). Reprendre la photo : le fond, quand le viseur prend des photos.
    static func mediaExtras(family: ComposerInlineFamily,
                            cameraTakesPhotos: Bool,
                            subjectLiftAvailable: Bool) -> [ComposerSelectionMediaExtra] {
        let estImage = family == .image || family == .background(isVideo: false)
        return ComposerSelectionMediaExtra.allCases.filter { extra in
            switch extra {
            case .makeSticker: return estImage && subjectLiftAvailable
            case .retakePhoto: return family.isBackground && cameraTakesPhotos
            }
        }
    }

    /// **La porte de la barre qu'une entrée du menu d'appui long raccourcit.**
    /// Le rognage n'en a pas : il vit dans Modifier › Découper.
    static func shortcut(_ action: StoryCanvasContextAction) -> ComposerSelectionAction? {
        switch action {
        case .edit:                                    return .modify
        case .duplicate:                               return .duplicate
        case .bringForward, .sendBackward, .setAsBackground,
             .replaceBackground, .leaveScene:          return .order
        case .delete:                                  return .remove
        case .trim:                                    return nil
        }
    }

    /// **Après « Dupliquer », la COPIE est la sélection** — l'objet que la
    /// slide n'avait pas avant le geste ; le cadre et la barre la suivent. Rien
    /// de copié (plafond, badge verrouillé) ⇒ la source reste sélectionnée.
    static func selectionAfterDuplicate(source: String, before: StorySlide, after: StorySlide) -> String {
        let avant = Set(before.sceneObjects.map(\.id))
        return after.sceneObjects.map(\.id).first { !avant.contains($0) } ?? source
    }

    /// **Le menu d'appui long : un sous-ensemble de la barre**, jamais une
    /// action qu'elle ne sert pas.
    static func menuActions(family: ComposerInlineFamily,
                            offered: [StoryCanvasContextAction],
                            isLocked: Bool) -> [StoryCanvasContextAction] {
        let barre = served(family: family, offered: offered, isLocked: isLocked)
        return offered.filter { action in shortcut(action).map(barre.contains) ?? false }
    }
}

// MARK: - Toucher la scène à vide

/// **Toucher la scène à vide désélectionne D'ABORD** (#13839, L5). Le même
/// toucher arme le viseur sur une scène vide : il ne l'arme que si rien n'était
/// sélectionné. Un carrousel d'effets ouvert se referme avant tout.
nonisolated enum ComposerSceneEmptyTap {

    enum Outcome: Equatable, Sendable {
        case deselect
        case closeEffect
        case armViewfinder
        case selectBackground(String)
        case nothing
    }

    /// **Une sélection qui ne désigne plus rien n'en est pas une** : l'objet
    /// défait ou retiré laisse son identifiant au meuble, et le toucher suivant
    /// d'une scène vide doit armer le viseur, pas désélectionner un fantôme.
    static func hadSelection(selectedId: String?, slide: StorySlide, isEditing: Bool) -> Bool {
        isEditing || selectedId.map { slide.sceneObject(id: $0) != nil } == true
    }

    static func outcome(hadSelection: Bool,
                        effectIsOpen: Bool,
                        quickCaptureOffered: Bool,
                        backgroundMediaId: String?) -> Outcome {
        if hadSelection { return .deselect }
        if effectIsOpen { return .closeEffect }
        if quickCaptureOffered { return .armViewfinder }
        guard let backgroundMediaId, !backgroundMediaId.isEmpty else { return .nothing }
        return .selectBackground(backgroundMediaId)
    }
}

// MARK: - Temps : APPARITION et TIMELINE fusionnées

/// **La feuille Temps** : début, fin et frise de l'objet. Les images clés se
/// règlent dans la frise de la scène, qui n'existe qu'en mode Animé.
nonisolated enum ComposerObjectTimeSheetRule {
    static func offersKeyframes(animated: Bool) -> Bool { animated }
}

// MARK: - Les mots

nonisolated enum ComposerSelectionCopy {

    static func label(_ action: ComposerSelectionAction) -> String {
        switch action {
        case .modify:
            return String(localized: "composer.selection.modify", defaultValue: "Modifier", bundle: .main)
        case .order:
            return String(localized: "composer.selection.order", defaultValue: "Ordre", bundle: .main)
        case .duplicate:
            return String(localized: "composer.selection.duplicate", defaultValue: "Dupliquer", bundle: .main)
        case .time:
            return String(localized: "composer.selection.time", defaultValue: "Temps", bundle: .main)
        case .remove:
            return String(localized: "composer.selection.remove", defaultValue: "Retirer", bundle: .main)
        }
    }

    @MainActor
    static func label(_ order: ComposerSelectionOrder) -> String {
        switch order {
        case .forward:                         return StoryCanvasContextAction.bringForward.title
        case .backward:                        return StoryCanvasContextAction.sendBackward.title
        case .makeBackground(replacing: true): return StoryCanvasContextAction.replaceBackground.title
        case .makeBackground(replacing: false): return StoryCanvasContextAction.setAsBackground.title
        case .foreground:                      return ComposerBackgroundMenuCopy.label(for: .bringForward)
        case .leaveScene:                      return StoryCanvasContextAction.leaveScene.title
        }
    }

    static func symbol(_ order: ComposerSelectionOrder) -> String {
        switch order {
        case .forward:        return StoryCanvasContextAction.bringForward.systemImage
        case .backward:       return StoryCanvasContextAction.sendBackward.systemImage
        case .makeBackground(let remplace):
            return remplace ? StoryCanvasContextAction.replaceBackground.systemImage
                            : StoryCanvasContextAction.setAsBackground.systemImage
        case .foreground:     return ComposerBackgroundMenuAction.bringForward.symbol
        case .leaveScene:     return StoryCanvasContextAction.leaveScene.systemImage
        }
    }

    @MainActor
    static func label(_ extra: ComposerSelectionMediaExtra) -> String {
        switch extra {
        case .makeSticker:
            return String(localized: "composer.selection.makeSticker", defaultValue: "Faire un sticker", bundle: .main)
        case .retakePhoto:
            return ComposerBackgroundMenuCopy.label(for: .retakePhoto)
        }
    }

    static var bar: String {
        String(localized: "composer.selection.bar", defaultValue: "Actions de l'élément", bundle: .main)
    }

    static var keyframes: String {
        String(localized: "composer.selection.keyframes", defaultValue: "Images clés dans la frise", bundle: .main)
    }

    static var deselected: String {
        String(localized: "composer.selection.deselected", defaultValue: "Sélection retirée", bundle: .main)
    }

    /// Ce que VoiceOver annonce quand un élément est sélectionné.
    static func selected(_ family: ComposerInlineFamily) -> String {
        switch family {
        case .text:
            return String(localized: "composer.selection.selected.text", defaultValue: "Texte sélectionné", bundle: .main)
        case .image:
            return String(localized: "composer.selection.selected.image", defaultValue: "Image sélectionnée", bundle: .main)
        case .video:
            return String(localized: "composer.selection.selected.video", defaultValue: "Vidéo sélectionnée", bundle: .main)
        case .audio:
            return String(localized: "composer.selection.selected.audio", defaultValue: "Son sélectionné", bundle: .main)
        case .sticker:
            return String(localized: "composer.selection.selected.sticker", defaultValue: "Sticker sélectionné", bundle: .main)
        case .place:
            return String(localized: "composer.selection.selected.place", defaultValue: "Lieu sélectionné", bundle: .main)
        case .background:
            return String(localized: "composer.selection.selected.background", defaultValue: "Fond sélectionné", bundle: .main)
        }
    }
}
