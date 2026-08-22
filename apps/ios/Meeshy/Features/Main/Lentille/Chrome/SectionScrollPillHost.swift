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
/// Positions GLOBALES (minY) des stickers de section MONTÉS — boîte inerte,
/// écrite par les stickers eux-mêmes à chaque layout, jamais observée. Même
/// patron que `LentilleFocusCandidateRegistry` : écrire n'invalide rien.
nonisolated final class LentilleSectionPositionRegistry {
    private(set) var minYById: [String: CGFloat] = [:]

    func register(id: String, minY: CGFloat) {
        minYById[id] = minY
    }

    func unregister(id: String) {
        minYById.removeValue(forKey: id)
    }

    /// Ligne d'épinglage des stickers (GLOBALE), mesurée par la liste sur le
    /// conteneur de défilement — `nil` tant qu'aucun layout ne l'a posée.
    private(set) var pinLine: CGFloat?

    func registerPinLine(_ value: CGFloat) {
        pinLine = value
    }

    /// Fraction de point tolérée au-dessus de la ligne : un sticker épinglé
    /// se pose à `pinLine` à l'arrondi de layout près.
    static let pinLineTolerance: CGFloat = 1

    /// La section ÉPINGLÉE = le sticker qui TIENT la ligne : le plus BAS parmi
    /// ceux situés à la ligne ou au-dessus (un `LazyVStack(pinnedViews:)`
    /// garde un moment le sticker poussé par le suivant AU-DESSUS de la ligne
    /// avant de le démonter — « le plus haut à l'écran » nommait une section
    /// déjà passée, 2026-08-21). Aucun sticker à la ligne (liste au repos en
    /// haut, ou ligne pas encore mesurée) ⇒ le plus haut, la première section
    /// à venir. Départage déterministe par id — un dictionnaire n'a pas d'ordre.
    nonisolated static func pinnedSectionId(positions: [String: CGFloat], pinLine: CGFloat?) -> String? {
        if let pinLine {
            let holding = positions.filter { $0.value <= pinLine + pinLineTolerance }
            if let pinned = holding.max(by: { lhs, rhs in
                lhs.value != rhs.value ? lhs.value < rhs.value : lhs.key > rhs.key
            }) {
                return pinned.key
            }
        }
        return positions.min { lhs, rhs in
            lhs.value != rhs.value ? lhs.value < rhs.value : lhs.key < rhs.key
        }?.key
    }
}

struct SectionScrollPillHost: View {

    /// Le relais EXISTANT. `@ObservedObject` : ce petit hôte se re-rend au
    /// rythme du défilement — c'est voulu, et c'est tout ce qui se re-rend.
    @ObservedObject var relay: ScrollOffsetRelay
    /// Libellé déjà résolu par la liste (section en tête). Le changer ne
    /// réinitialise pas l'état ci-dessous : même type, même position dans
    /// l'arbre.
    let title: String
    /// Les sections RENDUES, pour nommer la section épinglée (2026-08-21).
    var sections: [ConversationSection] = []
    /// Boîte inerte alimentée par les stickers (voir ci-dessus). `nil` ⇒ le
    /// titre de repli seul.
    var positions: LentilleSectionPositionRegistry? = nil

    @State private var activity: ScrollActivityState = ScrollTimePillLaw.initialState()
    @State private var isVisible = false
    /// Une seule sonde en vol à la fois. Sans ce verrou, un défilement de
    /// 60 ticks/s armerait 60 `Task` dormantes par seconde pour un seul
    /// effacement à venir.
    @State private var probeScheduled = false

    /// Le libellé suit la section ÉPINGLÉE, relue au tick (le sticker du haut
    /// de l'écran), jamais « la dernière rangée apparue » : en descendant, les
    /// rangées apparaissent par le BAS et nommaient la section suivante
    /// (retour visuel 2026-08-21).
    private var liveTitle: String {
        guard let positions,
              let id = LentilleSectionPositionRegistry.pinnedSectionId(positions: positions.minYById, pinLine: positions.pinLine),
              let section = sections.first(where: { $0.id == id }) else { return title }
        return LentilleSticker.displayTitle(section.name)
    }

    var body: some View {
        SectionScrollPill(isVisible: isVisible, text: liveTitle)
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
