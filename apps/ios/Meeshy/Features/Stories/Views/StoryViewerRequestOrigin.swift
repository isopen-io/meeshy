import Foundation

/// **Les deux façons d'entrer dans le lecteur de stories, nommées.**
///
/// `StoryViewerRequest` porte deux champs dont c'est la COMBINAISON qui décide
/// où la lecture commence — `postId` (le contenu nommé) et
/// `startAtFirstUnviewed` (démarrer à la première non vue). Leur règle vivait
/// dans un doc-comment ; le producteur du deep link faisait l'inverse de ce
/// qu'il énonçait, et rien ne pouvait rougir : les deux champs ont des valeurs
/// par défaut, donc les OUBLIER compile.
///
/// Un défaut de ce genre ne se corrige pas durablement en changeant la valeur
/// au site d'appel : il se corrige en retirant l'occasion de se tromper. Ici,
/// l'intention se nomme, et les deux champs cessent d'être remplis à la main.
///
/// Mesuré au simulateur (#4903) : un lien vers une story ouvrait le bon GROUPE
/// à une AUTRE story — celle que le lien désignait était trouvée, puis jetée.
extension StoryViewerRequest {

    /// L'entrée nomme UN contenu : un lien partagé, une notification, une
    /// story touchée dans une liste.
    ///
    /// `startAtFirstUnviewed` reste `false` — cibler un contenu et sauter à la
    /// première non vue sont deux ordres contradictoires, et `StoryIndexResolver`
    /// documente la zone où ils se marchent dessus : un index résolu à `0`
    /// retomberait sur la branche « non vue » et masquerait la cible.
    static func targetingStory(postId: String,
                               inGroup groupId: String,
                               singleGroup: Bool = false,
                               initialAction: StoryViewerInitialAction? = nil) -> StoryViewerRequest {
        StoryViewerRequest(id: groupId,
                           initialAction: initialAction,
                           startAtFirstUnviewed: false,
                           singleGroup: singleGroup,
                           postId: postId)
    }

    /// L'entrée nomme une PERSONNE, jamais un contenu : toucher un avatar, le
    /// tray, un profil. La première story non vue est alors la bonne réponse —
    /// c'est ce que l'utilisateur vient chercher.
    static func openingGroup(userId: String,
                             singleGroup: Bool = false,
                             initialAction: StoryViewerInitialAction? = nil) -> StoryViewerRequest {
        StoryViewerRequest(id: userId,
                           initialAction: initialAction,
                           startAtFirstUnviewed: true,
                           singleGroup: singleGroup,
                           postId: nil)
    }
}
