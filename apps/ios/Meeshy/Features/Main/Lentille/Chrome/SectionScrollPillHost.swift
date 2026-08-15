import SwiftUI
import MeeshyUI

/// Hôte de la pilule de section — le SEUL endroit qui tient l'état de la loi
/// d'activité de défilement pour la liste (arbitrage LWS-6/I-063bis).
///
/// **Pourquoi une vue nominale plutôt qu'un `@State` dans la liste.** La
/// pilule doit réagir à CHAQUE événement de défilement (« visible au premier
/// événement, invisible `lingerMs` après l'arrêt »), pas seulement aux
/// changements de direction. La source de ces événements existe déjà :
/// `ScrollOffsetRelay`, écrit par l'UNIQUE détecteur de la liste
/// (`onScrollOffsetChange` de `MeeshyRefreshableScroll`). Aucun observateur
/// n'est créé ici — un consommateur de plus s'abonne à un relais qui publiait
/// déjà, exactement comme `ConversationListHeaderOverlay`, « SEUL abonné »
/// jusqu'ici précisément pour que le body de la liste ne se ré-exécute pas à
/// 120 Hz. Tenir cet état dans `ConversationListView` aurait reproduit le
/// défaut que ce relais a été créé pour éliminer : ~99 rangs re-diffés à
/// chaque tick.
///
/// La LOI décide, cette vue recopie : `ScrollTimePillLaw` (miroir Focal/Core,
/// GELÉ S1, partagé avec la pilule du fil — amendement A4) reçoit un
/// `.scrolled` par tick d'offset et rend `isVisible`. La fenêtre de
/// persistance ne s'écrit nulle part ici (garde R15) : elle est LUE
/// (`ScrollTimePillLaw.lingerMs`) pour savoir QUAND re-sonder, jamais pour
/// décider.
struct SectionScrollPillHost: View {

    /// Le relais EXISTANT. `@ObservedObject` : ce petit hôte se re-rend au
    /// rythme du défilement — c'est voulu, et c'est tout ce qui se re-rend.
    @ObservedObject var relay: ScrollOffsetRelay
    /// Libellé déjà résolu par la liste (section en tête). Le changer ne
    /// réinitialise pas l'état ci-dessous : même type, même position dans
    /// l'arbre.
    let title: String

    @State private var activity: ScrollActivityState = ScrollTimePillLaw.initialState()
    @State private var isVisible = false
    /// Une seule sonde en vol à la fois. Sans ce verrou, un défilement de
    /// 60 ticks/s armerait 60 `Task` dormantes par seconde pour un seul
    /// effacement à venir.
    @State private var probeScheduled = false

    var body: some View {
        SectionScrollPill(isVisible: isVisible, text: title)
            .adaptiveOnChange(of: relay.offset) { _, _ in noteScrollEvent() }
    }

    // MARK: - Règles pures (testables sans rendu)

    /// Horodatage injecté dans la loi, en MILLISECONDES — la loi ne lit jamais
    /// l'horloge murale elle-même.
    nonisolated static func timestamp(_ date: Date = Date()) -> Double {
        date.timeIntervalSince1970 * 1000
    }

    /// Dans combien de temps re-sonder ? Le reste de la fenêtre de la loi
    /// depuis le DERNIER défilement — jamais une constante recopiée, jamais
    /// une décision de visibilité (c'est `isVisible` qui décide, et lui seul).
    /// `0` ⇒ rien à sonder : soit aucun défilement encore observé, soit la
    /// fenêtre est déjà écoulée.
    nonisolated static func probeDelayMs(state: ScrollActivityState, at instant: Double) -> Double {
        guard let lastScrolledAt = state.lastScrolledAt else { return 0 }
        return max(0, ScrollTimePillLaw.lingerMs - (instant - lastScrolledAt))
    }

    // MARK: - Machine

    /// Un tick d'offset = un `.scrolled`. C'est le seul point d'entrée.
    private func noteScrollEvent() {
        let instant = Self.timestamp()
        activity = ScrollTimePillLaw.reduce(state: activity, event: .scrolled(at: instant))
        applyLaw(at: instant)
        armProbe(at: instant)
    }

    /// Re-sondage à l'ÉCHÉANCE exacte de la fenêtre courante. Un défilement
    /// survenu entre-temps a repoussé l'échéance : le `.tick` la constate, la
    /// pilule reste visible, et la sonde se réarme sur le reste — la pilule
    /// s'efface donc `lingerMs` après le DERNIER défilement, pas après le
    /// premier ni « à la prochaine bascule de direction ».
    private func armProbe(at instant: Double) {
        guard !probeScheduled else { return }
        let delayMs = Self.probeDelayMs(state: activity, at: instant)
        guard delayMs > 0 else { return }
        probeScheduled = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(delayMs * 1_000_000))
            probeScheduled = false
            let now = Self.timestamp()
            // `.tick` ne réarme JAMAIS l'état — il ne fait que rendre la main
            // à la loi pour re-sonder (contrat de `ScrollTimePillLaw`).
            activity = ScrollTimePillLaw.reduce(state: activity, event: .tick(at: now))
            applyLaw(at: now)
            armProbe(at: now)
        }
    }

    /// Écriture gardée par l'inégalité : la sonde ne doit invalider cette vue
    /// que lorsque la visibilité change réellement.
    private func applyLaw(at instant: Double) {
        let visible = ScrollTimePillLaw.isVisible(state: activity, at: instant)
        if visible != isVisible { isVisible = visible }
    }
}
