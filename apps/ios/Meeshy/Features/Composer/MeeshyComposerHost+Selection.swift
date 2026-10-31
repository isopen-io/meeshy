import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// **La sélection d'un élément, côté meuble** (#13839, L5 ; #13957, #13974, R6).
//
// Toucher un élément le SÉLECTIONNE : le canvas l'encadre de pointillés, Fermer,
// l'audience et Publier se retirent, et le rail des outils cède sa place au
// rail d'édition — Modifier · Dupliquer · Temps · Retirer — puis, posés
// par-dessus, les sous-outils de l'option touchée ; leurs propriétés s'ouvrent
// en bas. L'objet passe au premier plan (#13918) : il n'y a pas d'action
// « Ordre ». Les règles vivent dans `ComposerSelectionActions` et
// `ComposerSelectionChrome` ; ce fichier leur fournit l'état du meuble et relaie
// chaque entrée vers la primitive qui existait déjà. Tant que rien n'est publié,
// tout reste mobile : aucune action n'aplatit la scène.
@MainActor
extension MeeshyComposerHost {
    var sceneSelectionRelay: ComposerSceneSelectionRelay { ComposerSceneSelectionRelay(host: self) }
}

/// Le relais de la sélection : il lit l'état du meuble et ne garde rien.
@MainActor
struct ComposerSceneSelectionRelay {
    let host: MeeshyComposerHost


    /// L'élément qui prend le chrome — un objet posé dès sa sélection, le fond
    /// seulement en édition ; `nil` pendant une frappe ou hors de la scène.
    var current: (id: String, family: ComposerInlineFamily)? {
        guard host.mountedComposerView == .scene, !host.sceneTypesInline,
              let id = host.selectedSceneItemId, let famille = host.inlineFamily(of: id),
              ComposerSelectionChrome.ownsChrome(family: famille, typing: false) else { return nil }
        return (id, famille)
    }

    /// **La pile des rails d'édition**, dérivée de la sélection et de
    /// l'édition en place : jamais recopiée.
    var stack: ComposerEditRailStack {
        guard let selection = current else { return .rest }
        return ComposerEditRailStack.of(family: selection.family, editing: host.activeInlineEdit?.purpose,
                                        typing: host.sceneTypesInline)
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

    /// **Le niveau du haut de la pile, remis à la surface** — `nil` ⇒ rien en
    /// édition : la colonne des outils, Fermer et Publier reparaissent.
    var column: ComposerSelectionColumn? {
        guard let selection = current, let niveau = stack.top else { return nil }
        let edition = host.activeInlineEdit
        let entrees = ComposerEditRailItems.items(
            for: niveau,
            actions: ComposerSelectionActions.served(family: selection.family, offered: offered(selection.id),
                                                     isLocked: isLocked(selection.id)),
            backgroundActions: backgroundActions(selection.id),
            sections: edition.map { ComposerInlineEditing.chips($0.purpose, family: $0.family,
                                                                served: host.inlineSections(for: $0.objectId,
                                                                                            family: $0.family)) } ?? [],
            extras: edition.map(mediaExtras(for:)) ?? [],
            keyframes: edition?.purpose == .time
                && ComposerObjectTimeSheetRule.offersKeyframes(animated: host.sceneIsAnimated))
        guard !entrees.isEmpty else { return nil }
        return ComposerSelectionColumn(level: niveau, items: entrees, openSection: edition?.openSection,
                                       onItem: { performRailItem($0) })
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

    /// **Retour** : la feuille, puis un niveau à la fois, puis l'édition.
    /// `rail` ⇒ le ‹ du rail, qui descend d'un niveau avec sa feuille.
    func goBack(rail: Bool = false) {
        let pile = stack
        let feuille = host.activeInlineEdit?.openSection != nil || host.backgroundSourcesAreOpen
        let issue = rail ? pile.railBack() : pile.back(propertiesAreOpen: feuille)
        switch issue {
        case .closeProperties:
            closeProperties()
        case .popLevel:
            host.inlineEdit = nil
            host.backgroundSourcesAreOpen = false
            host.comparingLookObjectId = nil
            HapticFeedback.light()
            UIAccessibility.post(notification: .announcement, argument: ComposerSelectionCopy.bar)
        case .leaveEditing:
            deselectSceneItem()
        case .nothing:
            break
        }
    }

    func deselectSceneItem() {
        guard host.selectedSceneItemId != nil || host.inlineEdit != nil else { return }
        host.inlineEdit = nil
        host.backgroundSourcesAreOpen = false
        host.backgroundReplacementId = nil
        host.comparingLookObjectId = nil
        host.selectedSceneItemId = nil
        host.selectedSceneItemKind = nil
        UIAccessibility.post(notification: .announcement, argument: ComposerSelectionCopy.deselected)
    }

    // MARK: - Les entrées du rail d'édition

    func performRailItem(_ item: ComposerEditRailItem) {
        guard let id = host.selectedSceneItemId else { return }
        switch item {
        case .action(let action):
            performSelectionAction(action, on: id)
        case .background(let action):
            performBackgroundAction(action, on: id)
        case .back:
            goBack(rail: true)
        case .section(let section):
            host.tapInlineSection(section)
        case .extra(let extra):
            performMediaExtra(extra, on: id)
        case .keyframes:
            host.toggleSceneFrise()
        }
    }

    /// **Retirer termine l'édition** : l'objet parti, le rail des outils,
    /// l'audience, Publier et Fermer reviennent — VoiceOver le dit.
    func performSelectionAction(_ action: ComposerSelectionAction, on id: String) {
        switch action {
        case .modify:    modifySceneItem(id)
        case .duplicate: duplicateSceneItem(id)
        case .time:      host.beginInlineEdit(id, purpose: .time); HapticFeedback.light()
        case .remove:
            host.handleTrailingRailAction(.delete)
            HapticFeedback.medium()
            deselectSceneItem()
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

    /// **L'en-tête de la feuille basse** : le réglage ouvert, et OK qui
    /// referme le niveau — la feuille, jamais l'édition.
    func propertiesHeader(for edition: ComposerInlineEdit) -> ComposerPropertiesHeader? {
        guard let section = edition.openSection else { return nil }
        return ComposerPropertiesHeader(title: ComposerObjectEditorCopy.entry(section),
                                        onDone: { goBack() })
    }

    /// **Les propriétés du sous-outil ouvert, EN BAS** (#13957, #13974) : la
    /// scène se réduit au-dessus, rien ne la recouvre. `nil` tant qu'aucun
    /// sous-outil n'est ouvert — le niveau du rail suffit — et pendant la
    /// frappe, où les options remplacent le CLAVIER (#13839, L4).
    var propertiesSheet: AnyView? {
        let sources = backgroundSourcesSheet
        let panel = sources == nil ? inlineToolPanel : nil
        guard sources != nil || panel != nil else { return nil }
        return AnyView(ComposerPropertiesSheetBody(sources: sources, panel: panel))
    }

    private var inlineToolPanel: ComposerInlineToolPanel? {
        guard !host.viewModel.isDrawingActive, !host.sceneTypesInline,
              let edition = host.activeInlineEdit, edition.openSection != nil else { return nil }
        let porteUnMedia: Bool
        switch edition.family {
        case .image, .video, .background: porteUnMedia = true
        case .text, .audio, .sticker, .place: porteUnMedia = false
        }
        return ComposerInlineToolPanel(
            viewModel: host.viewModel,
            edit: edition,
            section: edition.openSection,
            plateauTint: host.tint.color,
            altText: porteUnMedia ? host.mediaAltBinding(for: edition.objectId) : nil,
            header: propertiesHeader(for: edition),
            onSelectObject: { host.beginInlineEdit($0, section: .plan, purpose: edition.purpose) },
            onCompareLook: { host.comparingLookObjectId = $0 ? edition.objectId : nil })
    }

    /// Audience et Publier, par la loi de la sélection : ni pendant un outil,
    /// ni pendant une édition.
    func publicationIsShown(toolOwnsScreen: Bool) -> Bool {
        ComposerSelectionChrome.publicationIsShown(toolOwnsScreen: toolOwnsScreen, objectIsSelected: stack.isEditing)
    }

    /// La feuille se referme ; le niveau qui l'a ouverte reste posé.
    func closeProperties() {
        if host.backgroundSourcesAreOpen {
            host.backgroundSourcesAreOpen = false
            HapticFeedback.light()
            return
        }
        guard let edition = host.activeInlineEdit, edition.openSection != nil else { return }
        host.inlineEdit = ComposerInlineEdit(objectId: edition.objectId, family: edition.family,
                                             openSection: nil, purpose: edition.purpose)
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
