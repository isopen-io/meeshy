import SwiftUI

/// **Le menu d'appui long d'un son, partagé par les deux surfaces** (#4930, #5018).
///
/// Il était `private` à la surface document, donc invisible à la surface scène —
/// et c'est ce qui a fait qu'un son de fond n'avait aucun chemin de retrait sur
/// le plateau. Extrait, il devient le geste UNIQUE de l'appui long sur un son,
/// quel que soit son plan et quelle que soit la surface.
///
/// ## Pourquoi il ne s'appelle plus `ComposerSoundDeletionMenu`
///
/// Il offre depuis #5018 une seconde action — sortir le son du fond pour le
/// poser sur la scène. Un `...DeletionMenu` qui promeut est un nom qui ment, et
/// un nom qui ment coûte à chaque lecture : on croit savoir ce qu'on ouvre.
/// Le renommage vaut la perturbation parce qu'il est fait AU MOMENT où le nom
/// devient faux — un cran plus tard, il aurait fallu le justifier au lieu de le
/// constater.
///
/// ## Chaque action est optionnelle, et `nil` retire l'ENTRÉE
///
/// > Un contrôle existe s'il a un effet (loi 4). Une entrée grisée, ou une
/// > entrée câblée à rien, promet un geste que le composer ne tient pas.
///
/// Les deux actions sont indépendantes, et c'est la SURFACE qui décide :
///
/// | surface | supprimer | mettre sur la scène |
/// |---|---|---|
/// | scène | oui | oui — il y a une toile où poser une puce |
/// | document | oui | **non** — aucune scène où la poser |
///
/// Les deux `nil` ⇒ **aucun menu du tout**, plutôt qu'un appui long qui ouvre
/// une feuille vide : ouvrir pour ne rien offrir est pire que ne pas ouvrir.
struct ComposerSoundActionsMenu: ViewModifier {
    let supprimer: (() -> Void)?
    var promouvoir: (() -> Void)? = nil

    private var offreQuelqueChose: Bool { supprimer != nil || promouvoir != nil }

    func body(content: Content) -> some View {
        if offreQuelqueChose {
            content.contextMenu {
                if let promouvoir {
                    Button(action: promouvoir) {
                        Label(String(localized: "composer.audio.promote.action",
                                     defaultValue: "Mettre sur la scène", bundle: .main),
                              systemImage: "square.on.square.dashed")
                    }
                }
                if let supprimer {
                    Button(role: .destructive, action: supprimer) {
                        Label(String(localized: "composer.audio.delete.action",
                                     defaultValue: "Supprimer le son", bundle: .main),
                              systemImage: "trash")
                    }
                }
            }
        } else {
            content
        }
    }
}
