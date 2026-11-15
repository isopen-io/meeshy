import Foundation

/// **Le quart de tour d'un média** (#4082, vue `2d` : « ⟲ PIVOTER »).
///
/// Le champ `rotation` existe sur `StoryMediaObject` depuis toujours, en
/// DEGRÉS — les trois calques du canvas le convertissent eux-mêmes
/// (`CATransform3DMakeRotation(rotation * .pi / 180, …)`). Ce qui manquait
/// n'était pas la donnée mais son ÉCRIVAIN : aucun chemin de l'app ne la
/// touchait, et le pivotement d'un média était une capacité du modèle que rien
/// n'offrait.
///
/// ## Pourquoi une règle plutôt qu'un `+= 90` au site d'appel
///
/// Deux raisons, et la seconde est celle qui mord :
///
/// - **la normalisation** — sans elle, pivoter douze fois range 1080 dans le
///   modèle. Rien ne casse : le rendu est correct modulo 360. Mais la valeur
///   voyage jusqu'au serveur et jusqu'aux deux autres clients, où un décodeur
///   plus strict ou une interpolation d'animation peuvent en faire autre chose.
/// - **le sens** — `⟲` tourne dans le sens ANTIHORAIRE, et un quart de tour
///   écrit `+90` là où le glyphe promet le contraire est le genre de justesse
///   inversée qui survit à une relecture, parce que quatre pressions ramènent
///   au point de départ dans les deux cas.
nonisolated enum StoryMediaRotation {

    /// Un quart de tour, dans le sens du glyphe `⟲` — antihoraire.
    public static let quarterTurn: Double = -90

    /// Ramène l'angle dans `[0, 360)`. Les négatifs remontent : `-90` devient
    /// `270`, ce qui est le MÊME angle et la seule des deux écritures qu'un
    /// décodeur qui borne à des valeurs positives accepte.
    public static func normalized(_ degrees: Double) -> Double {
        let reste = degrees.truncatingRemainder(dividingBy: 360)
        return reste < 0 ? reste + 360 : reste
    }

    public static func turned(_ degrees: Double) -> Double {
        normalized(degrees + quarterTurn)
    }
}
