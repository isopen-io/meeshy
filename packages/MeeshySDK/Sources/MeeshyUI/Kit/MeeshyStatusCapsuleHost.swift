import SwiftUI

// MARK: - La séance

/// **Ce que l'hôte joue pour UNE capsule** : l'haptique de sa nature et son
/// annonce, une fois par `id` (le même `id` redit dans les 2 s se tait), puis le
/// minuteur de la loi. Aucun singleton : les effets entrent en paramètres, donc
/// le temps et la vibration se jouent sans écran.
///
/// Le minuteur est la tâche qui l'attend : le remplacement ou le démontage
/// l'annule, et un minuteur annulé ne retire rien — il ne ferme jamais son
/// successeur.
@MainActor
final class MeeshyStatusCapsuleSession {
    struct Effects {
        var play: (MeeshyStatusCapsuleFeedback) -> Void
        var announce: (String, Bool) -> Void
        var now: () -> Date
        var sleep: (Int) async throws -> Void
        var isScreenReaderOn: () -> Bool

        /// Le site unique : l'haptique du SDK, l'annonce du lecteur d'écran, le
        /// sommeil de la tâche.
        static var system: Effects {
            Effects(
                play: { feedback in
                    switch feedback {
                    case .light: HapticFeedback.light()
                    case .success: HapticFeedback.success()
                    case .warning: HapticFeedback.warning()
                    case .error: HapticFeedback.error()
                    }
                },
                announce: { text, urgent in
                    AdaptiveAccessibility.announce(text, priority: urgent ? .high : .normal)
                },
                now: { Date() },
                sleep: { milliseconds in try await Task.sleep(for: .milliseconds(milliseconds)) },
                isScreenReaderOn: { AdaptiveAccessibility.isAssistiveTechRunning }
            )
        }
    }

    private let effects: Effects
    private var lastSpoken: MeeshyStatusCapsuleTiming.Spoken?

    init(effects: Effects? = nil) {
        self.effects = effects ?? .system
    }

    nonisolated deinit {}

    func run(_ item: MeeshyStatusCapsuleItem,
             haptic: MeeshyStatusCapsuleHostHaptic,
             retire: (String) -> Void) async {
        speakIfDue(item, haptic: haptic)
        guard let milliseconds = MeeshyStatusCapsuleTiming.visibleMilliseconds(
            duration: item.duration,
            hasAction: item.action != nil,
            isScreenReaderOn: effects.isScreenReaderOn()
        ) else { return }
        do {
            try await effects.sleep(milliseconds)
        } catch {
            return
        }
        guard !Task.isCancelled else { return }
        retire(item.id)
    }

    private func speakIfDue(_ item: MeeshyStatusCapsuleItem, haptic: MeeshyStatusCapsuleHostHaptic) {
        let now = effects.now()
        guard MeeshyStatusCapsuleTiming.speaks(id: item.id, at: now, last: lastSpoken) else { return }
        lastSpoken = MeeshyStatusCapsuleTiming.Spoken(id: item.id, at: now)
        if haptic == .automatic { effects.play(item.kind.feedback) }
        effects.announce(
            MeeshyStatusCapsuleRecipe.spokenText(message: item.message, detail: item.detail),
            item.kind.announcesUrgently
        )
    }
}

// MARK: - L'hôte

public extension View {
    /// **Pose la capsule de statut au-dessus de ce qui porte l'écran** (K14) :
    /// `item` non nul ⇒ elle paraît, au bord `edge`, avec l'haptique de sa nature
    /// (`haptic: .none` laisse l'app jouer le sien) et l'annonce du lecteur
    /// d'écran ; elle se retire seule à l'heure de la loi, ou reste tant que l'hôte
    /// ne la retire pas quand elle porte une action. Une capsule par hôte : la
    /// dernière remplace. L'hôte pose `item` à `nil` quand l'action est faite,
    /// que la capsule est glissée ou fermée — en visant l'`id`, jamais son successeur.
    func meeshyStatusCapsule(_ item: Binding<MeeshyStatusCapsuleItem?>,
                             edge: MeeshyStatusCapsuleEdge = .bottom,
                             haptic: MeeshyStatusCapsuleHostHaptic = .automatic) -> some View {
        modifier(MeeshyStatusCapsuleHost(item: item, edge: edge, haptic: haptic))
    }
}

struct MeeshyStatusCapsuleHost: ViewModifier {
    @Binding var item: MeeshyStatusCapsuleItem?
    let edge: MeeshyStatusCapsuleEdge
    let haptic: MeeshyStatusCapsuleHostHaptic

    /// Créée à la première capsule, pas à chaque rendu de l'hôte : la valeur
    /// initiale d'un `@State` se réévalue à chaque construction du modificateur.
    @State private var session: MeeshyStatusCapsuleSession?
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion

    func body(content: Content) -> some View {
        content
            .overlay(alignment: edge == .bottom ? .bottom : .top) {
                ZStack { overlay }.animation(animation, value: item?.id)
            }
            .task(id: item) { await present(item) }
    }

    @ViewBuilder
    private var overlay: some View {
        if let current = item {
            MeeshyStatusCapsule(
                current.message,
                detail: current.detail,
                systemImage: current.systemImage,
                kind: current.kind,
                action: current.action.map { done(current, $0) },
                closeLabel: current.closeLabel,
                onDismiss: dismissal(of: current),
                edge: edge,
                tone: current.tone,
                tint: current.tint
            )
            .equatable()
            .padding(.horizontal, MeeshyStatusCapsuleRecipe.sideMargin)
            .padding(edge == .bottom ? .bottom : .top, MeeshyStatusCapsuleRecipe.edgeGap)
            .transition(transition)
            .id(current.id)
        }
    }

    // MARK: Séance

    private func present(_ current: MeeshyStatusCapsuleItem?) async {
        guard let current else { return }
        let running = session ?? MeeshyStatusCapsuleSession()
        if session == nil { session = running }
        await running.run(current, haptic: haptic) { retire($0) }
    }

    /// Retire la capsule `id` — et elle seule : un successeur déjà posé reste.
    private func retire(_ id: String) {
        guard item?.id == id else { return }
        item = nil
    }

    /// L'action part, puis l'hôte retire la capsule.
    private func done(_ current: MeeshyStatusCapsuleItem, _ action: MeeshyStatusCapsuleAction) -> MeeshyStatusCapsuleAction {
        MeeshyStatusCapsuleAction(label: action.label, systemImage: action.systemImage) {
            action.perform()
            retire(current.id)
        }
    }

    /// Fermer : glisser, ✕ ou action nommée, seulement si l'élément se ferme.
    private func dismissal(of current: MeeshyStatusCapsuleItem) -> (() -> Void)? {
        guard current.onDismiss != nil else { return nil }
        return {
            current.onDismiss?()
            retire(current.id)
        }
    }

    // MARK: Mouvement

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
    }

    /// Un glissement de 8 pt depuis le bord et un fondu au ressort rapide ; sous
    /// « réduire les animations », le fondu seul, en 150 ms. Translation et
    /// opacité, jamais la largeur.
    private var animation: Animation {
        reduceMotion ? .easeInOut(duration: MeeshyStatusCapsuleRecipe.reducedFadeSeconds) : MeeshyAnimation.springFast
    }

    private var transition: AnyTransition {
        let offset = reduceMotion ? 0 : MeeshyStatusCapsuleRecipe.slideOffset * (edge == .bottom ? 1 : -1)
        return .modifier(
            active: MeeshyStatusCapsuleSlide(offset: offset, opacity: 0),
            identity: MeeshyStatusCapsuleSlide(offset: 0, opacity: 1)
        )
    }
}

/// L'entrée et la sortie : une translation et une opacité.
struct MeeshyStatusCapsuleSlide: ViewModifier {
    let offset: CGFloat
    let opacity: Double

    func body(content: Content) -> some View {
        content.offset(y: offset).opacity(opacity)
    }
}
