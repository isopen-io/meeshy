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
                .onAppear { electFromScroll(viewport: geo.frame(in: .global), offsetFromTop: LentilleFocusBand.offsetFromTop(relayOffset: relay.offset)) }
                // Un tick d'offset = une élection. C'est le SEUL abonnement.
                .adaptiveOnChange(of: relay.offset) { _, offset in
                    electFromScroll(viewport: geo.frame(in: .global), offsetFromTop: LentilleFocusBand.offsetFromTop(relayOffset: offset))
                }
        }
        // Purement observationnel : cet hôte couvre la liste, il ne doit
        // intercepter ni tap, ni défilement, ni glissement de rang.
        .allowsHitTesting(false)
    }

    // MARK: - Machine

    /// L'unique chemin d'écriture de l'élu. Le nom dit d'où il vient : d'un
    /// défilement, jamais d'un événement de données.
    private func electFromScroll(viewport: CGRect, offsetFromTop: CGFloat) {
        election.adopt(
            Self.elect(
                candidates: registry.candidates,
                viewportTop: viewport.minY,
                viewportBottom: viewport.maxY,
                offsetFromTop: offsetFromTop,
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
        viewportTop: CGFloat,
        viewportBottom: CGFloat,
        offsetFromTop: CGFloat,
        currentId: String?
    ) -> String? {
        let lawWinner = FocalFocusCurve.electFocusRow(
            candidates: candidates,
            focusY: LentilleFocusBand.centerY(viewportTop: viewportTop, viewportBottom: viewportBottom, offsetFromTop: offsetFromTop),
            currentId: currentId,
            hysteresis: FocalFocusCurve.focusBandHalfHeight
        )
        return holdingCurrent(
            lawWinner: lawWinner,
            currentId: currentId,
            candidates: candidates,
            focusY: LentilleFocusBand.centerY(viewportTop: viewportTop, viewportBottom: viewportBottom, offsetFromTop: offsetFromTop)
        )
    }

    // MARK: - Zone morte (liste qui tremblait, 2026-10-16)

    /// Avance qu'une rangée doit prendre sur l'élu, en distance au foyer,
    /// pour le détrôner : une demi-rangée.
    ///
    /// **Pourquoi la loi seule ne suffit pas ici.** L'hystérésis du miroir garde
    /// le courant tant qu'il est à `focusBandHalfHeight` du foyer. Elle n'a de
    /// zone morte que si deux fois cette demi-bande DÉPASSE le pas des rangées.
    /// Or la liste Lentille rend ses rangées à `Row.height` + l'espacement de
    /// sa `LazyVStack` (`MeeshySpacing.xsPlus`) : 90 pt de pas, exactement deux
    /// demi-bandes. La bascule avant et la bascule arrière tombaient au même
    /// point, et un tremblement d'un point autour de la frontière changeait
    /// l'élu à chaque tick — la magnification sautait d'une rangée à sa voisine
    /// en boucle, deux états superposés en fondu (vidéo du 2026-10-16). Près du
    /// haut de liste, la rampe de `LentilleFocusBand.centerY` déplace le foyer
    /// avec le contenu : la distance varie deux fois plus vite que le doigt.
    ///
    /// La loi gelée n'est pas réécrite : elle désigne toujours le gagnant, et
    /// cette garde ne fait que refuser un changement d'élu qui ne rapporte pas
    /// une demi-rangée. Une cote de PEAU (la rangée), jamais une cote de loi.
    nonisolated static var switchMargin: CGFloat { LentilleMetrics.Row.height / 2 }

    /// Garde le courant si le gagnant de la loi n'est pas plus proche du foyer
    /// que lui d'au moins `margin`. Un courant sorti des candidats (rangée
    /// défilée hors écran) ou l'absence de courant laissent la loi décider.
    nonisolated static func holdingCurrent(
        lawWinner: String?,
        currentId: String?,
        candidates: [FocalFocusCurve.RowCandidate],
        focusY: CGFloat,
        margin: CGFloat = switchMargin
    ) -> String? {
        guard let lawWinner, let currentId, lawWinner != currentId,
              let current = candidates.first(where: { $0.id == currentId }),
              let challenger = candidates.first(where: { $0.id == lawWinner }) else {
            return lawWinner
        }
        let gain = abs(current.midY - focusY) - abs(challenger.midY - focusY)
        return gain < margin ? currentId : lawWinner
    }
}
