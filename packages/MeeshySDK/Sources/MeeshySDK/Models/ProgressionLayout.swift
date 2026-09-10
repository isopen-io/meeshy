import Foundation

/// LA COMPOSITION DE L'ÉCRAN « PROGRESSION » — le MIROIR de `progression-layout.ts` (#5838).
///
/// ## Pourquoi ce fichier existe
///
/// L'iOS natif rendait `Meesh → badges → succès → défis` ; web-v2 rendait
/// `élan → Meesh → niveau → défis → badges → succès`. `resolveEngagementProgress`
/// décidait déjà du CONTENU des deux côtés ; personne ne décidait de l'ORDRE,
/// alors chaque client a composé le sien.
///
/// La divergence n'était pas détectable par un témoin par client : chacun
/// listait SES sections et passait au vert sur SON ordre. Ce qui manquait
/// n'était pas un test de plus, c'était un endroit où l'ordre soit ÉCRIT — et,
/// Xcode ne pouvant pas importer un module TypeScript, un endroit de CHAQUE
/// côté plus une garde qui les compare (`progression-layout-mirror-parity`).
public enum ProgressionSection: String, Sendable, CaseIterable, Identifiable {
    /// L'identité EST la clé — une porte se distingue par ce qu'elle ouvre.
    public var id: String { rawValue }

    case badges
    case defis
    case succes
}

/// Un bloc du hub.
///
/// Énumération à valeur associée, et non un tableau de chaînes : une entrée de
/// section porte LAQUELLE, et le compilateur refuse alors qu'on l'oublie dans
/// le `switch` de la vue — ce qu'une chaîne libre aurait laissé passer.
public enum ProgressionBlock: Sendable, Equatable {
    case lastAchievement
    case level
    case elans
    /// LA FLAMME — la série de jours, en hero à part entière. Trois questions
    /// distinctes — où j'en suis, ce qui multiplie, ce que je tiens — méritent
    /// trois blocs, pas un bloc dense (directive porteur).
    case flamme
    case sectionLink(ProgressionSection)
}

public enum ProgressionLayout {

    /// La séquence du hub pour une progression donnée.
    ///
    /// Les trois heros sont TOUJOURS servis, y compris sur un compte vide : un
    /// écran neuf doit dire ce qu'on peut y gagner, pas se taire. C'est le
    /// contraire du réflexe « pas de données, pas de bloc », qui rend muet le
    /// moment où l'utilisateur a le plus besoin qu'on lui parle.
    public static func blocks(for progress: EngagementProgress) -> [ProgressionBlock] {
        // La porte des DÉFIS n'existe que s'il y a des défis à montrer. Sans
        // eux, l'entrée annoncerait « 0 / 0 » et ouvrirait une page vide : une
        // porte qui ne va nulle part se lit comme une panne, pas comme une
        // absence. Badges et Succès restent en toute circonstance — leur
        // catalogue est une constante partagée, jamais une mesure du serveur.
        let sections = ProgressionSection.allCases.filter { section in
            section != .defis || !progress.achievementSections.isEmpty
        }

        return [.lastAchievement, .level, .elans, .flamme] + sections.map { ProgressionBlock.sectionLink($0) }
    }
}
