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
///
/// **Il n'y a pas d'action « Ordre »** (décision porteur, #13918, R6) : toucher
/// un objet posé le fait passer au premier plan (`StoryEffects.broughtToFront`) ;
/// pour l'envoyer au dernier rang, on touche les autres, du plus profond au plus
/// haut.
nonisolated enum ComposerSelectionAction: String, CaseIterable, Equatable, Sendable {
    case modify
    case duplicate
    case time
    case remove

    var symbol: String {
        switch self {
        case .modify:    return "pencil"
        case .duplicate: return "plus.square.on.square"
        case .time:      return "clock"
        case .remove:    return "trash"
        }
    }

    var isDestructive: Bool { self == .remove }
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
    /// Le média posé devient le fond (#8716) — il vivait au menu « Ordre », qui
    /// a quitté la barre (#13918).
    case setAsBackground
    /// Le même geste quand un fond existe déjà : il le remplace.
    case replaceBackground
    /// Détourer le sujet de l'image et le poser en sticker (inventaire H3).
    case makeSticker
    /// Reprendre la photo du fond au viseur (inventaire D8).
    case retakePhoto

    var symbol: String {
        switch self {
        case .setAsBackground:   return StoryCanvasContextAction.setAsBackground.systemImage
        case .replaceBackground: return StoryCanvasContextAction.replaceBackground.systemImage
        case .makeSticker:       return "person.crop.square.badge.camera"
        case .retakePhoto:       return "camera"
        }
    }
}

nonisolated enum ComposerSelectionActions {

    /// **La barre d'un élément, par famille** — une action absente plutôt
    /// qu'inerte (loi 4).
    ///
    /// - Modifier : l'objet a un éditeur, ou c'est le fond (ses réglages).
    /// - Dupliquer : jamais un fond — il deviendrait un second fond.
    /// - Temps : toute famille POSÉE ; un fond dure la slide entière.
    /// - Retirer : l'objet n'est pas verrouillé.
    static func served(family: ComposerInlineFamily,
                       offered: [StoryCanvasContextAction],
                       isLocked: Bool) -> [ComposerSelectionAction] {
        ComposerSelectionAction.allCases.filter { action in
            switch action {
            case .modify:    return !isLocked && (family.isBackground || offered.contains(.edit))
            case .duplicate: return !family.isBackground && offered.contains(.duplicate)
            case .time:      return !family.isBackground && !isLocked
            case .remove:    return offered.contains(.delete)
            }
        }
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

    /// Devenir le fond : une image ou une vidéo POSÉE, quand l'objet l'admet —
    /// en remplaçant le fond s'il y en a un. Faire un sticker : une IMAGE, posée
    /// ou en fond, quand le détourage existe (iOS 17). Reprendre la photo : le
    /// fond, quand le viseur prend des photos.
    static func mediaExtras(family: ComposerInlineFamily,
                            offered: [StoryCanvasContextAction] = [],
                            cameraTakesPhotos: Bool,
                            subjectLiftAvailable: Bool) -> [ComposerSelectionMediaExtra] {
        let estImage = family == .image || family == .background(isVideo: false)
        let estPose = family == .image || family == .video
        return ComposerSelectionMediaExtra.allCases.filter { extra in
            switch extra {
            case .setAsBackground:   return estPose && offered.contains(.setAsBackground)
            case .replaceBackground: return estPose && offered.contains(.replaceBackground)
            case .makeSticker:       return estImage && subjectLiftAvailable
            case .retakePhoto:       return family.isBackground && cameraTakesPhotos
            }
        }
    }

    /// **La porte de la barre qu'une entrée du menu d'appui long raccourcit.**
    /// Le rognage n'en a pas : il vit dans Modifier › Découper. Devenir le fond
    /// vit dans Modifier. L'empilement n'a plus de porte : le toucher le fait
    /// (#13918).
    static func shortcut(_ action: StoryCanvasContextAction) -> ComposerSelectionAction? {
        switch action {
        case .edit, .setAsBackground, .replaceBackground: return .modify
        case .duplicate:                                  return .duplicate
        case .delete:                                     return .remove
        case .trim, .bringForward, .sendBackward, .leaveScene: return nil
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
        case closeBand
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
                        backgroundMediaId: String?,
                        bandIsOpen: Bool = false) -> Outcome {
        if hadSelection { return .deselect }
        if bandIsOpen { return .closeBand }
        if effectIsOpen { return .closeEffect }
        if quickCaptureOffered { return .armViewfinder }
        guard let backgroundMediaId, !backgroundMediaId.isEmpty else { return .nothing }
        return .selectBackground(backgroundMediaId)
    }

    /// Une bande ouverte se referme AVEC la sélection : le même toucher les
    /// rend toutes deux, sans quoi la bande survivait à l'objet qu'elle réglait.
    static func closesBand(_ outcome: Outcome) -> Bool {
        outcome == .deselect || outcome == .closeBand
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
        case .duplicate:
            return String(localized: "composer.selection.duplicate", defaultValue: "Dupliquer", bundle: .main)
        case .time:
            return String(localized: "composer.selection.time", defaultValue: "Temps", bundle: .main)
        case .remove:
            return String(localized: "composer.selection.remove", defaultValue: "Retirer", bundle: .main)
        }
    }

    @MainActor
    static func label(_ extra: ComposerSelectionMediaExtra) -> String {
        switch extra {
        case .setAsBackground:
            return StoryCanvasContextAction.setAsBackground.title
        case .replaceBackground:
            return StoryCanvasContextAction.replaceBackground.title
        case .makeSticker:
            return String(localized: "composer.selection.makeSticker", defaultValue: "Faire un sticker", bundle: .main)
        case .retakePhoto:
            return String(localized: "composer.scene.background.menu.retakePhoto",
                          defaultValue: "Reprendre une photo", bundle: .main)
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
