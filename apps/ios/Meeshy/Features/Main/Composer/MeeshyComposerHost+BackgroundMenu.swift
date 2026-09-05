import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le menu du FOND — trois actions, un site** (#5041).
//
// > Directive porteur 2026-09-04 : « Lorsqu'on a une image, vidéo de fond le
// > longpress sur le fond doit mettre le menu permettant de supprimer, ramener
// > en front ou encore d'éditer l'image. »
//
// Le canvas ROUTE (`StoryCanvasBackgroundLongPress`), ce fichier PRÉSENTE, et
// chaque action retombe sur la primitive qui existait déjà. Aucune des trois
// n'est neuve : ce qui manquait était un CHEMIN vers elles depuis un fond.
@MainActor
extension MeeshyComposerHost {

    /// **Le menu, monté sur la PILE et non sur la racine.**
    ///
    /// SwiftUI n'honore qu'UNE présentation par vue, et la racine porte déjà la
    /// feuille de partage (#4996). Une seconde posée au même niveau serait
    /// silencieusement avalée — le mode de panne qui ne rougit nulle part, et
    /// dont le doc-comment de l'éditeur d'objet porte déjà la trace.
    func backgroundMenuPresented<Contenu: View>(_ contenu: Contenu) -> some View {
        contenu.confirmationDialog(
            ComposerBackgroundMenuCopy.title(),
            isPresented: Binding(
                get: { backgroundMenuObjectId != nil },
                set: { if !$0 { backgroundMenuObjectId = nil } }),
            titleVisibility: .visible
        ) {
            // L'ordre vient de la RÈGLE (`served`), jamais de trois `Button`
            // écrits à la suite : une garde de source sur des littéraux passe au
            // vert dès qu'on réécrit la liste autrement.
            ForEach(ComposerBackgroundMenuAction.served, id: \.self) { action in
                Button(ComposerBackgroundMenuCopy.label(for: action),
                       role: action.isDestructive ? .destructive : nil) {
                    applyBackgroundMenu(action)
                }
            }
        }
    }

    /// **L'identifiant se lit AVANT d'agir, et se remet à `nil` ensuite.**
    ///
    /// Le `Binding` du dialogue efface déjà l'état à la fermeture, mais l'ordre
    /// des deux n'est pas garanti : SwiftUI referme la feuille et exécute
    /// l'action dans la même passe. Lire l'identifiant en premier rend la
    /// fonction indifférente à cet ordre — sans quoi une action arriverait
    /// parfois sur un `nil`, et jamais de façon reproductible.
    func applyBackgroundMenu(_ action: ComposerBackgroundMenuAction) {
        guard let id = backgroundMenuObjectId else { return }
        backgroundMenuObjectId = nil
        switch action {
        case .edit:
            // Le MÊME éditeur que le double-tap et que le rail des
            // contrôleurs — la vue `2d` de la planche, unifiée pour les cinq
            // familles. Un second chemin d'ouverture divergerait au premier
            // outil ajouté.
            openObjectEditor(id)
        case .bringForward:
            // `toggleBackground` et NON `bringForward` : ce dernier déplace un
            // z-index parmi les objets de premier plan, et un fond se rend
            // depuis `backgroundLayer` quel que soit son z — l'entrée aurait
            // été INERTE. Ce que « ramener en avant » veut dire sur un fond,
            // c'est le faire SORTIR du plan de fond.
            viewModel.toggleBackground(id: id)
        case .delete:
            viewModel.deleteElement(id: id)
        }
        HapticFeedback.medium()
    }
}
