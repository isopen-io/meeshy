import SwiftUI

/// **Le menu de SUPPRESSION d'un son, partagé par les deux surfaces** (#4930).
///
/// Il était `private` à la surface document, donc invisible à la surface scène —
/// et c'est ce qui a fait qu'un son de fond n'avait aucun chemin de retrait sur
/// le plateau. Extrait, il devient le geste UNIQUE de suppression d'un son,
/// quel que soit son plan et quelle que soit la surface.
///
/// > `supprimer == nil` ⇒ **aucun menu**, jamais un menu grisé. Un contrôle
/// > existe s'il a un effet (loi 4), et l'appui long qui ouvrirait un menu vide
/// > est pire qu'un appui long qui ne fait rien : il PROMET.
struct ComposerSoundDeletionMenu: ViewModifier {
    let supprimer: (() -> Void)?

    func body(content: Content) -> some View {
        if let supprimer {
            content.contextMenu {
                Button(role: .destructive, action: supprimer) {
                    Label(String(localized: "composer.audio.delete.action",
                                 defaultValue: "Supprimer le son", bundle: .main),
                          systemImage: "trash")
                }
            }
        } else {
            content
        }
    }
}