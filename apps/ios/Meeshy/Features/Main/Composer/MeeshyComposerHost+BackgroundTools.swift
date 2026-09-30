import SwiftUI
import MeeshySDK
import MeeshyUI

// **Éditer le FOND sans quitter la scène** (#8847, directive porteur
// 2026-09-30) — le meuble fournit l'état à `ComposerBackgroundTools` et relaie
// ses verdicts : le rail droit porte les outils du fond, leurs contrôles
// prennent le bas de la scène, et tout le reste du chrome cède jusqu'au `(x)`.
@MainActor
extension MeeshyComposerHost {

    /// Le fond MÉDIA de la slide courante — image ou vidéo.
    var sceneBackgroundMedia: StoryMediaObject? {
        viewModel.currentSlide.effects.resolvedBackgroundMedia
    }

    /// Les outils que CE fond sert en ligne.
    var sceneBackgroundTools: [ComposerObjectEditorSection] {
        guard let fond = sceneBackgroundMedia else { return [] }
        return ComposerBackgroundTools.sections(isVideo: fond.kind == .video,
                                                hasTrimmableSource: viewModel.sourceTrim(id: fond.id) != nil)
    }

    /// L'édition du fond RÉELLEMENT en cours — elle se referme dès que son
    /// fond n'est plus celui de la scène.
    var activeBackgroundEdit: ComposerBackgroundEdit? {
        ComposerBackgroundTools.resolved(backgroundEdit,
                                         backgroundId: sceneBackgroundMedia?.id,
                                         onSceneSurface: mountedComposerView == .scene)
    }

    /// **Le site unique d'ouverture rend le fond aux outils en ligne.** Rend
    /// `true` quand la demande a été prise : l'ancien éditeur plein écran ne
    /// s'ouvre alors pas.
    func backgroundToolsRedirect(_ id: String, section: ComposerObjectEditorSection?) -> Bool {
        guard let edition = ComposerBackgroundTools.redirect(
            objectId: id,
            isBackground: id == sceneBackgroundMedia?.id,
            onSceneSurface: mountedComposerView == .scene,
            requested: section,
            served: sceneBackgroundTools) else { return false }
        presentedPortal = nil
        openSceneEffect = nil
        selectedSceneItemId = id
        selectedSceneItemKind = .media
        backgroundEdit = edition
        UIAccessibility.post(notification: .announcement, argument: ComposerBackgroundToolsCopy.entered)
        return true
    }

    /// Toucher un outil du fond ouvre ses contrôles sous la scène ; le
    /// retoucher les range.
    func tapBackgroundTool(_ section: ComposerObjectEditorSection) {
        guard let edition = activeBackgroundEdit else { return }
        backgroundEdit = ComposerBackgroundTools.tapped(section, in: edition)
        HapticFeedback.light()
    }

    /// **Le `(x)` rend la gestion de la scène** — audience, publication,
    /// en-tête, frise et portes reviennent ensemble.
    func leaveBackgroundEdit() {
        backgroundEdit = nil
        selectedSceneItemId = nil
        selectedSceneItemKind = nil
        HapticFeedback.light()
        UIAccessibility.post(notification: .announcement, argument: ComposerBackgroundToolsCopy.left)
    }

    /// Les contrôles de l'outil ouvert, remis à la surface comme ceux d'un
    /// outil du rail — elle les pose sur sa plaque de verre, sous la scène.
    var sceneBackgroundToolPanel: AnyView? {
        guard let edition = activeBackgroundEdit,
              let section = edition.openSection,
              let fond = sceneBackgroundMedia else { return nil }
        return AnyView(ComposerBackgroundToolPanel(viewModel: viewModel,
                                                   section: section,
                                                   media: fond,
                                                   altText: mediaAltBinding(for: fond.id)))
    }
}
