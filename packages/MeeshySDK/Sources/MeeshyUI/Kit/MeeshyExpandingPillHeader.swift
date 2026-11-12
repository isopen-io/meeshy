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
/// feuille). Un bouton n'existe que si son rappel existe, mais SA PLACE reste
/// réservée : le titre reste centré. Aucun filet, aucun verre : ‹ et ✕ sont des
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

    public var body: some View {
        ZStack {
            Text(verbatim: title)
                .font(.headline)
                .foregroundStyle(MeeshyColors.onMedia)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .padding(.horizontal, slot + gap)
                .accessibilityAddTraits(.isHeader)
                .accessibilityFocused($titleHasFocus)
                .accessibilitySortPriority(Self.titlePriority)
            HStack(spacing: gap) {
                leading
                Spacer(minLength: 0)
                trailing
                    .foregroundStyle(MeeshyExpandingPillRecipe.secondaryInk)
                    .accessibilitySortPriority(Self.trailingPriority)
                trailingButton
            }
        }
        .frame(maxWidth: .infinity, minHeight: slot)
        .accessibilityElement(children: .contain)
        .onAppear { if takesFocus { titleHasFocus = true } }
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

    @ViewBuilder
    private var trailingButton: some View {
        if let onClose {
            MeeshyGlassButton(
                systemImage: "xmark", label: closeLabel, kind: .soft,
                size: MeeshyExpandingPillRecipe.headerButtonSize, action: onClose
            )
            .accessibilitySortPriority(Self.closePriority)
        } else {
            reservedSlot
        }
    }

    private var reservedSlot: some View {
        Color.clear.frame(width: slot, height: slot).accessibilityHidden(true)
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
