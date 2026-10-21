import Foundation

/// L'objet en cours d'édition. Un type plutôt qu'un `String?` parce que
/// `fullScreenCover(item:)` exige `Identifiable` — et parce qu'un identifiant nu
/// se confondrait, à la relecture, avec `selectedSceneItemId`, qui répond à une
/// autre question : celui-là est SÉLECTIONNÉ, celui-ci est OUVERT.
nonisolated struct ComposerEditedObject: Identifiable, Equatable {
    let id: String

    /// **La section sur laquelle l'écran s'OUVRE — `nil` ⇒ celle que la famille
    /// sert en premier** (directive porteur 2026-09-05).
    ///
    /// Elle existe parce que la première vue n'édite plus : taper le jeton
    /// « ALIGN ▭ » de l'inspecteur ouvrait une bande sous la scène, il ouvre
    /// désormais cet écran — et l'ouvrir sur POLICE demanderait à l'auteur de
    /// retrouver lui-même le réglage qu'il vient de désigner du doigt.
    ///
    /// Elle voyage sur l'ITEM de présentation plutôt que dans un `@State` du
    /// meuble : `fullScreenCover(item:)` reconstruit la vue à chaque
    /// présentation, donc la valeur arrive AVEC l'objet qu'elle qualifie. Un
    /// état séparé se désynchroniserait au premier changement d'objet sans
    /// fermeture — ce que le plan 2D permet précisément de faire.
    var section: ComposerObjectEditorSection?
}
