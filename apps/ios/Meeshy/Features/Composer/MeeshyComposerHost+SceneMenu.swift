import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le menu d'appui long de la scène, peint en verre par le meuble** (#8717).
//
// Une demande, un calque : l'appui long d'un OBJET (le canvas remet l'objet et
// le point du doigt, `sceneObjectMenu`). Le FOND n'y entre plus : son appui
// long le sélectionne et pose le niveau « Fond » dans le rail (#13974, I-E1).
@MainActor
extension MeeshyComposerHost {

    /// **Le menu, monté sur la PILE et non sur la racine** : SwiftUI n'honore
    /// qu'UNE présentation par vue, et la racine porte déjà la feuille de
    /// partage (#4996). Il lit la place de la carte à la même source que le
    /// viseur (`ComposerSceneCameraFrameKey`). La confirmation du retrait du
    /// fond s'y monte aussi.
    func sceneMenuPresented<Contenu: View>(_ contenu: Contenu) -> some View {
        backgroundRemovalConfirmed(contenu.overlayPreferenceValue(ComposerSceneCameraFrameKey.self) { ancre in
            GeometryReader { proxy in
                if let demande = presentedSceneMenu, let ancre {
                    sceneMenuLayer(demande, card: proxy[ancre], container: proxy.size)
                }
            }
            .animation(.spring(response: 0.28, dampingFraction: 0.86), value: presentedSceneMenu)
        })
    }

    var presentedSceneMenu: ComposerSceneMenuRequest? { sceneObjectMenu }

    func dismissSceneMenu() {
        sceneObjectMenu = nil
    }

    func sceneMenuEntries(_ target: ComposerSceneMenuTarget) -> [ComposerSceneMenu.Entry] {
        switch target {
        case .object(let id, _):
            // **Un raccourci de la barre, rien de plus** (#13839, L5) : le menu
            // ne sert que ce que la barre de la sélection sert.
            guard let famille = inlineFamily(of: id) else { return [] }
            return ComposerSceneMenu.entries(objectActions: ComposerSelectionActions.menuActions(
                family: famille, offered: sceneSelectionRelay.offered(id), isLocked: sceneSelectionRelay.isLocked(id)))
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
                    title: nil,
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

    /// **Chaque entrée retombe sur la primitive qui existait.** Un objet est
    /// sélectionné d'abord : l'action le vise, et ses options paraissent à
    /// droite une fois le menu refermé (#8714).
    func applySceneMenu(_ entree: ComposerSceneMenu.Entry, target: ComposerSceneMenuTarget) {
        switch (entree, target) {
        case (.object(let action), .object(let id, let kind)):
            sceneObjectMenu = nil
            selectedSceneItemId = id
            selectedSceneItemKind = kind
            sceneSelectionRelay.applyMenuShortcut(action, on: id, kind: kind)
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
