import SwiftUI
import MeeshySDK
import MeeshyUI

// **Fond › Modifier et image posée › Modifier, en rails superposés** (#13974,
// lots I-E2, I-E3 et I-E4, grammaire d'édition § 1). N1 prend le rail à la place du
// niveau « Fond » ou de la sélection, N2 se pose par-dessus (Réglages, Effets,
// Son), N3 et les bandes s'ouvrent en bas. Le meuble ne garde que le CHEMIN
// (`ComposerInlineEdit.modifyPath`) ; la loi est `ComposerBackgroundModify`,
// chaque entrée retombe sur l'écrivain qui existait.
@MainActor
extension ComposerSceneSelectionRelay {

    /// Le chemin sous « Modifier » du fond ou de l'image posée sélectionnés ;
    /// fermé ailleurs.
    var backgroundModifyPath: ComposerBackgroundModifyPath {
        guard let edition = host.activeInlineEdit, edition.family.modifiesInLevels, edition.purpose == .modify else {
            return .closed
        }
        return edition.modifyPath
    }

    func setBackgroundModifyPath(_ path: ComposerBackgroundModifyPath) {
        guard var edition = host.inlineEdit else { return }
        edition.modifyPath = path
        host.inlineEdit = edition
    }

    /// Les outils de CET objet, posés à plat dès sa sélection (#14048) — vides
    /// pour une famille qui garde ses sections.
    func backgroundEntries(id: String, family: ComposerInlineFamily) -> [ComposerBackgroundModifyEntry] {
        guard family.modifiesInLevels else { return [] }
        let rognable = host.viewModel.sourceTrim(id: id) != nil
        guard !family.isBackground else {
            return ComposerBackgroundModify.served(isVideo: family.isVideo, hasTrimmableSource: rognable)
        }
        let extras = mediaExtras(for: ComposerInlineEdit(objectId: id, family: family, openSection: nil))
        let fond: ComposerPlacedBackgroundOffer = extras.contains(.replaceBackground) ? .replace
            : extras.contains(.setAsBackground) ? .set : .none
        return ComposerBackgroundModify.servedPlaced(isVideo: family.isVideo, hasTrimmableSource: rognable,
                                                     background: fond, makesSticker: extras.contains(.makeSticker))
    }

    /// Les réglages de N2 que cet objet peint.
    func backgroundAdjustments(_ level: ComposerEditRailLevel) -> [AdjustmentKind] {
        guard case .backgroundAdjust(let famille) = level,
              let edition = host.activeInlineEdit, edition.family.modifiesInLevels else { return [] }
        return ComposerBackgroundModify.adjustments(famille, isVideo: edition.family.isVideo)
    }

    /// Ce que le rail allume : l'entrée ouverte, le réglage ou le Volume dont
    /// le curseur est ouvert, Muet quand le son de la vidéo est coupé.
    func backgroundLit(id: String, family: ComposerInlineFamily) -> Set<ComposerEditRailItem> {
        guard family.modifiesInLevels else { return [] }
        let chemin = backgroundModifyPath
        let entree = chemin.entry.map { [ComposerEditRailItem.backgroundEntry($0)] } ?? []
        let reglage = chemin.adjustment.map { [ComposerEditRailItem.adjustment($0)] } ?? []
        let volume = chemin.volume ? [ComposerEditRailItem.volume] : []
        let muet = backgroundMedia(id)?.isMuted == true ? [ComposerEditRailItem.mute] : []
        return Set(entree + reglage + volume + muet)
    }

    /// Un outil touché à plat ouvre l'édition en place de l'objet, si elle ne
    /// l'est pas : c'est elle qui tient le chemin.
    func holdModifyPath(on id: String) {
        guard host.activeInlineEdit?.objectId != id || host.activeInlineEdit?.purpose != .modify else { return }
        host.backgroundSourcesAreOpen = false
        host.beginInlineEdit(id, purpose: .modify)
    }

    func performBackgroundModify(_ entree: ComposerBackgroundModifyEntry, on id: String) {
        holdModifyPath(on: id)
        switch entree {
        case .rotate:
            host.viewModel.rotateMedia(id: id)
        case .loop:
            break
        case .setAsBackground, .replaceBackground:
            performMediaExtra(.setAsBackground, on: id)
            return
        case .makeSticker:
            performMediaExtra(.makeSticker, on: id)
            return
        case .framing, .crop, .trim, .filters, .frames, .adjust, .effects, .sound, .description:
            setBackgroundModifyPath(ComposerBackgroundModify.tapped(entree, in: backgroundModifyPath))
            host.comparingLookObjectId = nil
        }
        HapticFeedback.light()
    }

    func performBackgroundAdjustment(_ kind: AdjustmentKind, on id: String) {
        holdModifyPath(on: id)
        setBackgroundModifyPath(ComposerBackgroundModify.tapped(adjustment: kind, in: backgroundModifyPath))
        host.comparingLookObjectId = nil
        HapticFeedback.light()
    }

    /// Volume, dans N2 « Son » : son curseur seul s'ouvre en bas.
    func performBackgroundVolume(on id: String) {
        holdModifyPath(on: id)
        setBackgroundModifyPath(ComposerBackgroundModify.tappedVolume(in: backgroundModifyPath))
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
        let curseur = chemin.volume ? ComposerMediaSound.entry(.volume).map(ComposerEditTreeCopy.label) : nil
        let titre = chemin.adjustment.map(ComposerAdjustCopy.label) ?? curseur
            ?? chemin.entry.flatMap { ComposerBackgroundModify.entry($0) }.map(ComposerEditTreeCopy.label) ?? ""
        let hote = host
        return ComposerBackgroundModifySheet(
            viewModel: host.viewModel,
            mediaId: edition.objectId,
            isBackground: edition.family.isBackground,
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
