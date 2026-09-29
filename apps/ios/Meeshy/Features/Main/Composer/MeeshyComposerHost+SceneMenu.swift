import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le menu d'appui long de la scène, peint en verre par le meuble** (#8717).
//
// Deux demandes, un calque : l'appui long d'un OBJET (le canvas remet l'objet
// et le point du doigt, `sceneObjectMenu`) et celui du FOND
// (`backgroundMenuObjectId`, #5041). Les entrées viennent des inventaires qui
// décidaient déjà des deux menus système ; chaque geste retombe sur la
// primitive qu'ils appelaient.
@MainActor
extension MeeshyComposerHost {

    /// La demande en cours — le fond d'abord : son appui long est le plus
    /// récent geste possible quand les deux se croisent, puisqu'un objet
    /// touché masque le fond sous le doigt.
    var presentedSceneMenu: ComposerSceneMenuRequest? {
        if let id = backgroundMenuObjectId {
            return ComposerSceneMenuRequest(target: .background(id: id))
        }
        return sceneObjectMenu
    }

    func dismissSceneMenu() {
        backgroundMenuObjectId = nil
        sceneObjectMenu = nil
    }

    func sceneMenuEntries(_ target: ComposerSceneMenuTarget) -> [ComposerSceneMenu.Entry] {
        switch target {
        case .object(let id, let kind):
            return ComposerSceneMenu.entries(objectActions: ComposerTrailingRailPolicy.actions(
                slide: viewModel.currentSlide,
                selectedId: id,
                served: ComposerTrailingColumn.servedActions,
                hasEditor: ComposerSceneSurface.defaultEditableSceneKinds.contains(kind),
                canLeaveScene: false))
        case .background:
            return ComposerSceneMenu.entries(backgroundActions: ComposerBackgroundMenuAction.served)
        }
    }

    @ViewBuilder
    func sceneMenuLayer(_ demande: ComposerSceneMenuRequest,
                        card: CGRect,
                        container: CGSize) -> some View {
        let entrees = sceneMenuEntries(demande.target)
        let cadre = ComposerSceneMenu.frame(
            anchor: ComposerSceneMenu.screenPoint(demande.anchor, card: card),
            menu: sceneMenuSize == .zero
                ? CGSize(width: ComposerSceneMenu.width, height: CGFloat(entrees.count) * 44 + 8)
                : sceneMenuSize,
            container: container,
            margin: ComposerSceneMenu.margin)
        ZStack(alignment: .topLeading) {
            // Le voile ne se lit pas : il referme le menu d'un toucher hors de
            // lui, comme le menu système qu'il remplace.
            Color.black.opacity(0.18)
                .contentShape(Rectangle())
                .onTapGesture { dismissSceneMenu() }
                .accessibilityHidden(true)
            if !entrees.isEmpty {
                ComposerSceneContextMenu(
                    title: sceneMenuTitle(demande.target),
                    entries: entrees,
                    plateauTint: tint.color,
                    onSelect: { applySceneMenu($0, target: demande.target) },
                    onDismiss: { dismissSceneMenu() })
                    .fixedSize(horizontal: false, vertical: true)
                    .background {
                        GeometryReader { geo in
                            Color.clear.preference(key: ComposerSceneMenuSizeKey.self, value: geo.size)
                        }
                    }
                    .offset(x: cadre.minX, y: cadre.minY)
                    .transition(.scale(scale: 0.92, anchor: .top).combined(with: .opacity))
            }
        }
        .frame(width: container.width, height: container.height, alignment: .topLeading)
        .onPreferenceChange(ComposerSceneMenuSizeKey.self) { sceneMenuSize = $0 }
    }

    private func sceneMenuTitle(_ target: ComposerSceneMenuTarget) -> String? {
        switch target {
        case .object:     return nil
        case .background: return ComposerBackgroundMenuCopy.title()
        }
    }

    /// **Chaque entrée retombe sur la primitive qui existait.** Un objet est
    /// sélectionné d'abord : l'action le vise, et ses options paraissent à
    /// droite une fois le menu refermé (#8714).
    func applySceneMenu(_ entree: ComposerSceneMenu.Entry, target: ComposerSceneMenuTarget) {
        switch (entree, target) {
        case (.background(let action), .background):
            applyBackgroundMenu(action)
        case (.object(let action), .object(let id, let kind)):
            sceneObjectMenu = nil
            selectedSceneItemId = id
            selectedSceneItemKind = kind
            switch action {
            case .edit: editSceneItem(id, kind: kind)
            default:    handleTrailingRailAction(action)
            }
        default:
            break
        }
        dismissSceneMenu()
    }
}

/// La taille mesurée du menu — sa hauteur suit le Dynamic Type.
struct ComposerSceneMenuSizeKey: PreferenceKey {
    static let defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        let suivant = nextValue()
        if suivant != .zero { value = suivant }
    }
}
