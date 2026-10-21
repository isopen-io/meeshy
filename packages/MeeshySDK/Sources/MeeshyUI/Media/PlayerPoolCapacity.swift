import MeeshySDK

// MARK: - Le pool des lecteurs préparés suit le tier de l'appareil (#11281)

/// **Combien de lecteurs préparés le pool de `StoryMediaLoader` garde.**
///
/// Chaque lecteur préparé tient un décodeur matériel et ses images décodées :
/// la ressource la plus rare du passage de réel à réel (#9702). Le pool garde
/// les voisins IMMÉDIATS du réel affiché ; tout le reste de la fenêtre se
/// prépare en octets.
///
/// - `high` et `pro` : trois, le comportement historique — le réel quitté, le
///   suivant, et le préchauffage en cours. `pro` n'en gagne pas : le palier
///   « décode » est N±1, un quatrième lecteur ne servirait aucun geste.
/// - `mid` : deux — le précédent et le suivant, rien d'avance.
/// - `low` : un — le SUIVANT. À distance égale le plus ancien part
///   (`PlayerPoolEviction`), donc le réel quitté cède au réel qu'on va voir :
///   le balayage vers l'avant reste instantané, le retour en arrière repart
///   de ses octets déjà sur disque.
///
/// Argumenté, non mesuré : le nombre d'`AVPlayer` vivants et les hitches se
/// relèvent à l'Instruments sur un iPhone de chaque tier.
public nonisolated enum PlayerPoolCapacity {

    public static func players(for tier: DeviceMediaTier) -> Int {
        switch tier {
        case .low: return 1
        case .mid: return 2
        case .high, .pro: return 3
        }
    }
}
