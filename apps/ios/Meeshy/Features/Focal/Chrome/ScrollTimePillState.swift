import Foundation
import MeeshySDK

/// État réactif de la pilule « jour · heure » du fil — contrat
/// `focal-implementation-contract.md` §WS-2/§3.9. Pilote
/// `ScrollTimePillOverlay` en pilotant la loi GELÉE
/// `ScrollTimePillLaw`/`ScrollActivityEvent` (`Focal/Core/ScrollTimePillLaw.swift`,
/// M-044, amendement A4 : une loi, deux libellés — celle-ci ET la pilule de
/// section de la Lentille consomment la MÊME machine et la MÊME constante
/// `lingerMs`).
///
/// **Unités — MILLISECONDES.** Ce pilote ne convertit RIEN : le `at` reçu
/// est transmis tel quel à la loi, qui le compare à `lingerMs = 900`. Tout
/// appelant DOIT donc injecter des millisecondes — c'est déjà le cas des
/// deux peaux réelles (`MessageListViewController.nowMs()` =
/// `timeIntervalSince1970 * 1000`, pour `.scrolled` comme pour `.tick` ;
/// `SectionScrollPillHost.timestamp()` côté Lentille). Injecter des
/// SECONDES (un `TimeInterval` brut, ou un `lingerMs / 1000`) élargirait la
/// fenêtre d'un facteur 1 000 et la pilule ne s'effacerait plus jamais.
/// `ScrollTimePillStateTests.test_lingerBoundary_isMeasuredInMilliseconds`
/// monte la garde à ±1 ms de la borne.
///
/// **Écart assumé vs contrat §3.9** (F-081, RE-PREUVE) : le contrat esquisse
/// un `ScrollTimePillLaw.Event` PROPRE (`.opened`/`.scrolled`/`.tick`/
/// `.headerExpanded`) et une `fadeDuration` sur la loi elle-même. La loi
/// RÉELLE, gelée (M-044), n'a que `ScrollActivityEvent.scrolled(at:)`/`.tick(at:)`
/// et AUCUNE `fadeDuration` — seul `lingerMs = 900` existe. Ce fichier :
/// - consomme `ScrollActivityEvent` (le type réel) plutôt que le
///   `ScrollTimePillLaw.Event` imaginé par le contrat ;
/// - porte `isHeaderExpanded` comme un état de PEAU distinct, combiné à la
///   visibilité de la loi (`isVisible = loi.isVisible && !isHeaderExpanded`)
///   — parité avec `MessageDayStickyState` (`Bubble/MessageDayStickyOverlay.swift`),
///   qui fait exactement ce choix pour le sticker de date ;
/// - n'expose PAS de `fadeDuration` : absente de la loi, elle n'a pas à être
///   réintroduite ici (garde R15 — pas de constante de loi hors
///   `packages/shared`/son miroir). Voir `ScrollTimePillOverlay` pour le
///   point d'atterrissage exact de cette lacune.
@MainActor
final class ScrollTimePillState: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published private(set) var label: String?
    @Published private(set) var isVisible: Bool = false
    @Published var isDark: Bool = false
    @Published var isHeaderExpanded: Bool = false {
        didSet { recomputeVisibility() }
    }

    private var lawState: ScrollActivityState = ScrollTimePillLaw.initialState()
    private var lastKnownAt: Double = 0

    init() {}

    /// Reçoit un événement de la loi partagée. `label` n'est mis à jour QUE
    /// sur `.scrolled` (le moment où la peau connaît le message en focus) —
    /// un `.tick` ne fait que ré-évaluer la fenêtre de visibilité, jamais le
    /// texte affiché (même contrat que la loi : `.tick` ne réarme rien).
    func note(_ event: ScrollActivityEvent, label: String? = nil) {
        lawState = ScrollTimePillLaw.reduce(state: lawState, event: event)

        switch event {
        case .scrolled(let at):
            lastKnownAt = at
            if let label { self.label = label }
        case .tick(let at):
            lastKnownAt = at
        }

        recomputeVisibility()
    }

    private func recomputeVisibility() {
        let next = !isHeaderExpanded && ScrollTimePillLaw.isVisible(state: lawState, at: lastKnownAt)
        // Garde d'égalité : `note(.scrolled)` arrive à CHAQUE frame de
        // défilement — sans elle, chaque frame publiait un `objectWillChange`
        // pour une valeur inchangée (audit perf 2026-08-18, même règle que
        // `FocalTimestampRevealState`).
        guard next != isVisible else { return }
        isVisible = next
    }
}

/// Formatage du libellé « Mercredi · 17:42 » — jour via `MessageDayLabel`
/// (`Bubble/MessageDayLabel.swift`), heure via `TimeStringCache`
/// (`MeeshySDK`, `Persistence/MessageRecord.swift`). AUCUN `DateFormatter`
/// neuf (contrat §WS-2) : les deux formatteurs existants sont réutilisés
/// verbatim.
///
/// PAS `nonisolated` : `MessageDayLabel` (`Bubble/MessageDayLabel.swift`)
/// n'est lui-même pas marqué `nonisolated` — dans la cible `Meeshy`
/// (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, `project.yml`), il est donc
/// implicitement isolé `@MainActor`. Un appelant `nonisolated` ne peut pas
/// l'invoquer de façon synchrone ; ce formateur reste donc sur l'isolation
/// par défaut de la cible plutôt que de s'en extraire artificiellement.
enum ScrollTimePillLabelFormatter {
    static func label(
        for date: Date,
        now: Date,
        calendar: Calendar,
        locale: Locale,
        today: String = "Aujourd'hui",
        yesterday: String = "Hier",
        dayBeforeYesterday: String = "Avant-hier"
    ) -> String {
        let day = MessageDayLabel.label(
            for: date,
            now: now,
            calendar: calendar,
            locale: locale,
            today: today,
            yesterday: yesterday,
            dayBeforeYesterday: dayBeforeYesterday
        )
        let time = TimeStringCache.shared.format(date)
        return "\(day) · \(time)"
    }
}
