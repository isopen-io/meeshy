import SwiftUI
import MeeshyUI

/// Hôte de l'élection de la focus card — le SEUL endroit qui décide quel rang
/// occupe la carte (contrat LWS-8/I-070, §4.2).
///
/// **Pourquoi une vue nominale, et pas un `@State` dans la liste.** Même
/// arbitrage que `SectionScrollPillHost` (LWS-6/I-063bis), pour la même
/// raison : porter cet état dans `ConversationListView` re-diffuserait tous
/// les rangs à chaque tick de défilement — le défaut que `ScrollOffsetRelay` a
/// été créé pour éliminer. Ici, ce petit hôte est tout ce qui se re-rend au
/// rythme du défilement ; il pèse une `Color.clear`.
///
/// **Le détecteur reste unique.** Aucun observateur de défilement n'est créé :
/// un consommateur de plus s'abonne au relais qui publiait déjà, écrit par
/// l'unique `onScrollOffsetChange` de `MeeshyRefreshableScroll` — exactement
/// comme `ConversationListHeaderOverlay` et la pilule de section avant lui.
/// C'est un choix, et il se justifie : la géométrie du conteneur de
/// défilement, quelle que soit l'API qui la publie, ne dit RIEN du `midY` des
/// rangs. Une sonde de géométrie de défilement aurait donc coûté un
/// observateur supplémentaire sans dispenser de la mesure des rangs
/// (`LentilleFocusCandidateRegistry`) qui, elle, est indispensable. Le relais
/// existant fournit le seul signal qui manquait : *quand* ré-élire.
///
/// **La carte suit le DÉFILEMENT, jamais les événements** (§4.2). L'élection
/// a exactement deux points d'entrée : le tick d'offset et l'amorçage au
/// montage. Rien n'observe le modèle ni le registre — un `message:new` pendant
/// que le pouce est immobile met à jour la géométrie des rangs, mais
/// n'appelle personne : l'élu tient. C'est une propriété de STRUCTURE, pas une
/// précaution qu'il faudrait se rappeler d'appliquer.
///
/// **La LOI décide, cet hôte transmet.** La bande (`LentilleFocusBand`, donc
/// `FocalFocusCurve.focusBandOffset`), l'hystérésis
/// (`FocalFocusCurve.focusBandHalfHeight`) et l'élection elle-même
/// (`FocalFocusCurve.electFocusRow`) viennent du miroir GELÉ. Aucune de ces
/// cotes ne s'écrit ici (garde R15), et la perspective (I-069) lit la MÊME
/// bande : une carte élue là où la perspective ne pique pas serait une
/// incohérence visible au premier coup d'œil.
struct LentilleFocusElectionHost: View {

    /// Le relais EXISTANT. `@ObservedObject` : cet hôte se re-rend au rythme
    /// du défilement — c'est voulu, et c'est tout ce qui se re-rend.
    @ObservedObject var relay: ScrollOffsetRelay
    /// Boîte inerte alimentée par les rangs eux-mêmes. Pas observée : la
    /// remplir ne doit JAMAIS déclencher d'élection.
    let registry: LentilleFocusCandidateRegistry
    /// Magasin de l'élu. Écrit ici, lu ailleurs (focus card, I-071). Pas
    /// observé non plus — cet hôte n'a pas à réagir à sa propre écriture.
    let election: LentilleFocusElection

    var body: some View {
        GeometryReader { geo in
            Color.clear
                // Amorçage : la position de repos est déjà une position de
                // défilement. Sans lui, aucune carte tant que l'utilisateur
                // n'a pas touché l'écran.
                .onAppear { electFromScroll(viewportBottom: geo.frame(in: .global).maxY) }
                // Un tick d'offset = une élection. C'est le SEUL abonnement.
                .adaptiveOnChange(of: relay.offset) { _, _ in
                    electFromScroll(viewportBottom: geo.frame(in: .global).maxY)
                }
        }
        // Purement observationnel : cet hôte couvre la liste, il ne doit
        // intercepter ni tap, ni défilement, ni glissement de rang.
        .allowsHitTesting(false)
    }

    // MARK: - Machine

    /// L'unique chemin d'écriture de l'élu. Le nom dit d'où il vient : d'un
    /// défilement, jamais d'un événement de données.
    private func electFromScroll(viewportBottom: CGFloat) {
        election.adopt(
            Self.elect(
                candidates: registry.candidates,
                viewportBottom: viewportBottom,
                currentId: election.electedId
            )
        )
    }

    // MARK: - Règle pure (testable sans rendu)

    /// Le gagnant, par la loi partagée et rien d'autre : la bande de la
    /// Lentille, l'hystérésis du miroir, l'électeur du miroir.
    ///
    /// `viewportBottom` est le bas de la RÉGION VISIBLE du défilement, dans le
    /// même repère que le `midY` des candidats (global, cf.
    /// `lentilleFocusCandidate`). Il n'est pas constant : split view iPad,
    /// clavier ouvert, rotation le font varier, et une bande figée à une
    /// position d'écran serait fausse partout ailleurs que sur la maquette.
    nonisolated static func elect(
        candidates: [FocalFocusCurve.RowCandidate],
        viewportBottom: CGFloat,
        currentId: String?
    ) -> String? {
        FocalFocusCurve.electFocusRow(
            candidates: candidates,
            focusY: LentilleFocusBand.centerY(viewportBottom: viewportBottom),
            currentId: currentId,
            hysteresis: FocalFocusCurve.focusBandHalfHeight
        )
    }
}
