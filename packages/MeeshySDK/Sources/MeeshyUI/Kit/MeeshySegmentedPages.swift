import SwiftUI

/// **K03 — le contenu d'un choix segmenté** (#19606, planche `Sys-Mouvement`
/// § 02) : la page de l'option choisie, qui glisse dans le sens du geste. Vers une
/// option plus loin dans `order`, la nouvelle page entre par le bord de fin et
/// l'ancienne sort par celui de début ; vers une plus proche, l'inverse. Sous
/// « Réduire les animations », un simple fondu.
///
/// Le sens est posé un rendu AVANT l'échange : la page qui sort garde la
/// transition de son dernier rendu, elle doit donc déjà porter le nouveau sens.
public struct MeeshySegmentedPages<ID: Hashable & Sendable, Content: View>: View {
    private let selection: ID
    private let order: [ID]
    private let content: (ID) -> Content

    @State private var shown: ID
    @State private var travel: MeeshySegmentedTravel = .none
    @State private var request = 0

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    public init(selection: ID, order: [ID], @ViewBuilder content: @escaping (ID) -> Content) {
        self.selection = selection
        self.order = order
        self.content = content
        _shown = State(initialValue: selection)
    }

    public var body: some View {
        ZStack(alignment: .top) {
            content(shown)
                .id(shown)
                .meeshyTransition(Self.transition(for: travel), reduced: .opacity)
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .adaptiveOnChange(of: selection) { _, next in
            travel = MeeshySegmentedLaw.travel(from: order.firstIndex(of: shown), to: order.firstIndex(of: next))
            request &+= 1
        }
        .adaptiveOnChange(of: request) { _, _ in
            guard shown != selection else { return }
            let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
            let next = selection
            meeshyWithMotion(.morph, reduceMotion: reduce) { shown = next }
        }
    }

    /// La transition d'une page selon le sens : asymétrique, glissée et fondue ;
    /// un fondu seul quand rien ne dit de sens.
    static func transition(for travel: MeeshySegmentedTravel) -> AnyTransition {
        guard let insertion = travel.insertionEdge, let removal = travel.removalEdge else { return .opacity }
        return .asymmetric(
            insertion: .move(edge: insertion).combined(with: .opacity),
            removal: .move(edge: removal).combined(with: .opacity)
        )
    }
}
