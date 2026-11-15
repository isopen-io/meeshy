import Foundation

/// **Une borne de proportion ne se pose que sur un ratio MESURÉ** (#5100).
///
/// ## Le défaut que cette garde ferme
///
/// `MediaCropRule.centered(ratio:sourceRatio:)` calcule le rectangle qu'une
/// pastille `9:16` / `4:5` / `1:1` doit poser. Elle est juste — mais elle croit
/// ce qu'on lui donne, et sur les chemins VIDÉO la vraie valeur arrive **après**
/// que l'objet soit posé : `insertForegroundVideo(aspectRatio: nil, …)` place le
/// média tout de suite, un `preloadTask` mesure ensuite `naturalSize ×
/// preferredTransform` avant d'appeler `setMediaAspectRatio`.
///
/// Pendant cette fenêtre, l'objet sert son repli. Taper `9:16` à cet instant sur
/// une source **16:9** rend `w = 0.5625, h = 1` — un sous-rectangle dont le
/// rapport RÉEL vaut `(0.5625 × 16) / 9 = 1.0`, **un carré**. Le geste est
/// enregistré, le fichier part, et rien ne dit que la borne a été calculée
/// contre une valeur provisoire.
///
/// > **Une garde de temporalité ne se remplace pas par une valeur plus juste.**
/// > Le problème n'est pas que le repli soit mauvais — c'est qu'il ARRIVE avant
/// > la mesure, et qu'un calcul exact sur une entrée provisoire produit un
/// > résultat faux qui a toutes les apparences d'un choix délibéré.
///
/// ## Pourquoi refuser plutôt que patienter
///
/// Attendre la mesure pour appliquer le geste demanderait de mémoriser une
/// intention et de la rejouer — donc un état de plus, et un moment où l'auteur
/// voit sa pastille enfoncée sans effet visible. Refuser **en le disant** (la
/// doctrine des refus motivés, planche `4d`) laisse l'auteur retaper une
/// seconde plus tard, quand le résultat sera juste et immédiat.
///
/// ## Ce que cette garde N'est PAS
///
/// Ce n'est pas une validation du recadrage : `MediaCropRect` a la sienne
/// (bornes dans `0…1`, aire non nulle). Celle-ci porte sur l'**ENTRÉE** du
/// calcul, pas sur sa sortie — deux questions distinctes, et c'est la première
/// qui manquait.
nonisolated enum MediaCropReadiness {

    /// Les pastilles de proportion peuvent-elles agir ?
    ///
    /// - `measuredAspectRatio` : `StoryMediaObject.measuredAspectRatio`, `nil`
    ///   tant qu'aucune mesure n'est arrivée.
    ///
    /// Un ratio non fini ou négatif est traité comme non mesuré : il ne peut
    /// venir que d'une source corrompue, et `centered` en tirerait une borne
    /// arbitraire plutôt qu'une erreur.
    static func ratioPadsMayAct(measuredAspectRatio: Double?) -> Bool {
        guard let mesure = measuredAspectRatio,
              mesure.isFinite, mesure > 0 else { return false }
        return true
    }

    /// **`LIBRE` reste offert même sans mesure**, et ce n'est pas une exception
    /// arbitraire : il ne CALCULE rien. Rendre la pleine étendue
    /// (`MediaCropRect.full`) ne dépend d'aucun ratio, donc aucune borne fausse
    /// ne peut en sortir — et c'est le seul geste qui permet d'ANNULER un
    /// recadrage, qu'il serait absurde de retenir en attendant une mesure.
    static func mayAct(ratio: MediaCropRatio, measuredAspectRatio: Double?) -> Bool {
        ratio.value == nil ? true : ratioPadsMayAct(measuredAspectRatio: measuredAspectRatio)
    }
}
