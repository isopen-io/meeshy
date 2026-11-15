import SwiftUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// **Le chrome du REPOS**, sorti de `ComposerSceneSurface` (budget de taille) : l'état
/// du repos, les rails, le volet de description et les mesures qui les cadrent.
extension ComposerSceneSurface {

    /// **Le chrome du repos, posé SUR la scène** (#13839, qui renverse #4561 et #4633). Le rail gauche, la colonne
    /// droite du repos, la barre haute et la rangée basse sont partis : ✕, la
    /// rangée des diapos, ↶ ↷ et les six boutons ronds se posent sur la scène,
    /// et `ComposerRestChrome` dit ce qui paraît, état par état.
    var restState: ComposerRestChrome.State {
        ComposerRestChrome.State(toolIsOpen: toolIsOpen,
                                 writesText: writing.writesText,
                                 cameraIsArmed: cameraStage != .off,
                                 bottomPanelIsOpen: band != nil || timelinePanel != nil || sceneEffectIsOpen,
                                 timelineIsOpen: timelinePanel != nil,
                                 objectIsSelected: selectionColumn != nil,
                                 propertiesAreOpen: propertiesSheet != nil,
                                 keyboardIsUp: editingTextId != nil,
                                 sheetIsRaised: anchoredSheetTop != nil)
    }

    /// La colonne droite ne sert plus le repos : ses effets de scène vivent
    /// dans ⋯. Elle reste pour un outil ouvert (hors dessin, qui a sa barre) ;
    /// un objet sélectionné a sa barre d'actions (L5).
    var trailingRailIsShown: Bool {
        guard ComposerToolFocus.isShown(.trailingRail, toolIsOpen: toolIsOpen, writesText: writesText),
              drawingBar == nil else { return false }
        let servesSomethingElse = trailingOptions.contains { entree in
            if case .sceneEffect = entree { return false }
            return true
        }
        return toolIsOpen || servesSomethingElse || !trailingActions.isEmpty
    }

    /// Le rail droit ne recueille ↶ ↷ que s'ils ne sont ni sur la scène, ni
    /// retirés avec elle quand elle se réduit (#14191).
    var historyIsOnTheScene: Bool {
        ComposerRestChrome.historyIsShown(restState) || ComposerRestChrome.historyIsWithdrawn(restState)
    }

    /// La trace du son de fond, la MÊME pour le repos et pour le rail libellé.
    var backgroundSoundTrace: ComposerSceneOverlayChrome.Sound {
        .init(trace: backgroundSound, onEdit: onEditBackgroundSound,
              onDelete: onDeleteBackgroundSound, onPromote: onPromoteBackgroundSound)
    }

    var railsLayer: some View {
        ComposerSceneRailsLayer(
            leading: ComposerLabeledRail(tools: restTools, moreEntries: rails.moreEntries, openEntry: rails.openEntry,
                                         onClose: onClose, onTool: { onRestTool?($0) },
                                         onMore: rails.onMore,
                                         plus: rails.plus,
                                         mediaLongPress: onRailDoorLongPress,
                                         sound: backgroundSoundTrace,
                                         pasteEntry: railSystemEntry, backgroundIsMedia: restBackgroundIsMedia,
                                         postText: restPostText),
            selection: ComposerSelectionRail(selection: nil, onUndo: onUndo, onRedo: onRedo),
            objectSelection: selectionColumn.map { ComposerSelectionRail(selection: $0) },
            selectionIsShown: !trailingRailIsShown,
            slideRow: slideRailSlot,
            showsSlideRow: showsRailsSlideRow,
            isServed: ComposerLabeledRailLayout.railsAreServed(writesText: writing.writesText || editingTextId != nil,
                                                               cameraIsArmed: cameraStage != .off))
    }

    /// Une feuille ancrée ouverte retire le repos (#13839, L3) : la scène
    /// réduite ne porte que ce qu'on édite.
    var restChrome: some View {
        restChromeContent
            // Le rail d'édition s'arrête au-dessus des propriétés : rien ne
            // recouvre la feuille basse.
            .padding(.bottom, propertiesSheet == nil ? 0 : lowerFloorsHeight)
            .opacity(restChromeServed ? 1 : 0)
            .allowsHitTesting(restChromeServed)
            .accessibilityHidden(!restChromeServed)
    }

    var restChromeContent: some View {
        ComposerSceneOverlayChrome(state: restState,
                                   slideRow: slideRailSlot,
                                   slideCount: slideCount,
                                   onClose: onClose,
                                   onUndo: onUndo,
                                   onRedo: onRedo,
                                   tools: restTools,
                                   onTool: onRestTool,
                                   mediaLongPress: onRailDoorLongPress,
                                   moreMenu: moreMenu,
                                   sound: backgroundSoundTrace,
                                   pasteEntry: railSystemEntry,
                                   backgroundIsMedia: restBackgroundIsMedia,
                                   postText: restPostText,
                                   selection: selectionColumn,
                                   sceneSideInset: restSceneSideInset,
                                   sceneTopInset: restSceneTopInset)
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { restChromeTop = $0 }
    }

    /// **Le volet de description, borné à la CARTE.**
    ///
    /// Les marges valent la place d'un rail de chaque côté (`lane`) : sans
    /// elles, le volet s'étalerait sur toute la largeur et croiserait les deux
    /// rails, qui flottent sur la scène à cette hauteur. Elles ne se lisent pas
    /// des couloirs (`sceneInset`), qui valent zéro avec la scène plein écran
    /// — le volet recouvrirait alors le bas des deux rails.
    @ViewBuilder
    var descriptionOverlay: some View {
        if let descriptionPanel {
            descriptionPanel
                .padding(.horizontal, ComposerRailGeometry.descriptionInset(roomy: isRoomy,
                                                                             cardLeading: sceneCardLeading))
                .padding(.bottom, MeeshySpacing.smPlus)
                .environment(\.composerSceneCardWidth, sceneCardWidth)
        }
    }

    var restChromeServed: Bool {
        ComposerSceneFraming.restChromeIsShown(sheetIsOpen: anchoredSheetTop != nil)
    }

    var restSceneTopInset: CGFloat {
        ComposerRestChrome.sceneTopInset(sceneTop: restSceneTop, chromeTop: restChromeTop)
    }

    /// Une feuille ou le clavier réduisent la scène au-delà du repos (#15226).
    var sceneIsReduced: Bool { ComposerRestChrome.sceneIsReduced(restState) }

    /// Une bande, la frise, les effets, la barre de dessin, les réglages d'un
    /// outil ou les propriétés d'un objet se posent par-dessus la scène : elle
    /// garde le bas du repos.
    var sceneIsOverlaid: Bool {
        ComposerSceneLift.overlaysScene(lowZone: lowZone, bottomPanelIsOpen: restState.bottomPanelIsOpen,
                                        drawingBarIsShown: drawingBar != nil)
    }

    /// Le bas du repos se relève quand rien n'occupe le bas et qu'on n'écrit pas.
    var floorsAreAtRest: Bool {
        lowZone == .nothing && !sceneIsOverlaid && !writing.writesText && editingTextId == nil
            && anchoredSheetTop == nil
    }

    /// Les marges verticales du rail droit : du haut de la carte, et au-dessus
    /// de la remontée tant que sa colonne y tient (`trailingRailBand`).
    var trailingBand: ComposerRailBand {
        let pied = [onUndo != nil, onRedo != nil, !toolIsOpen && onTimeButton != nil].filter { $0 }.count
        return ComposerRailGeometry.trailingRailBand(
            freeZone: freeZoneFrame, card: sceneCardFrame,
            columnHeight: ComposerRailGeometry.columnHeight(entries: trailingOptions.count + pied,
                                                            withSpring: !trailingFootFollowsOptions))
    }

    var lowZone: ComposerLowZone {
        ComposerLowZone.resolve(toolIsOpen: toolIsOpen, band: band, properties: propertiesSheet != nil)
    }
}
