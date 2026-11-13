import SwiftUI

// MARK: - La face

/// **La capsule qui dit un refus, une limite ou une panne** (K14) : une capsule
/// de verre, une icône, un message sur deux lignes au plus, un détail, une seule
/// action. La FACE est pure : elle ne vibre pas, ne s'annonce pas, ne se retire
/// pas seule — l'hôte (`.meeshyStatusCapsule`) joue haptique, annonce et minuteur.
///
/// - `message` vide ⇒ rien n'est rendu. Ni icône, ni détail, ni action, ni ✕
///   sans leur paramètre. `kind` ne colore rien.
/// - `leading` prend la place de l'icône (anneau, drapeau, point d'état).
/// - ✕ n'est dessiné que si `closeLabel` ET `onDismiss` sont passés ; avec
///   `onDismiss`, glisser de 24 pt vers `edge` ferme aussi.
/// - Sans action ni `onDismiss`, elle ne prend aucun doigt.
/// - `isPressed` fige l'action pressée (catalogue).
public struct MeeshyStatusCapsule<Leading: View>: View {
    private let message: String
    private let detail: String?
    private let systemImage: String?
    private let kind: MeeshyStatusCapsuleKind
    private let action: MeeshyStatusCapsuleAction?
    private let closeLabel: String?
    private let onDismiss: (() -> Void)?
    private let edge: MeeshyStatusCapsuleEdge
    private let tone: MeeshyGlassTone?
    private let tint: Color?
    private let isPressed: Bool?
    private let leading: Leading

    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion
    @State private var drag: CGFloat = 0

    @ScaledMetric(relativeTo: .footnote) private var messageSize = MeeshyStatusCapsuleRecipe.messageSize
    @ScaledMetric(relativeTo: .caption) private var detailSize = MeeshyStatusCapsuleRecipe.detailSize
    @ScaledMetric(relativeTo: .footnote) private var iconSize = MeeshyStatusCapsuleRecipe.iconSize
    @ScaledMetric(relativeTo: .footnote) private var actionSize = MeeshyStatusCapsuleRecipe.actionSize
    @ScaledMetric(relativeTo: .footnote) private var actionGlyphSize = MeeshyStatusCapsuleRecipe.actionGlyphSize

    public init(_ message: String,
                detail: String? = nil,
                systemImage: String? = nil,
                kind: MeeshyStatusCapsuleKind = .info,
                action: MeeshyStatusCapsuleAction? = nil,
                closeLabel: String? = nil,
                onDismiss: (() -> Void)? = nil,
                edge: MeeshyStatusCapsuleEdge = .bottom,
                tone: MeeshyGlassTone? = nil,
                tint: Color? = nil,
                isPressed: Bool? = nil,
                @ViewBuilder leading: () -> Leading) {
        self.message = message
        self.detail = detail
        self.systemImage = systemImage
        self.kind = kind
        self.action = action
        self.closeLabel = closeLabel
        self.onDismiss = onDismiss
        self.edge = edge
        self.tone = tone
        self.tint = tint
        self.isPressed = isPressed
        self.leading = leading()
    }

    @ViewBuilder
    public var body: some View {
        if MeeshyStatusCapsuleRecipe.isVisible(message: message) {
            MeeshyStatusCapsuleWidthCap(maxWidth: MeeshyStatusCapsuleRecipe.maxWidth) { capsule }
        }
    }

    private var capsule: some View {
        arranged
            .padding(.vertical, MeeshyStatusCapsuleRecipe.paddingVertical)
            .padding(.horizontal, MeeshyStatusCapsuleRecipe.paddingHorizontal)
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyStatusCapsuleRecipe.radius, style: .continuous),
                         tone: tone, density: .dense, tint: tint)
            .offset(y: drag)
            .gesture(dismissGesture, including: onDismiss == nil ? .subviews : .all)
            .allowsHitTesting(MeeshyStatusCapsuleRecipe.takesTouches(hasAction: action != nil, hasDismiss: onDismiss != nil))
            .accessibilityElement(children: .contain)
            .modifier(MeeshyStatusCapsuleDismissAction(onDismiss: onDismiss))
    }

    // MARK: Disposition

    @ViewBuilder
    private var arranged: some View {
        if let action, MeeshyStatusCapsuleRecipe.actionIsBelowText(isAccessibilitySize: dynamicTypeSize.isAccessibilitySize) {
            VStack(alignment: .trailing, spacing: MeeshyStatusCapsuleRecipe.gap) {
                row(trailingAction: nil)
                actionButton(action)
            }
        } else {
            row(trailingAction: action)
        }
    }

    private func row(trailingAction: MeeshyStatusCapsuleAction?) -> some View {
        HStack(spacing: MeeshyStatusCapsuleRecipe.gap) {
            mark
            texts
            if let trailingAction { actionButton(trailingAction) }
            closeButton
        }
    }

    @ViewBuilder
    private var mark: some View {
        if Leading.self != EmptyView.self {
            leading.accessibilityHidden(true)
        } else if let systemImage {
            Image(systemName: systemImage)
                .font(MeeshyStatusCapsuleRecipe.font(size: iconSize, weight: .semibold))
                .foregroundStyle(messageInk)
                .accessibilityHidden(true)
        }
    }

    private var texts: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(message)
                .font(MeeshyStatusCapsuleRecipe.font(size: messageSize, weight: .semibold))
                .foregroundStyle(messageInk)
                .lineLimit(lines)
            if let detail = MeeshyStatusCapsuleRecipe.visibleDetail(detail) {
                Text(detail)
                    .font(MeeshyStatusCapsuleRecipe.font(size: detailSize, weight: .medium))
                    .foregroundStyle(detailInk)
                    .lineLimit(lines)
            }
        }
        .multilineTextAlignment(.leading)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MeeshyStatusCapsuleRecipe.spokenText(message: message, detail: detail))
        .accessibilitySortPriority(MeeshyStatusCapsuleRecipe.readingOrder(.text))
    }

    private var lines: Int {
        MeeshyStatusCapsuleRecipe.messageLines(isAccessibilitySize: dynamicTypeSize.isAccessibilitySize)
    }

    // MARK: Encres

    private var resolvedTone: MeeshyGlassTone { tone ?? hostTone }

    private var messageInk: Color {
        resolvedTone == .theme ? MeeshyColors.textPrimary(isDark: colorScheme == .dark) : MeeshyColors.onMedia
    }

    private var detailInk: Color {
        messageInk.opacity(MeeshyStatusCapsuleRecipe.detailInkOpacity(tone: resolvedTone))
    }

    // MARK: Action et fermeture

    private func actionButton(_ action: MeeshyStatusCapsuleAction) -> some View {
        Button {
            MeeshyGlassButtonTrigger.perform(isEnabled: true, haptic: .light) { action.perform() }
        } label: {
            HStack(spacing: MeeshyStatusCapsuleRecipe.actionGap) {
                if let glyph = action.systemImage {
                    Image(systemName: glyph)
                        .font(MeeshyStatusCapsuleRecipe.font(size: actionGlyphSize, weight: .bold))
                        .environment(\.layoutDirection, .leftToRight)
                        .accessibilityHidden(true)
                }
                Text(action.label)
                    .font(MeeshyStatusCapsuleRecipe.font(size: actionSize, weight: .bold))
            }
        }
        .buttonStyle(MeeshyStatusCapsuleActionStyle(forcedPressed: isPressed))
        .accessibilityLabel(action.label)
        .accessibilitySortPriority(MeeshyStatusCapsuleRecipe.readingOrder(.action))
    }

    @ViewBuilder
    private var closeButton: some View {
        if let closeLabel, let onDismiss {
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(MeeshyStatusCapsuleRecipe.font(size: MeeshyStatusCapsuleRecipe.closeGlyphSize, weight: .bold))
                    .foregroundStyle(messageInk)
                    .frame(minWidth: MeeshyStatusCapsuleRecipe.closeSize, minHeight: MeeshyStatusCapsuleRecipe.closeSize)
                    .contentShape(Rectangle().inset(by: -MeeshyStatusCapsuleRecipe.closeHitSlack))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(closeLabel)
            .accessibilitySortPriority(MeeshyStatusCapsuleRecipe.readingOrder(.close))
        }
    }

    // MARK: Glisser pour fermer

    private var dismissGesture: some Gesture {
        DragGesture(minimumDistance: MeeshyStatusCapsuleRecipe.dragStart)
            .onChanged { value in
                drag = MeeshyStatusCapsuleRecipe.dragOffset(translation: value.translation.height, edge: edge)
            }
            .onEnded { value in
                if MeeshyStatusCapsuleRecipe.shouldDismiss(translation: value.translation.height, edge: edge) {
                    onDismiss?()
                } else {
                    meeshyWithAnimation(MeeshyAnimation.springFast,
                                        reduceMotion: MeeshyMotion.shouldReduce(system: systemReduceMotion,
                                                                                userForced: userReduceMotion)) {
                        drag = 0
                    }
                }
            }
    }
}

extension MeeshyStatusCapsule where Leading == EmptyView {
    public init(_ message: String,
                detail: String? = nil,
                systemImage: String? = nil,
                kind: MeeshyStatusCapsuleKind = .info,
                action: MeeshyStatusCapsuleAction? = nil,
                closeLabel: String? = nil,
                onDismiss: (() -> Void)? = nil,
                edge: MeeshyStatusCapsuleEdge = .bottom,
                tone: MeeshyGlassTone? = nil,
                tint: Color? = nil,
                isPressed: Bool? = nil) {
        self.init(message, detail: detail, systemImage: systemImage, kind: kind, action: action,
                  closeLabel: closeLabel, onDismiss: onDismiss, edge: edge, tone: tone, tint: tint,
                  isPressed: isPressed, leading: { EmptyView() })
    }
}

/// Égale par valeurs (les fermetures n'y sont pas) : un hôte qui se re-rend à
/// paramètres égaux ne re-rend pas la capsule.
extension MeeshyStatusCapsule: Equatable where Leading == EmptyView {
    public static func == (lhs: MeeshyStatusCapsule, rhs: MeeshyStatusCapsule) -> Bool {
        lhs.message == rhs.message && lhs.detail == rhs.detail && lhs.systemImage == rhs.systemImage
            && lhs.kind == rhs.kind && lhs.action == rhs.action && lhs.closeLabel == rhs.closeLabel
            && (lhs.onDismiss == nil) == (rhs.onDismiss == nil) && lhs.edge == rhs.edge
            && lhs.tone == rhs.tone && lhs.tint == rhs.tint && lhs.isPressed == rhs.isPressed
    }
}

// MARK: - Pièces

/// Le texte au contenu, 350 au plus : propose `min(largeur, 350)` à son unique
/// enfant et prend sa taille — un `frame(maxWidth:)` remplirait les 350.
struct MeeshyStatusCapsuleWidthCap: Layout {
    let maxWidth: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        return child.sizeThatFits(capped(proposal))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        subviews.first?.place(at: bounds.origin, anchor: .topLeading,
                              proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
    }

    private func capped(_ proposal: ProposedViewSize) -> ProposedViewSize {
        ProposedViewSize(width: min(proposal.width ?? maxWidth, maxWidth), height: proposal.height)
    }
}

/// L'action : blanc plein de 36, encre `indigo950`, à 78 % sous le doigt ; la
/// cible déborde le dessin jusqu'à 44.
struct MeeshyStatusCapsuleActionStyle: ButtonStyle {
    let forcedPressed: Bool?

    func makeBody(configuration: Configuration) -> some View {
        let pressed = forcedPressed ?? configuration.isPressed
        return configuration.label
            .foregroundStyle(MeeshyColors.indigo950)
            .padding(.horizontal, MeeshyStatusCapsuleRecipe.actionPaddingHorizontal)
            .frame(minHeight: MeeshyStatusCapsuleRecipe.actionHeight)
            .background(Capsule().fill(MeeshyColors.onMedia.opacity(pressed ? MeeshyStatusCapsuleRecipe.actionPressedOpacity : 1)))
            .contentShape(Rectangle().inset(by: -MeeshyStatusCapsuleRecipe.actionHitSlack))
    }
}

/// L'action nommée « Fermer » du lecteur d'écran, seulement si la capsule se ferme.
private struct MeeshyStatusCapsuleDismissAction: ViewModifier {
    let onDismiss: (() -> Void)?

    func body(content: Content) -> some View {
        if let onDismiss {
            content.accessibilityAction(
                named: Text(verbatim: String(localized: "common.close", defaultValue: "Fermer", bundle: .module)),
                onDismiss
            )
        } else {
            content
        }
    }
}
