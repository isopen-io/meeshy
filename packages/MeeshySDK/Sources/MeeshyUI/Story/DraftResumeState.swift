import Foundation

/// Visibilité de la proposition de reprise d'un brouillon, et rien d'autre.
///
/// Le type porte surtout un ARBITRAGE, écrit ici parce que c'est le seul endroit
/// où les trois transitions se lisent d'un coup.
///
/// Dé-modalisée (S5), la carte devient un bandeau que le moindre geste
/// d'authoring range. Une première version gardait un second bit
/// (« décision ouverte ») qui, tant qu'aucun bouton n'avait été pressé, fermait
/// le magasin de brouillons à TOUTE écriture silencieuse. Effet de bord fatal :
/// ranger le bandeau — le geste que S5 promeut comme affordance principale de la
/// page blanche — coupait l'autosave POUR LE RESTE DE LA SESSION, et le travail
/// créé ensuite ne survivait pas au kill de l'app (invariant D1).
///
/// Règle retenue : **le brouillon en magasin n'est protégé que tant que l'offre
/// est POSÉE à l'écran.** Une fois le bandeau rangé, le composer redevient un
/// composer ordinaire et c'est `composerHasContent` qui tranche
/// (`StoryComposerView.mayOverwriteStoredDraft`) :
/// - rien créé → rien n'est écrit, le brouillon proposé revient intact à
///   l'ouverture suivante. **Ranger n'est pas jeter.**
/// - du contenu réel créé → il supplante une offre que l'utilisateur avait sous
///   les yeux et a visiblement ignorée, et il est protégé du kill.
///
/// Seul « Recommencer » efface le magasin sans rien mettre à la place.
public nonisolated struct DraftResumeState: Equatable, Sendable {
    /// Le bandeau est posé à l'écran. Tant qu'il l'est, « Reprendre » doit
    /// restaurer EXACTEMENT les slides proposées : aucune écriture silencieuse
    /// ne peut passer (`StoryDraftStore` n'a qu'un slot).
    public private(set) var isBannerVisible: Bool

    public init() {
        self.isBannerVisible = false
    }

    /// Un brouillon restaurable a été trouvé : on le propose.
    public mutating func offer() {
        isBannerVisible = true
    }

    /// Une interaction d'authoring (tap canvas, ouverture d'un panneau, entrée
    /// en édition texte) range le bandeau. Le brouillon RESTE en magasin.
    public mutating func hideBanner() {
        isBannerVisible = false
    }

    /// « Reprendre » ou « Recommencer » : l'offre est consommée. Nommée à part
    /// de `hideBanner()` bien qu'elle produise le même état — les deux call
    /// sites n'ont pas le même sens, et c'est ce qui rend le fichier lisible.
    public mutating func decide() {
        isBannerVisible = false
    }
}
