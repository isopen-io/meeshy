import SwiftUI
import MeeshySDK
import MeeshyUI

// **Fond › Modifier, en rails superposés** (#13974, lot I-E2, grammaire
// d'édition § 1). N1 prend le rail à la place du niveau « Fond », N2 se pose
// par-dessus (Réglages, Effets, Son), N3 et les bandes s'ouvrent en bas. Le
// meuble ne garde que le CHEMIN (`ComposerInlineEdit.background`) ; la loi est
// `ComposerBackgroundModify`, chaque entrée retombe sur l'écrivain qui existait.
@MainActor
extension ComposerSceneSelectionRelay {

    /// Le chemin sous « Modifier » du fond sélectionné ; fermé ailleurs.
    var backgroundModifyPath: ComposerBackgroundModifyPath {
        guard let edition = host.activeInlineEdit, edition.family.isBackground, edition.purpose == .modify else {
            return .closed
        }
        return edition.background
    }

    func setBackgroundModifyPath(_ path: ComposerBackgroundModifyPath) {
        guard var edition = host.inlineEdit else { return }
        edition.background = path
        host.inlineEdit = edition
    }

    /// N1 de CE fond — vide hors de « Modifier » d'un fond.
    func backgroundEntries(_ edition: ComposerInlineEdit?) -> [ComposerBackgroundModifyEntry] {
        guard let edition, edition.purpose == .modify, case .background(let video) = edition.family else { return [] }
        return ComposerBackgroundModify.served(isVideo: video,
                                               hasTrimmableSource: host.viewModel.sourceTrim(id: edition.objectId) != nil)
    }

    /// Les réglages de N2 que ce fond peint.
    func backgroundAdjustments(_ level: ComposerEditRailLevel) -> [AdjustmentKind] {
        guard case .backgroundAdjust(let famille) = level,
              case .background(let video)? = host.activeInlineEdit?.family else { return [] }
        return ComposerBackgroundModify.adjustments(famille, isVideo: video)
    }

    /// Ce que le rail allume : l'entrée ouverte, le réglage dont le curseur est
    /// ouvert, Muet quand le son du fond est coupé.
    func backgroundLit(_ edition: ComposerInlineEdit?) -> Set<ComposerEditRailItem> {
        guard let edition, edition.family.isBackground else { return [] }
        let chemin = edition.background
        let entree = chemin.entry.map { [ComposerEditRailItem.backgroundEntry($0)] } ?? []
        let reglage = chemin.adjustment.map { [ComposerEditRailItem.adjustment($0)] } ?? []
        let muet = backgroundMedia(edition.objectId)?.isMuted == true ? [ComposerEditRailItem.mute] : []
        return Set(entree + reglage + muet)
    }

    func performBackgroundModify(_ entree: ComposerBackgroundModifyEntry, on id: String) {
        switch entree {
        case .rotate:
            host.viewModel.rotateMedia(id: id)
        case .loop:
            break
        case .framing, .crop, .trim, .filters, .frames, .adjust, .effects, .sound, .description:
            setBackgroundModifyPath(ComposerBackgroundModify.tapped(entree, in: backgroundModifyPath))
            host.comparingLookObjectId = nil
        }
        HapticFeedback.light()
    }

    func performBackgroundAdjustment(_ kind: AdjustmentKind) {
        setBackgroundModifyPath(ComposerBackgroundModify.tapped(adjustment: kind, in: backgroundModifyPath))
        host.comparingLookObjectId = nil
        HapticFeedback.light()
    }

    /// Le ‹ de N2 : le niveau part, son curseur avec lui.
    func popBackgroundModifyLevel() {
        setBackgroundModifyPath(.closed)
        host.comparingLookObjectId = nil
    }

    /// OK de la feuille basse : N3 se range d'abord, puis la feuille.
    func closeBackgroundModifyProperties() -> Bool {
        let chemin = backgroundModifyPath
        guard ComposerBackgroundModify.propertiesAreOpen(chemin) else { return false }
        setBackgroundModifyPath(ComposerBackgroundModify.back(chemin))
        host.comparingLookObjectId = nil
        HapticFeedback.light()
        return true
    }

    /// **Ce que « Modifier » du fond ouvre en bas** ; `nil` tant qu'aucune
    /// bande, feuille ni curseur n'est ouvert.
    var backgroundModifySheet: ComposerBackgroundModifySheet? {
        let chemin = backgroundModifyPath
        guard ComposerBackgroundModify.propertiesAreOpen(chemin), let edition = host.activeInlineEdit else {
            return nil
        }
        let titre = chemin.adjustment.map(ComposerAdjustCopy.label)
            ?? chemin.entry.flatMap { ComposerBackgroundModify.entry($0) }.map(ComposerEditTreeCopy.label) ?? ""
        let hote = host
        return ComposerBackgroundModifySheet(
            viewModel: host.viewModel,
            mediaId: edition.objectId,
            path: chemin,
            plateauTint: host.tint.color,
            header: ComposerPropertiesHeader(title: titre, onDone: { goBack() }),
            altText: host.mediaAltBinding(for: edition.objectId),
            framing: .init(fitMode: host.sceneFitMode, backdrop: host.sceneBackdrop,
                           onPickFitMode: { hote.applySceneFitMode($0) },
                           onPickBackdrop: { hote.applySceneBackdrop($0) }),
            onCompare: { hote.comparingLookObjectId = $0 ? edition.objectId : nil })
    }

    private func backgroundMedia(_ id: String) -> StoryMediaObject? {
        host.viewModel.currentEffects.mediaObjects?.first { $0.id == id }
    }
}
