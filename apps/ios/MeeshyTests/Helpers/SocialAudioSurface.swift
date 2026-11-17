import Foundation

/// **Les surfaces SOCIALES qui jouent un audio** (#4926).
///
/// Elle existe pour une raison précise, et c'est la leçon 261 : *une garde qui
/// nomme UN fichier prouve que ce fichier applique la règle, jamais que ce sont
/// les seuls fichiers où elle s'applique.* `FocalMatrixWiringGuardTests` gardait
/// déjà « la vue doit résoudre la langue de piste par la MÊME loi que le VM » —
/// pour `AudioMediaView`, c'est-à-dire pour la CONVERSATION. Cinq surfaces
/// sociales jouaient un audio sans jamais appeler la loi, et aucune garde ne
/// pouvait rougir : elles n'étaient nommées nulle part.
///
/// Ce type est la liste FERMÉE de ces surfaces. Une sixième ne compile pas tant
/// qu'elle n'est pas déclarée ici, et le témoin de câblage exige un chemin de
/// fichier pour chaque cas — c'est le cliquet qui manquait.
nonisolated enum SocialAudioSurface: String, CaseIterable, Equatable {
    /// La carte d'un post audio dans le fil.
    case feedPostCard
    /// Le détail d'un post audio.
    case postDetail
    /// Un commentaire audio — sous un post, une story ou un réel.
    case comment
    /// Le réel, dont la piste jouée peut être un audio traduit.
    case reel
    /// Le plein écran audio, qui porte en plus la liste des puces de langue.
    case audioFullscreen

    /// **La piste sonore d'une republication LEGACY** — `RepostContent.audioUrl`,
    /// une URL nue héritée des anciennes stories.
    ///
    /// Elle est déclarée ICI plutôt qu'omise, et c'est délibéré : une surface
    /// absente d'une énumération est invisible, une surface déclarée est
    /// auditable. Le témoin de câblage vérifie l'affirmation ci-dessous au lieu
    /// de la croire.
    case repostLegacyAudio

    /// **Cette surface TRANSPORTE-t-elle des pistes traduites ?**
    ///
    /// C'est la loi 4 appliquée à une garde : *une porte non servie est ABSENTE,
    /// jamais grisée.* Exiger l'élection d'une surface qui ne transporte AUCUNE
    /// piste produirait un appel qui rend toujours `nil` — du code qui a l'air
    /// d'une couverture et n'en est pas. Pire : le jour où cette surface
    /// gagnerait des pistes, l'appel étant déjà là, plus rien ne rougirait.
    ///
    /// `repostLegacyAudio` ne porte qu'un `audioUrl` : pas de `FeedMedia`, donc
    /// pas de `transcription`, donc pas de `translatedAudios`. Il n'y a rien à
    /// élire, et le témoin vérifie que c'est TOUJOURS vrai — le jour où ce
    /// chemin gagne un média, la garde tombe et réclame son élection.
    ///
    /// `switch` exhaustif : une septième surface ne compile pas tant qu'elle
    /// n'a pas répondu.
    var carriesTranslatedTracks: Bool {
        switch self {
        case .feedPostCard, .postDetail, .comment, .reel, .audioFullscreen:
            return true
        case .repostLegacyAudio:
            return false
        }
    }
}
