import SwiftUI

/// Les mots de l'en-tête, dans les sept langues. L'hôte les remplace
/// (« Retour aux actions ») par `backLabel` et `closeLabel`.
public enum MeeshyExpandingPillCopy {
    public static var back: String {
        String(localized: "kit.expanding_pill.back", defaultValue: "Retour", bundle: .module)
    }

    public static var close: String {
        String(localized: "kit.expanding_pill.close", defaultValue: "Fermer", bundle: .module)
    }
}

/// **L'en-tête d'une option** (K11) : ‹ Retour · titre · accessoire · ✕ Fermer.
/// Exposé seul pour les hôtes qui n'ouvrent pas la pilule (une colonne, une
/// feuille). Un bouton n'existe que si son rappel existe ; le titre reste centré,
/// à égale distance des deux bords, et ne passe jamais sous un bouton ni sous
/// l'accessoire (`MeeshyExpandingPillHeaderLayout`). Sans ✕, l'accessoire prend le
/// bord de fin (O9 : « 86 / 1000 »). Aucun filet, aucun verre : ‹ et ✕ sont des
/// boutons doux de K02, de 40, qui jouent leur haptique par le site unique de K02.
///
/// `Equatable` quand il n'a pas d'accessoire : un hôte qui se re-rend parce que
/// son corps a changé ne re-rend pas l'en-tête (comparé sur le titre, la présence
/// des boutons et leurs libellés ; les fermetures restent hors de la comparaison).
public struct MeeshyExpandingPillHeader<Trailing: View>: View {
    private let title: String
    private let onBack: (() -> Void)?
    private let onClose: (() -> Void)?
    private let backLabel: String
    private let closeLabel: String
    private let takesFocus: Bool
    private let trailing: Trailing

    @AccessibilityFocusState private var titleHasFocus: Bool

    public init(
        title: String,
        onBack: (() -> Void)? = nil,
        onClose: (() -> Void)? = nil,
        backLabel: String = MeeshyExpandingPillCopy.back,
        closeLabel: String = MeeshyExpandingPillCopy.close,
        takesFocus: Bool = false,
        @ViewBuilder trailing: () -> Trailing
    ) {
        assert(!title.isEmpty, "MeeshyExpandingPillHeader : le titre est obligatoire et non vide")
        self.title = title
        self.onBack = onBack
        self.onClose = onClose
        self.backLabel = backLabel
        self.closeLabel = closeLabel
        self.takesFocus = takesFocus
        self.trailing = trailing()
    }

    /// L'ordre de lecture : ‹, titre, accessoire, ✕ (la hiérarchie dans l'arbre
    /// met le titre en premier, car il est posé sous les boutons).
    private static var backPriority: Double { 4 }
    private static var titlePriority: Double { 3 }
    private static var trailingPriority: Double { 2 }
    private static var closePriority: Double { 1 }

    private var slot: CGFloat { CGFloat(MeeshyExpandingPillRecipe.headerButtonSize.diameter) }
    private var gap: CGFloat { MeeshyExpandingPillRecipe.headerButtonGap }

    private var slots: MeeshyExpandingPillRule.HeaderSlots {
        MeeshyExpandingPillRule.headerSlots(
            hasBack: onBack != nil, hasClose: onClose != nil, hasTrailing: Trailing.self != EmptyView.self
        )
    }

    public var body: some View {
        MeeshyExpandingPillHeaderLayout(gap: gap) {
            leading
            titleText
            end
        }
        .frame(maxWidth: .infinity, minHeight: slot)
        .accessibilityElement(children: .contain)
        .onAppear { if takesFocus { titleHasFocus = true } }
    }

    private var titleText: some View {
        Text(verbatim: title)
            .font(.headline)
            .foregroundStyle(MeeshyColors.onMedia)
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .accessibilityAddTraits(.isHeader)
            .accessibilityFocused($titleHasFocus)
            .accessibilitySortPriority(Self.titlePriority)
    }

    @ViewBuilder
    private var leading: some View {
        if let onBack {
            MeeshyGlassButton(
                systemImage: "chevron.backward", label: backLabel, kind: .soft,
                size: MeeshyExpandingPillRecipe.headerButtonSize, action: onBack
            )
            .accessibilitySortPriority(Self.backPriority)
        } else {
            reservedSlot
        }
    }

    /// Le bord de fin : l'accessoire puis ✕ ; vide, la place de ✕ est réservée.
    @ViewBuilder
    private var end: some View {
        if slots.reservesEnd {
            reservedSlot
        } else {
            HStack(spacing: gap) {
                trailing
                    .foregroundStyle(MeeshyExpandingPillRecipe.secondaryInk)
                    .accessibilitySortPriority(Self.trailingPriority)
                if let onClose {
                    MeeshyGlassButton(
                        systemImage: "xmark", label: closeLabel, kind: .soft,
                        size: MeeshyExpandingPillRecipe.headerButtonSize, action: onClose
                    )
                    .accessibilitySortPriority(Self.closePriority)
                }
            }
        }
    }

    private var reservedSlot: some View {
        Color.clear.frame(width: slot, height: slot).accessibilityHidden(true)
    }
}

// MARK: - La disposition de l'en-tête

/// ‹ au bord de début, l'accessoire et ✕ au bord de fin, le titre au centre avec
/// la MÊME marge des deux côtés tant qu'il y tient ; sinon il glisse vers le bord le
/// plus libre et prend toute la place entre les deux (`headerTitleSlot`). Il ne
/// passe donc jamais sous un bouton ni sous l'accessoire (un compteur, une bascule
/// Traduit / Original), et une grande police ne le réduit pas à une lettre. Les
/// positions sont comptées depuis le DÉBUT : SwiftUI retourne lui-même une
/// disposition en RTL.
struct MeeshyExpandingPillHeaderLayout: Layout {
    let gap: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard subviews.count == 3 else { return .zero }
        let measure = measured(subviews: subviews, width: proposal.width)
        return CGSize(width: measure.width, height: measure.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard subviews.count == 3 else { return }
        let measure = measured(subviews: subviews, width: bounds.width)
        let midY = bounds.midY
        subviews[0].place(at: CGPoint(x: bounds.minX, y: midY), anchor: .leading, proposal: ProposedViewSize(measure.start))
        subviews[2].place(at: CGPoint(x: bounds.maxX, y: midY), anchor: .trailing, proposal: ProposedViewSize(measure.end))
        subviews[1].place(
            at: CGPoint(x: bounds.minX + measure.title.center, y: midY), anchor: .center,
            proposal: ProposedViewSize(width: measure.title.width, height: nil)
        )
    }

    private func measured(
        subviews: Subviews, width: CGFloat?
    ) -> (start: CGSize, end: CGSize, title: MeeshyExpandingPillRule.HeaderTitleSlot, width: CGFloat, height: CGFloat) {
        let start = subviews[0].sizeThatFits(.unspecified)
        let end = subviews[2].sizeThatFits(.unspecified)
        let natural = subviews[1].sizeThatFits(.unspecified).width
        let inset = MeeshyExpandingPillRule.headerTitleInset(start: start.width, end: end.width, gap: gap)
        let total = width.flatMap { $0.isFinite ? $0 : nil } ?? natural + 2 * inset
        let slot = MeeshyExpandingPillRule.headerTitleSlot(
            width: total, start: start.width, end: end.width, gap: gap, natural: natural
        )
        let title = subviews[1].sizeThatFits(ProposedViewSize(width: slot.width, height: nil))
        return (start, end, slot, total, max(start.height, end.height, title.height))
    }
}

public extension MeeshyExpandingPillHeader where Trailing == EmptyView {
    init(
        title: String,
        onBack: (() -> Void)? = nil,
        onClose: (() -> Void)? = nil,
        backLabel: String = MeeshyExpandingPillCopy.back,
        closeLabel: String = MeeshyExpandingPillCopy.close,
        takesFocus: Bool = false
    ) {
        self.init(
            title: title, onBack: onBack, onClose: onClose, backLabel: backLabel, closeLabel: closeLabel,
            takesFocus: takesFocus, trailing: { EmptyView() }
        )
    }
}

extension MeeshyExpandingPillHeader: Equatable where Trailing == EmptyView {
    public static func == (lhs: MeeshyExpandingPillHeader, rhs: MeeshyExpandingPillHeader) -> Bool {
        lhs.title == rhs.title
            && (lhs.onBack == nil) == (rhs.onBack == nil)
            && (lhs.onClose == nil) == (rhs.onClose == nil)
            && lhs.backLabel == rhs.backLabel
            && lhs.closeLabel == rhs.closeLabel
            && lhs.takesFocus == rhs.takesFocus
    }
}
