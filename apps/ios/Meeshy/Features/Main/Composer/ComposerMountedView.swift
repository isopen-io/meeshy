/// **Quelle VUE le meuble monte** — la règle qui distingue les quatre contextes
/// (#4070, planche § tâche 4.3).
///
/// ## Pourquoi elle est séparée de `ComposerSurfaceRouting`
///
/// `ComposerSurfaceRouting.surface(opening:format:)` est une fonction **PURE de
/// ce que la porte a décidé et du format COURANT** — sa doc le dit, et c'est
/// une propriété qu'on veut garder : elle rend le routage éprouvable sans
/// aucun état.
///
/// Or la scène INCRUSTÉE ne se décide pas ainsi. Elle naît d'un ÉTAT — un fond
/// choisi, un média posé — que le format ne connaît pas. Ajouter un quatrième
/// cas à `ComposerSurfaceKind` aurait donc obligé le routage à lire l'état, et
/// lui aurait fait perdre exactement ce qui le rend testable.
///
/// D'où deux règles, chacune pure de SES entrées : le routage dit quelle
/// SURFACE le format appelle ; celle-ci dit quelle VUE cette surface monte,
/// une fois qu'on sait s'il y a une scène.
nonisolated enum ComposerMountedView: Equatable, CaseIterable {

    /// L'atelier du SDK — story et réel, la scène plein écran.
    case atelier

    /// **La scène INCRUSTÉE** — un document qui a une scène (`ComposerSceneSurface`).
    case scene

    /// Le document seul : un texte long, des pièces jointes, aucune scène.
    case document

    /// Le mood : dix emojis, 122 caractères, aucune pièce.
    case mood

    /// - Parameter hasScene: y a-t-il une scène à montrer ? Dérivé de l'ÉTAT
    ///   (un fond choisi, un média posé), jamais du format.
    /// - Parameter editsScene: l'auteur est-il ENTRÉ dans l'éditeur de scène ?
    ///   Un GESTE, jamais un état dérivé — voir ci-dessous.
    ///
    /// **`hasScene` n'est lu que pour `.document`**, et c'est le fond de la
    /// règle : l'atelier EST une scène (la question ne se pose pas), et un mood
    /// n'en a pas (la poser lui ferait porter une exception qu'il n'a pas — ce
    /// que la tâche 4.3 lui a précisément retiré).
    ///
    /// ## `editsScene` — la troisième entrée, et pourquoi elle manquait (#4513)
    ///
    /// La règle n'avait que deux entrées, donc `.document` + une scène rendait
    /// TOUJOURS `.scene`. Le document des vues en décrit pourtant **deux** :
    ///
    /// | | `1b` — « Naissance de la scène » | `1c` — « Éditeur de scène » |
    /// |---|---|---|
    /// | doctrine | « la scène est **incrustée, pas plein écran** » | « **un seul objet à la fois** » |
    /// | coin haut-gauche | **✕** fermer | **‹** retour |
    ///
    /// > Un `‹` n'est pas un `✕`. Il dit qu'on est ENTRÉ depuis un écran
    /// > parent — donc que `1c` est l'ENFANT de `1b`, pas sa variante. Deux
    /// > écrans dans cette relation ont besoin de deux corps, et d'un geste
    /// > NOMMÉ entre eux.
    ///
    /// Sans cette entrée, l'éditeur était servi d'emblée : tous les outils
    /// visibles d'un coup, sur deux rails permanents, là où la cible demande
    /// une scène incrustée et sobre. C'est le défaut que la directive porteur
    /// du 2026-09-01 nomme — « ne pas tout montrer d'un coup ».
    ///
    /// **Elle est un GESTE, jamais un état dérivé**, et c'est ce qui la rend
    /// juste : dérivée d'un objet sélectionné, elle rouvrirait l'éditeur à
    /// chaque sélection programmatique — un semis, une restauration de
    /// brouillon, une traduction — et l'auteur se retrouverait dans un écran
    /// qu'il n'a pas demandé. Elle vaut donc ce que l'HÔTE en a fait, comme
    /// l'idempotence du viseur (#4751).
    ///
    /// **Sans valeur par défaut**, délibérément : un `editsScene: Bool = false`
    /// aurait laissé les appelants existants compiler en silence, et c'est
    /// exactement la question qu'il faut leur poser une fois — « sers-tu la
    /// scène incrustée, ou son éditeur ? ». Même raison que `audio:` chez
    /// `mutateItem` (#4759) et que `moodSeed` chez le meuble.
    static func mounted(surface: ComposerSurfaceKind,
                        hasScene: Bool,
                        editsScene: Bool) -> ComposerMountedView {
        switch surface {
        case .scene:    return .atelier
        case .mood:     return .mood
        // `hasScene` décide s'il y a une scène à MONTRER (`1a` sinon) ;
        // `editsScene` décide si on la MONTRE ou si on l'ÉDITE (`1b` / `1c`).
        // Les deux sont nécessaires : éditer une scène qui n'existe pas n'a
        // pas de sens, et c'est pourquoi le `&&` n'est pas un `||` déguisé.
        case .document: return hasScene && editsScene ? .scene : .document
        }
    }
}
