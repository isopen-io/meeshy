import Foundation

/// La salle de publication que le lecteur de stories TIENT — une seule à la fois.
///
/// Les salles de `SocialSocketManager` sont comptées en références : chaque
/// `joinPostRoom` doit trouver son `leavePostRoom`. Le lecteur dérivait la story
/// quittée de l'index qui venait de changer ; or un changement de groupe change
/// les DEUX index dans la même transaction, et chacun des deux `onChange`
/// recalculait une « story précédente » fausse (ancien groupe × nouvel index,
/// nouveau groupe × ancien index). Il quittait deux salles jamais tenues,
/// rejoignait deux fois la nouvelle, et ne quittait jamais l'ancienne — tenue,
/// et ré-abonnée à chaque reconnexion, pour toute la session.
///
/// Le registre se souvient de ce qu'il a rejoint : quitter, c'est quitter CELLE-LÀ.
nonisolated struct StoryPostRoomLedger: Equatable {
    struct Move: Equatable {
        var leave: String?
        var join: String?
    }

    private(set) var held: String?

    /// Ce qu'il faut quitter et rejoindre pour tenir `postId` (nil : ne rien tenir).
    mutating func hold(_ postId: String?) -> Move {
        guard postId != held else { return Move() }
        let move = Move(leave: held, join: postId)
        held = postId
        return move
    }
}
