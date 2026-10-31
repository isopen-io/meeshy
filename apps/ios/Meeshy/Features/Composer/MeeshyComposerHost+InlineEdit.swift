import SwiftUI
import MeeshySDK
import MeeshyUI

// **Éditer un objet sans quitter la scène** (#9138, directive porteur
// 2026-10-02 ; le fond l'avait inauguré au #8847) — le meuble fournit l'état à
// `ComposerInlineEditing` et relaie ses verdicts : le rail droit porte les
// sous-outils de l'objet, leurs options s'ouvrent à droite depuis le haut, et
// tout le reste du chrome cède jusqu'au `(x)`.
@MainActor
extension MeeshyComposerHost {

    /// Le fond MÉDIA de la slide courante — image ou vidéo.
    var sceneBackgroundMedia: StoryMediaObject? {
        viewModel.currentSlide.effects.resolvedBackgroundMedia
    }

    /// La famille d'un objet de la slide courante ; `nil` s'il n'y est plus.
    func inlineFamily(of id: String) -> ComposerInlineFamily? {
        guard let objet = viewModel.currentSlide.sceneObject(id: id) else { return nil }
        let estVideo: Bool
        if case .media(let media) = objet {
            estVideo = media.kind == .video
        } else {
            estVideo = false
        }
        return ComposerInlineFamily.of(kind: objet.kind,
                                       isVideo: estVideo,
                                       isBackground: id == sceneBackgroundMedia?.id)
    }

    /// Les sous-outils que CET objet sert.
    func inlineSections(for id: String, family: ComposerInlineFamily) -> [ComposerObjectEditorSection] {
        ComposerInlineEditing.sections(for: family,
                                       hasTrimmableSource: viewModel.sourceTrim(id: id) != nil)
    }

    /// L'édition RÉELLEMENT en cours — elle se referme dès que sa sélection,
    /// son objet ou sa famille ne sont plus là.
    var activeInlineEdit: ComposerInlineEdit? {
        guard let edition = inlineEdit else { return nil }
        let famille = inlineFamily(of: edition.objectId)
        return ComposerInlineEditing.resolved(
            edition,
            selectedId: selectedSceneItemId,
            family: famille,
            served: famille.map { inlineSections(for: edition.objectId, family: $0) } ?? [],
            onSceneSurface: mountedComposerView == .scene)
    }

    /// **LE site qui met un objet en édition en place** — création, toucher,
    /// double-toucher, « Modifier », menu du fond, jetons, rognage : toutes les
    /// portes y mènent par `openObjectEditor` ou directement. Rend `true` quand
    /// la demande a été prise : l'ancien éditeur plein écran ne s'ouvre alors
    /// pas. Rouvrir l'objet déjà édité garde son sous-outil ouvert, sauf si la
    /// porte en désigne un autre.
    @discardableResult
    func beginInlineEdit(_ id: String, section: ComposerObjectEditorSection? = nil,
                         purpose: ComposerInlineEditPurpose = .modify) -> Bool {
        guard let famille = inlineFamily(of: id) else { return false }
        let memeFeuille = activeInlineEdit?.objectId == id && activeInlineEdit?.purpose == purpose
        let gardee = memeFeuille ? activeInlineEdit?.openSection : nil
        guard let edition = ComposerInlineEditing.begin(
            objectId: id,
            family: famille,
            onSceneSurface: mountedComposerView == .scene,
            requested: section ?? gardee,
            hasTrimmableSource: viewModel.sourceTrim(id: id) != nil,
            purpose: purpose) else { return false }
        let nouvelle = activeInlineEdit?.objectId != id
        presentedPortal = nil
        openSceneEffect = nil
        selectedSceneItemId = id
        selectedSceneItemKind = Self.canvasKind(famille.sceneKind)
        inlineEdit = edition
        if nouvelle {
            UIAccessibility.post(notification: .announcement, argument: ComposerInlineEditCopy.entered(famille))
        }
        return true
    }

    /// Toucher un sous-outil ouvre ses options à droite ; le retoucher les
    /// range.
    func tapInlineSection(_ section: ComposerObjectEditorSection) {
        guard let edition = activeInlineEdit else { return }
        inlineEdit = ComposerInlineEditing.tapped(section, in: edition)
        HapticFeedback.light()
    }

    /// **Le `(x)` rend la gestion de la scène** — audience, publication,
    /// en-tête, frise et portes reviennent ensemble. La saisie d'un texte se
    /// termine avec lui : c'est le MODÈLE qui décide du sort d'une coquille
    /// vide (il la supprime).
    func leaveInlineEdit() {
        if viewModel.textEditingMode.activeTextId != nil {
            keyboardDock.end()
            dismissTextEditing()
            viewModel.exitTextEditingMode()
        }
        inlineEdit = nil
        comparingLookObjectId = nil
        selectedSceneItemId = nil
        selectedSceneItemKind = nil
        HapticFeedback.light()
        UIAccessibility.post(notification: .announcement, argument: ComposerInlineEditCopy.left)
    }

    /// Les options du PINCEAU, remises à la surface (#9145) : le dessin
    /// capture le doigt sur toute la scène, ses réglages se posent contre sa
    /// barre. Les propriétés d'un objet, elles, vivent en bas
    /// (`ComposerSceneSelectionRelay.propertiesSheet`).
    var sceneInlinePanel: AnyView? {
        if viewModel.isDrawingActive { return sceneDrawingOptionsPanel }
        return nil
    }

    /// **Les options du pinceau, au-dessus de la barre de dessin** (#9145,
    /// #13839 : la barre est en bas, son panneau s'ouvre contre elle) — la plaque
    /// de l'édition en place, avec le panneau d'options du SDK : le contrôleur
    /// touché dans la barre s'y déplie, la scène ne remonte plus.
    var sceneDrawingOptionsPanel: AnyView? {
        guard ComposerFirstView.trailingPanelShowsDrawingOptions(
            drawing: viewModel.isDrawingActive,
            expandedTool: viewModel.drawingEditingMode.expandedTool != nil,
            strokeSelected: viewModel.drawingEditingMode.selectedStrokeId != nil) else { return nil }
        return AnyView(ComposerTrailingOptionsPlate(plateauTint: tint.color, preferredEdge: .bottom) {
            MeeshyToolOptionsPanel(viewModel: viewModel)
        })
    }

    /// Le pied du rail droit suit-il ses sous-outils, sans ressort ?
    var sceneTrailingFootFollowsOptions: Bool {
        ComposerTrailingColumn.footFollowsOptions(for: sceneTrailingFocus)
    }
}
