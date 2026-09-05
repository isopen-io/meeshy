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
    ///
    /// **`hasScene` n'est lu que pour `.document`**, et c'est le fond de la
    /// règle : l'atelier EST une scène (la question ne se pose pas), et un mood
    /// n'en a pas (la poser lui ferait porter une exception qu'il n'a pas — ce
    /// que la tâche 4.3 lui a précisément retiré).
    ///
    static func mounted(surface: ComposerSurfaceKind,
                        hasScene: Bool) -> ComposerMountedView {
        switch surface {
        case .scene:    return .atelier
        case .mood:     return .mood
        // **RESTAURÉ le 2026-09-02, sur retour porteur.** Cette ligne a valu
        // `hasScene && editsScene` pendant quelques heures, ce qui envoyait une
        // scène non éditée vers `ComposerDocumentSurface` — donc SANS les deux
        // rails. C'était une erreur de lecture de la cible, et le porteur l'a
        // corrigée : « vous n'avez pas maintenu l'architecture qui met les
        // contrôleurs de la scène à gauche et ceux qui gèrent la structure et
        // l'état de la publication à droite ? […] je vois que tu supprimes des
        // features qui existent et qui COMPLÈTENT la cible au lieu de les
        // laisser et agréger plutôt ».
        //
        // > Une cible MUETTE sur une dimension ne l'interdit pas. La cible `1b`
        // > ne dessine pas les rails ; elle ne dit pas de les retirer. Lire une
        // > absence comme une prescription transforme une lacune du document en
        // > régression du produit — et fait perdre une SÉMANTIQUE que le
        // > document n'avait simplement pas exprimée.
        //
        // L'architecture des rails porte une distinction que la cible n'énonce
        // nulle part : à GAUCHE ce qu'on POSE sur la scène (média, son, texte,
        // dessin, slides) ; à DROITE ce qui structure la PUBLICATION (ajouter
        // une unité, annuler). Ce qui reste juste de la cible — la scène
        // incrustée plutôt que plein écran — se compose avec elles : c'est la
        // HAUTEUR du canvas qui doit céder, pas le chrome qui l'entoure.
        //
        // Ce que la sélection d'un objet change reste à faire, et ce n'est pas
        // un écran : d'après le porteur, c'est la RANGÉE BASSE qui devient
        // dynamique — l'inspecteur de l'objet courant. Un paramètre de routage
        // aurait été le mauvais outil pour cela, et c'est pourquoi il est
        // retiré plutôt que gardé sans effet.
        case .document: return hasScene ? .scene : .document
        }
    }
}
