import Foundation
import MeeshySDK
import MeeshyUI

/// **Ce qu'une graine doit remettre à la voie DOCUMENT** (#5409).
///
/// ## Le défaut que cette règle ferme
///
/// `documentLocalMedia` — la liste que la voie document téléverse
/// (`enqueuePostMedia(sourceMediaURLs:)`) — n'a **qu'un écrivain** :
/// `ingestIntoDocument`, appelé par les seuls chemins d'INTAKE (photothèque,
/// caméra, importateur). Une GRAINE, elle, va directement au canvas
/// (`StoryComposerViewModel(seeding:)`) et saute l'intake.
///
/// Tant que la surface d'une graine était la SCÈNE, cela ne coûtait rien : le
/// canal `.scene` reçoit tous les actifs chargés (`loadedImages`,
/// `loadedVideoURLs`, `loadedAudioURLs`) et le fichier partait avec eux. La voie
/// DOCUMENT ne les voit pas : elle ne téléverse que `localMedia`, et le
/// `storyEffects` qu'elle emporte ne référence alors qu'un chemin local, que
/// personne ne peut résoudre.
///
/// > **Deux canaux, deux inventaires de ce qui part.** Un média peut être
/// > parfaitement posé sur le canvas, visible à l'écran, décrit dans le blob
/// > publié — et n'avoir aucun téléverseur. Rien ne rougit : le canvas est
/// > juste, et c'est la publication qui est vide.
///
/// C'est la jumelle exacte du défaut #5406 (le cadrage du fond) : un champ
/// parfaitement produit, qu'aucun chemin ne fait voyager.
///
/// ## Pourquoi une règle PURE et non trois lignes dans le meuble
///
/// Elle décide de trois choses qu'un `body` ne laisse pas interroger — le
/// fichier à téléverser, l'objet de canvas qu'il double, et si la graine a
/// FONDÉ la scène (donc si elle gagne une tuile). Les écrire dans la vue les
/// rendrait vraies par inspection seulement.
enum ComposerSeedIngestion {

    /// Ce que le meuble a besoin de savoir pour ingérer une graine sans la
    /// poser DEUX fois.
    nonisolated struct Plan: Equatable {
        /// La pièce jointe locale à remettre à `documentLocalMedia`.
        let media: ComposerDocumentMedia

        /// L'objet de canvas que la graine a déjà posé, quand elle le nomme.
        ///
        /// `nil` pour une image : son identité naît dans `init(seeding:)`, et
        /// l'hôte la relit sur la slide plutôt que de l'inventer — inventer un
        /// identifiant ici casserait le pont `URL source → objet` dont
        /// dépendent les légendes, les alternatives et `mediaObjectIds`.
        let objectId: String?

        /// La graine a-t-elle fondé la SCÈNE ?
        ///
        /// Vrai pour une image et une vidéo — elles deviennent le fond de la
        /// slide, et un fond gagne une tuile dans la rangée haute
        /// (`ComposerHeaderTiles`, qui lit l'index des fondations). Faux pour un
        /// son : il n'est pas une page, donc pas de tuile — la même règle que
        /// pour un son ingéré par le rail.
        let foundsScene: Bool
    }

    /// `nil` quand la graine n'a aucun fichier — une graine de TEXTE seul n'a
    /// rien à téléverser, et c'est une réponse, pas un échec.
    /// `@MainActor` — non par besoin d'état, mais parce que `StoryComposerSeed`
    /// vit dans `MeeshyUI`, dont l'isolation par défaut EST le main actor
    /// (SE-0466, `Package.swift`). Le `Plan` qu'elle rend, lui, reste
    /// `nonisolated` : c'est une valeur, et rien de ce qu'il porte n'a besoin
    /// d'un acteur.
    @MainActor
    static func plan(for seed: StoryComposerSeed?) -> Plan? {
        guard let seed, let origin = seed.origin else { return nil }
        return Plan(
            media: ComposerDocumentMediaFactory.media(url: origin.fileURL,
                                                      declaredMimeType: origin.mimeType),
            objectId: origin.objectId,
            foundsScene: foundsScene(seed.payload)
        )
    }

    /// Le `switch` est EXHAUSTIF à dessein : un quatrième payload ne compilera
    /// pas tant qu'on n'aura pas dit s'il fonde une scène. La question n'a pas
    /// de réponse par défaut — se tromper d'un côté fabrique une tuile pour
    /// quelque chose qui n'est pas une page, de l'autre en prive une page.
    @MainActor
    private static func foundsScene(_ payload: StoryComposerSeed.Payload?) -> Bool {
        switch payload {
        case .image, .video: return true
        case .audio: return false
        case nil: return false
        }
    }
}
