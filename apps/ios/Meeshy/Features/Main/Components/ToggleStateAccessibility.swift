import SwiftUI

// MARK: - Ce qu'un interrupteur DIT de son état

/// **Une abstraction nommée d'après son premier appelant ne voyage pas.**
///
/// Ce modificateur a vécu dans `CallView.swift` sous le nom
/// `callToggleAccessibility`. Rien dedans n'était propre aux appels — ni le
/// trait `.isToggle`, ni la valeur « Activé / Désactivé », ni le repli sous
/// iOS 17 — et son propre commentaire énonçait la règle GÉNÉRALE : exposer
/// « the same toggle semantics (trait + on/off value) … instead of a plain
/// label swap ».
///
/// Trois choses seulement le rendaient « d'appel » : son **nom**, son
/// **fichier** (2 200 lignes de vue d'appel) et ses **clés**
/// (`call.control.state.*`). Résultat mesuré au 253i (#4266) : **cinq sites
/// l'appliquaient, tous des surfaces d'appel**, pendant que quatre bascules
/// ailleurs dans le produit ne disaient leur état que par une couleur.
///
/// C'est la forme de #4260 déplacée d'un cran : là une GARDE était bornée par
/// la forme qu'elle interdisait ; ici une RÈGLE juste était bornée par le nom
/// qu'on lui avait donné.
///
/// ### Ce que ce modificateur ne fait PAS
///
/// Il ne convient qu'aux contrôles à **deux** états. Deux voisins l'ont
/// justement refusé, et leur refus est la preuve que le trait n'est pas une
/// formalité à coller partout :
///
/// - un **cycle à trois états** (les sous-titres d'appel) porte une valeur
///   libre, jamais `.isToggle` — le trait annoncerait un interrupteur, et le
///   rotor proposerait une bascule qui n'existe pas ;
/// - un **élément de menu** (« Enregistrer » / « Retirer des favoris ») dit son
///   état par son NOM. Un menu est une liste d'ACTIONS ; `.isToggle` y
///   annoncerait un interrupteur là où l'utilisateur choisit une commande.
extension View {

    /// Expose l'état d'un contrôle à deux positions : trait `.isToggle`
    /// (iOS 17+) et valeur « Activé / Désactivé », dans les sept locales.
    ///
    /// Sous iOS 17 le trait n'existe pas ; la valeur, elle, est lue par
    /// VoiceOver depuis toujours — le repli n'est donc pas une dégradation
    /// silencieuse, seulement un mot de moins.
    @ViewBuilder
    func toggleStateAccessibility(isToggle: Bool, isActive: Bool) -> some View {
        if isToggle {
            let stateLabel = isActive
                ? String(localized: "a11y.toggle.on", defaultValue: "Activé", bundle: .main)
                : String(localized: "a11y.toggle.off", defaultValue: "Désactivé", bundle: .main)
            if #available(iOS 17, *) {
                self
                    .accessibilityAddTraits(.isToggle)
                    .accessibilityValue(stateLabel)
            } else {
                self.accessibilityValue(stateLabel)
            }
        } else {
            self
        }
    }
}
