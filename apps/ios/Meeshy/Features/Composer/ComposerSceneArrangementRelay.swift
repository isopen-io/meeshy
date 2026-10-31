import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Grand écran : la place libre décide (#13839, L6)

/// **La sonde du conteneur et le raccourci Échap**, en UN modificateur nommé : le meuble mesure sa racine (le
/// clavier ne la rétrécit pas, sinon la disposition basculerait à chaque frappe), la loi rejoue la disposition à la
/// rotation, en Split View et en Stage Manager, et l'état ne bouge pas — seule la géographie change.
struct ComposerSceneArrangementProbe: ViewModifier {
    let host: MeeshyComposerHost

    private var relay: ComposerSceneArrangementRelay { ComposerSceneArrangementRelay(host: host) }

    func body(content: Content) -> some View {
        content
            .background {
                GeometryReader { geo in
                    Color.clear
                        .onAppear { relay.arrange(in: geo.size) }
                        .adaptiveOnChange(of: geo.size) { _, taille in relay.arrange(in: taille) }
                }
                .ignoresSafeArea(.keyboard)
            }
            .adaptiveOnChange(of: host.dynamicTypeSize) { _, _ in relay.arrange(in: host.sceneLayout.containerSize) }
            .background {
                Button(ComposerHardwareKeysCopy.escape) { relay.handleEscapeKey() }
                    .keyboardShortcut(.cancelAction)
                    .frame(width: 0, height: 0)
                    .opacity(0)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
    }
}

/// **Le relais du grand écran** : il lit l'état du meuble, le remet à la loi et ne garde rien — comme celui de la
/// sélection, il vit hors du type du meuble.
@MainActor
struct ComposerSceneArrangementRelay {
    let host: MeeshyComposerHost

    func arrange(in taille: CGSize) {
        let suivante = ComposerSceneLayoutState(
            arrangement: ComposerSceneArrangement.served(width: taille.width, height: taille.height,
                                                         previous: host.sceneLayout.arrangement,
                                                         accessibilityText: host.dynamicTypeSize.isAccessibilitySize),
            containerSize: taille)
        guard suivante != host.sceneLayout else { return }
        host.sceneLayout = suivante
    }

    var hasRails: Bool { host.mountedComposerView == .scene && host.sceneLayout.arrangement == .rails }

    /// Publier sous la scène, à sa largeur ou au moins à 300 pt ; ailleurs, toute la largeur.
    var publishWidth: CGFloat {
        guard hasRails else { return .infinity }
        return ComposerSceneArrangement.publishWidth(width: host.sceneLayout.containerSize.width,
                                                     height: host.sceneLayout.containerSize.height)
    }

    /// Les feuilles se posent SOUS la scène, dans sa colonne, sans couvrir les rails.
    var sheetWidth: CGFloat {
        guard hasRails else { return .infinity }
        return ComposerSceneArrangement.columnWidth(width: host.sceneLayout.containerSize.width)
    }

    var socleHorizontalPadding: CGFloat {
        if hasRails { return 0 }
        if host.mountedComposerView == .scene { return 14 }
        return host.horizontalSizeClass == .regular ? ComposerRailGeometry.roomyMargin : 14
    }

    // MARK: - Ce que la surface reçoit

    var surfaceRails: ComposerSceneRailsContext {
        ComposerSceneRailsContext(
            arrangement: host.sceneLayout.arrangement,
            moreEntries: host.sceneMoreEntries,
            onMore: { host.performMore($0) },
            plus: ComposerRailPlusActions(isAnimated: host.sceneIsAnimated,
                                          clearAllAsked: host.$sceneClearAllAsked,
                                          onClearAll: { host.perform(.clearAll) },
                                          onAnimation: { host.toggleSceneAnimation() },
                                          onTimeline: { host.toggleSceneFrise() }),
            openEntry: ComposerLabeledRailLayout.openEntry(
                drawing: host.viewModel.isDrawingActive,
                typing: host.sceneTypesInline,
                portal: host.presentedPortal,
                band: ComposerSceneBand.opened(host.requestedSceneBand, served: host.openableSceneBands),
                effect: host.activeSceneEffect))
    }

    // MARK: - Le clavier matériel

    var panelIsOpen: Bool {
        host.anchoredPortal != nil || host.requestedSceneBand != nil || host.openSceneEffect != nil
            || host.viewModel.timelineIsOpen
    }

    func handleEscapeKey() {
        let outil = host.viewModel.isDrawingActive || host.viewModel.textEditingMode.activeTextId != nil
        switch ComposerHardwareKeys.escape(sheetIsOpen: panelIsOpen,
                                           cameraIsArmed: host.sceneCameraStage != .off,
                                           toolIsOpen: outil,
                                           objectIsSelected: host.selectedSceneItemId != nil) {
        case .closeSheet: closePanel()
        case .leaveViewfinder: host.disarmSceneCamera()
        case .endTool: host.handleRailExitTool()
        case .deselect: host.sceneSelectionRelay.deselectSceneItem()
        case .close: host.requestComposerClose()
        }
    }

    func closePanel() {
        if host.anchoredPortal != nil { return host.closeAnchoredSheet() }
        if host.viewModel.timelineIsOpen { return host.toggleSceneFrise() }
        host.requestedSceneBand = nil
        host.openSceneEffect = nil
    }
}

/// La disposition en place et la taille du conteneur qui l'a décidée, que le meuble garde.
struct ComposerSceneLayoutState: Equatable {
    var arrangement: ComposerSceneArrangement = .overlay
    var containerSize: CGSize = .zero
}

/// Ce que la surface de scène reçoit du grand écran : la disposition, et de quoi peupler le rail gauche.
struct ComposerSceneRailsContext {
    var arrangement: ComposerSceneArrangement = .overlay
    var moreEntries: [ComposerMoreMenuEntry] = []
    var onMore: (ComposerMoreMenuEntry) -> Void = { _ in }
    var plus: ComposerRailPlusActions?
    var openEntry: ComposerLabeledRailEntry?
}
