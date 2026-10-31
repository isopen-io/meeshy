import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// **La sélection d'un élément, côté meuble** (#13839, L5).
//
// Toucher un élément le SÉLECTIONNE : le canvas l'encadre de pointillés, les
// outils se retirent et la barre libellée paraît au-dessus de Public et Publier
// — Modifier · Dupliquer · Temps · Retirer — et l'objet passe au premier plan
// (#13918) : il n'y a pas d'action « Ordre ». La règle vit dans
// `ComposerSelectionActions` ; ce fichier lui fournit l'état du meuble et relaie
// chaque action vers la primitive qui existait déjà. Tant que rien n'est publié,
// tout reste mobile : aucune action n'aplatit la scène.
@MainActor
extension MeeshyComposerHost {
    var sceneSelectionRelay: ComposerSceneSelectionRelay { ComposerSceneSelectionRelay(host: self) }
}

/// Le relais de la sélection : il lit l'état du meuble et ne garde rien.
@MainActor
struct ComposerSceneSelectionRelay {
    let host: MeeshyComposerHost


    /// L'élément sélectionné de la scène — `nil` pendant une édition, une
    /// frappe, ou hors de la scène : la barre ne s'y pose pas.
    var current: (id: String, family: ComposerInlineFamily)? {
        guard host.mountedComposerView == .scene, host.inlineEdit == nil, !host.sceneTypesInline,
              let id = host.selectedSceneItemId, let famille = host.inlineFamily(of: id) else { return nil }
        return (id, famille)
    }

    /// Ce que l'élément admet, par la même règle que le menu d'appui long.
    func offered(_ id: String) -> [StoryCanvasContextAction] {
        let slide = host.viewModel.currentSlide
        guard let objet = slide.sceneObject(id: id) else { return [] }
        return ComposerTrailingRailPolicy.actions(
            slide: slide,
            selectedId: id,
            served: ComposerTrailingColumn.servedActions,
            hasEditor: ComposerSceneSurface.defaultEditableSceneKinds.contains(MeeshyComposerHost.canvasKind(objet.kind)),
            canLeaveScene: false)
    }

    func isLocked(_ id: String) -> Bool {
        StorySceneObjectPredicates.isLocked(slide: host.viewModel.currentSlide, id: id)
    }

    /// **La barre, remise à la surface** — `nil` ⇒ aucune sélection, aucun
    /// chrome (la colonne des outils reparaît).
    var bar: ComposerSelectionBar? {
        guard let selection = current else { return nil }
        let offertes = offered(selection.id)
        let actions = ComposerSelectionActions.served(family: selection.family, offered: offertes,
                                                      isLocked: isLocked(selection.id))
        guard !actions.isEmpty else { return nil }
        return ComposerSelectionBar(actions: actions, onAction: { performSelectionAction($0) })
    }

    // MARK: - Sélectionner, désélectionner

    /// **Toucher un élément le sélectionne** — sans l'éditer : la barre dit ce
    /// qu'on peut en faire, VoiceOver l'annonce. **Et il passe au premier plan**
    /// (#13918, R6), la pastille de son de la surcouche comprise : une étape
    /// d'annulation, aucune s'il était déjà devant ; un fond n'entre jamais
    /// dans l'ordre.
    func selectSceneItem(_ id: String, kind: StoryCanvasUIView.CanvasItemKind? = nil) {
        if let devant = host.viewModel.currentSlide.effects.broughtToFront(id) {
            host.viewModel.currentSlide.effects = devant
        }
        let famille = host.inlineFamily(of: id)
        let nouvelle = host.selectedSceneItemId != id
        host.presentedPortal = nil
        host.openSceneEffect = nil
        host.inlineEdit = ComposerInlineEditing.edit(host.activeInlineEdit, afterSelecting: id)
        host.selectedSceneItemId = id
        host.selectedSceneItemKind = famille.map { MeeshyComposerHost.canvasKind($0.sceneKind) } ?? kind
        guard nouvelle, let famille else { return }
        HapticFeedback.light()
        UIAccessibility.post(notification: .announcement, argument: ComposerSelectionCopy.selected(famille))
    }

    func deselectSceneItem() {
        guard host.selectedSceneItemId != nil || host.inlineEdit != nil else { return }
        host.inlineEdit = nil
        host.comparingLookObjectId = nil
        host.selectedSceneItemId = nil
        host.selectedSceneItemKind = nil
        UIAccessibility.post(notification: .announcement, argument: ComposerSelectionCopy.deselected)
    }

    // MARK: - Les actions de la barre

    func performSelectionAction(_ action: ComposerSelectionAction) {
        guard let id = host.selectedSceneItemId else { return }
        switch action {
        case .modify:    modifySceneItem(id)
        case .duplicate: duplicateSceneItem(id)
        case .time:      host.beginInlineEdit(id, purpose: .time); HapticFeedback.light()
        case .remove:    host.handleTrailingRailAction(.delete); HapticFeedback.medium()
        }
    }

    /// **Dupliquer, puis sélectionner la COPIE** — la barre et le menu d'appui
    /// long passent ici.
    func duplicateSceneItem(_ id: String) {
        let avant = host.viewModel.currentSlide
        host.handleTrailingRailAction(.duplicate)
        selectSceneItem(ComposerSelectionActions.selectionAfterDuplicate(
            source: id, before: avant, after: host.viewModel.currentSlide))
    }

    /// **Le menu d'appui long, raccourci de la barre** : Modifier et Dupliquer
    /// y prennent le MÊME chemin qu'à la barre.
    func applyMenuShortcut(_ action: StoryCanvasContextAction, on id: String,
                           kind: StoryCanvasUIView.CanvasItemKind) {
        switch action {
        case .edit:      host.editSceneItem(id, kind: kind)
        case .duplicate: duplicateSceneItem(id)
        default:         host.handleTrailingRailAction(action)
        }
    }

    /// Une sélection VIVANTE : un objet encore sur la slide, ou une feuille
    /// ouverte — jamais l'identifiant d'un objet défait.
    var hasLiveSelection: Bool {
        ComposerSceneEmptyTap.hadSelection(selectedId: host.selectedSceneItemId, slide: host.viewModel.currentSlide,
                                           isEditing: host.activeInlineEdit != nil)
    }

    /// **« Modifier », famille par famille** — le double toucher, l'appui long
    /// et la barre y mènent. Le `switch` est exhaustif : une famille ajoutée
    /// devra dire ce qu'elle ouvre.
    func modifySceneItem(_ id: String) {
        guard let famille = host.inlineFamily(of: id) else { return }
        switch ComposerSelectionActions.modifyRoute(famille) {
        case .typing:
            host.beginSceneTextEditing(id)
        case .mediaSheet:
            host.beginInlineEdit(id, purpose: .modify)
        case .stickerSheet:
            host.stickerReplacementId = id
            host.presentedPortal = .sticker
        case .soundSheet:
            host.editSceneSound(id)
        case .placeSheet:
            host.placeRepointId = id
            host.presentedPortal = .location
        }
        HapticFeedback.medium()
    }

    // MARK: - Les compléments de la feuille Modifier d'un média

    func mediaExtras(for edition: ComposerInlineEdit) -> [ComposerSelectionMediaExtra] {
        guard edition.purpose == .modify else { return [] }
        return ComposerSelectionActions.mediaExtras(
            family: edition.family,
            offered: offered(edition.objectId),
            cameraTakesPhotos: ComposerSceneCamera.modes(for: host.selectedFormat).contains(.photo),
            subjectLiftAvailable: StickerSubjectLift.isAvailable && host.viewModel.loadedImages[edition.objectId] != nil)
    }

    func performMediaExtra(_ extra: ComposerSelectionMediaExtra, on id: String) {
        switch extra {
        case .setAsBackground, .replaceBackground:
            host.inlineEdit = nil
            host.makeSceneBackground(id)
        case .retakePhoto:
            host.inlineEdit = nil
            host.sceneCaptureReplacesBackgroundId = id
            host.armSceneCamera()
        case .makeSticker:
            guard let donnees = host.viewModel.loadedImages[id]?.pngData() else { return }
            host.inlineEdit = nil
            Task { @MainActor in
                guard let item = await StickerLibraryLift.lift(imageData: donnees)?.first else { return }
                host.poseStickerChoice(.library(item))
            }
        }
        HapticFeedback.medium()
    }

    /// **L'en-tête de la feuille Modifier ou Temps** : ses puces libellées, ses
    /// compléments, et OK qui la referme en gardant la sélection.
    func sheetHeader(for edition: ComposerInlineEdit) -> ComposerSelectionSheetHeader {
        let temps = edition.purpose == .time
        let puces = ComposerInlineEditing.chips(edition.purpose, family: edition.family,
                                                served: host.inlineSections(for: edition.objectId, family: edition.family))
        return ComposerSelectionSheetHeader(
            title: ComposerSelectionCopy.label(temps ? .time : .modify),
            chips: puces,
            open: edition.openSection,
            extras: mediaExtras(for: edition),
            keyframes: temps && ComposerObjectTimeSheetRule.offersKeyframes(animated: host.sceneIsAnimated)
                ? { host.toggleSceneFrise() } : nil,
            onChip: { host.tapInlineSection($0) },
            onExtra: { performMediaExtra($0, on: edition.objectId) },
            onDone: { closeSheet() })
    }

    /// La feuille se referme ; l'élément reste sélectionné, sa barre revient.
    func closeSheet() {
        host.inlineEdit = nil
        host.comparingLookObjectId = nil
        HapticFeedback.light()
    }

    // MARK: - Ce que les feuilles Sticker et Lieu écrivent

    /// **Le sticker choisi remplace celui qu'on modifiait**, à sa place.
    /// Faux ⇒ rien à remplacer : le choix reste posé comme neuf.
    func replaceModifiedSticker(_ ancien: String?, with newId: String) -> Bool {
        guard let ancien else { return false }
        let remplacee = SceneStickerReplacement.replacing(ancien, with: newId, in: host.viewModel.currentSlide)
        guard remplacee.effects.stickerObjects?.contains(where: { $0.id == ancien }) == false else { return false }
        host.viewModel.currentSlide = remplacee
        selectSceneItem(newId)
        return true
    }

    /// **Le lieu choisi repointe la pastille modifiée** ; sans modification en
    /// cours, il reste le lieu du document.
    func repointModifiedPlace(to place: SharedPlace) -> Bool {
        guard let id = host.placeRepointId else { return false }
        host.placeRepointId = nil
        host.viewModel.currentSlide = ComposerPlaceRepoint.repointing(id, to: place, in: host.viewModel.currentSlide)
        selectSceneItem(id)
        return true
    }
}
