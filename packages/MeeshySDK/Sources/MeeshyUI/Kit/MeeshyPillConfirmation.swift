import SwiftUI

/// **Une confirmation dans la pilule** (K11) : un titre, une phrase facultative,
/// deux choix de 44 de haut, neutre au début et destructif à la fin, de largeur
/// égale, empilés quand ils ne tiennent plus côte à côte. Ni en-tête ni rangée :
/// c'est un CORPS que l'hôte pose sous une option `showsHeader: false, keepsRow: false`.
///
/// Elle est modale pour le lecteur d'écran, met la mise au point sur le choix
/// neutre à l'ouverture, et fait de l'échappement un « Annuler ». Elle ne détruit
/// rien elle-même : `confirm.action` est à l'hôte. Chaque choix joue un `light`
/// par le site unique de K02 ; le retour du résultat est à l'hôte.
public struct MeeshyPillConfirmation: View {
    private let title: String
    private let message: String?
    private let cancel: MeeshyPillChoice
    private let confirm: MeeshyPillChoice

    @AccessibilityFocusState private var neutralHasFocus: Bool

    public init(title: String, message: String? = nil, cancel: MeeshyPillChoice, confirm: MeeshyPillChoice) {
        assert(!title.isEmpty, "MeeshyPillConfirmation : le titre est obligatoire et non vide")
        self.title = title
        self.message = message
        self.cancel = cancel
        self.confirm = confirm
    }

    private var choices: [MeeshyPillChoice] { MeeshyExpandingPillRule.ordered([cancel, confirm]) }

    public var body: some View {
        VStack(spacing: MeeshyExpandingPillRecipe.confirmationGap) {
            Text(verbatim: title)
                .font(.headline)
                .foregroundStyle(MeeshyColors.onMedia)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .accessibilityAddTraits(.isHeader)
            if let message {
                Text(verbatim: message)
                    .font(.footnote)
                    .foregroundStyle(MeeshyExpandingPillRecipe.secondaryInk)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
            MeeshyPillChoiceLayout(gap: MeeshyExpandingPillRecipe.choiceGap) {
                MeeshyPillChoiceButton(choice: choices[0])
                    .accessibilityFocused($neutralHasFocus)
                    .keyboardShortcut(.cancelAction)
                MeeshyPillChoiceButton(choice: choices[1])
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(.escape) { MeeshyPillChoiceButton.fire(cancel) }
        .onAppear { neutralHasFocus = true }
    }
}

// MARK: - Un choix

/// Un choix : une capsule à fond plein (le voile doux ou le rouge), le libellé
/// au centre, 44 de haut au moins. Les fonds sont PLEINS, jamais un second verre.
struct MeeshyPillChoiceButton: View {
    let choice: MeeshyPillChoice

    var body: some View {
        Button { Self.fire(choice) } label: {
            Text(verbatim: choice.title)
                .font(.subheadline.weight(.semibold))
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: MeeshyExpandingPillRecipe.choiceHeight)
                .padding(.horizontal, MeeshyExpandingPillRecipe.choiceInset)
        }
        .buttonStyle(MeeshyPillChoiceStyle(role: choice.role))
        .accessibilityHint(choice.hint ?? "")
    }

    static func fire(_ choice: MeeshyPillChoice) {
        MeeshyGlassButtonTrigger.perform(isEnabled: true, haptic: .light, action: choice.action)
    }
}

private struct MeeshyPillChoiceStyle: ButtonStyle {
    let role: MeeshyPillChoiceRole

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: MeeshyExpandingPillRecipe.choiceRadius, style: .continuous)
        return configuration.label
            .foregroundStyle(role == .destructive ? MeeshyExpandingPillRecipe.destructiveInk : MeeshyColors.onMedia)
            .background(shape.fill(fill(isPressed: configuration.isPressed)))
            .contentShape(shape)
    }

    private func fill(isPressed: Bool) -> Color {
        switch role {
        case .neutral:
            return MeeshyColors.onMedia.opacity(
                isPressed ? MeeshyExpandingPillRecipe.neutralPressedFillOpacity : MeeshyExpandingPillRecipe.neutralFillOpacity
            )
        case .destructive:
            return MeeshyExpandingPillRecipe.destructiveFill.opacity(
                isPressed ? MeeshyExpandingPillRecipe.destructivePressedFillOpacity : 1
            )
        }
    }
}

// MARK: - La disposition des choix

/// Les choix côte à côte à largeur égale, ou empilés (le destructif en dernier)
/// quand l'un d'eux ne tient plus dans sa moitié. Les positions sont comptées
/// depuis le DÉBUT : SwiftUI retourne lui-même une disposition en RTL.
struct MeeshyPillChoiceLayout: Layout {
    let gap: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ideals = subviews.map { $0.sizeThatFits(.unspecified) }
        guard let available = proposal.width, available.isFinite else {
            let natural = ideals.map(\.width).reduce(0, +) + gap * CGFloat(max(ideals.count - 1, 0))
            return CGSize(width: natural, height: ideals.map(\.height).max() ?? 0)
        }
        return CGSize(width: available, height: frames(in: available, subviews: subviews, ideals: ideals).height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let ideals = subviews.map { $0.sizeThatFits(.unspecified) }
        let laid = frames(in: bounds.width, subviews: subviews, ideals: ideals)
        for (index, subview) in subviews.enumerated() {
            let frame = laid.frames[index]
            subview.place(
                at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                anchor: .topLeading,
                proposal: ProposedViewSize(width: frame.width, height: frame.height)
            )
        }
    }

    private func frames(in available: CGFloat, subviews: Subviews, ideals: [CGSize]) -> (frames: [CGRect], height: CGFloat) {
        let count = CGFloat(subviews.count)
        guard count > 0 else { return ([], 0) }
        let stacked = MeeshyExpandingPillRule.stacksChoices(idealWidths: ideals.map(\.width), available: available, gap: gap)
        let width = stacked ? available : (available - gap * (count - 1)) / count
        let heights = subviews.map { $0.sizeThatFits(ProposedViewSize(width: width, height: nil)).height }
        if stacked {
            var y: CGFloat = 0
            let rects = heights.map { height -> CGRect in
                defer { y += height + gap }
                return CGRect(x: 0, y: y, width: width, height: height)
            }
            return (rects, max(y - gap, 0))
        }
        let row = heights.max() ?? 0
        let rects = heights.indices.map { index in
            CGRect(x: CGFloat(index) * (width + gap), y: 0, width: width, height: row)
        }
        return (rects, row)
    }
}
