import SwiftUI
import MeeshySDK
import MeeshyUI

/// One action available in the long-press context overlay.
///
/// Filtered upstream by `ConversationView` based on the message state
/// (`isMine`, `canDeleteForEveryone`, hasContent, etc. — see spec §8.3).
/// The kind enum is open-ended so future actions (edit, pin, info) can
/// slot in without touching this file.
struct ContextAction: Identifiable, Equatable {
    enum Kind: Hashable {
        case reply
        case forward
        case react
        case translate
        case copy
        case delete
        case edit
        case pin
        case star
        case thread
        case info
    }

    enum Role: Hashable {
        case standard
        case primary
        case destructive
    }

    let id: UUID
    let kind: Kind
    let label: String
    let icon: String
    let role: Role

    init(
        id: UUID = UUID(),
        kind: Kind,
        label: String,
        icon: String,
        role: Role = .standard
    ) {
        self.id = id
        self.kind = kind
        self.label = label
        self.icon = icon
        self.role = role
    }
}

extension ContextAction {
    /// Default visual mapping for the six core actions of the long-press
    /// menu. `delete` is the only destructive role; it always renders red
    /// regardless of the conversation's accent color (semantic global rule
    /// from CLAUDE.md).
    static func reply(label: String = "Répondre") -> ContextAction {
        .init(kind: .reply, label: label, icon: "arrowshape.turn.up.left.fill", role: .standard)
    }
    static func forward(label: String = "Transférer") -> ContextAction {
        .init(kind: .forward, label: label, icon: "arrowshape.turn.up.right.fill", role: .standard)
    }
    static func react(label: String = "Réagir") -> ContextAction {
        .init(kind: .react, label: label, icon: "face.smiling.fill", role: .primary)
    }
    static func translate(label: String = "Traduire") -> ContextAction {
        .init(kind: .translate, label: label, icon: "globe", role: .standard)
    }
    static func copy(label: String = "Copier") -> ContextAction {
        .init(kind: .copy, label: label, icon: "doc.on.doc.fill", role: .standard)
    }
    static func delete(label: String = "Supprimer") -> ContextAction {
        .init(kind: .delete, label: label, icon: "trash.fill", role: .destructive)
    }
    static func edit(label: String = "Éditer") -> ContextAction {
        .init(kind: .edit, label: label, icon: "pencil", role: .standard)
    }
    static func pin(label: String = "Épingler", isActive: Bool = false) -> ContextAction {
        .init(kind: .pin, label: label, icon: isActive ? "pin.slash.fill" : "pin.fill", role: .standard)
    }
    static func star(label: String = "Favori", isActive: Bool = false) -> ContextAction {
        .init(kind: .star, label: label, icon: isActive ? "star.slash.fill" : "star.fill", role: .standard)
    }
    static func thread(label: String = "Discussion") -> ContextAction {
        .init(kind: .thread, label: label, icon: "bubble.left.and.bubble.right.fill", role: .standard)
    }
}

/// Single action button inside the context menu capsule. Press feedback is
/// a spring-driven scale-down + tinted background — local `@State` so each
/// button manages its own press animation in isolation.
struct ContextActionButton: View {
    let action: ContextAction
    let accentColor: Color
    let onTap: () -> Void

    @State private var isPressed = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var foregroundColor: Color {
        switch action.role {
        case .destructive: return MeeshyColors.error
        case .primary, .standard: return accentColor
        }
    }

    private var showLabel: Bool {
        dynamicTypeSize <= .xLarge
    }

    var body: some View {
        Button {
            HapticFeedback.light()
            onTap()
        } label: {
            VStack(spacing: showLabel ? 2 : 0) {
                Image(systemName: action.icon)
                    .font(MeeshyFont.relative(15, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                if showLabel {
                    Text(action.label)
                        .font(MeeshyFont.relative(10, weight: .medium))
                        .lineLimit(1)
                }
            }
            .foregroundStyle(foregroundColor)
            .frame(minWidth: 50, minHeight: 40)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isPressed ? Color.primary.opacity(0.10) : Color.clear)
            )
            .scaleEffect(isPressed ? 0.92 : 1.0)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(action.label)
        .accessibilityAddTraits(.isButton)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    withAnimation(.spring(response: 0.18, dampingFraction: 0.7)) {
                        isPressed = true
                    }
                }
                .onEnded { _ in
                    withAnimation(.spring(response: 0.22, dampingFraction: 0.7)) {
                        isPressed = false
                    }
                }
        )
    }
}

/// Horizontal capsule of action buttons, displayed below (or above) the
/// elevated bubble in the long-press overlay.
///
/// Width is intrinsic to the action count — caller measures it via
/// `ContextActionMenu.estimatedSize` and feeds the result into
/// `MessageOverlayLayoutEngine`. The capsule rides the dimmed backdrop as
/// native iOS 26 Liquid Glass (accent-tinted) via `adaptiveGlass`, which gates
/// the real `glassEffect` and degrades to a tinted `.ultraThinMaterial` blur
/// pre-iOS-26 — same atom used by the floating call pill. The drop shadows stay:
/// they are a documented exception to the flatten spec's "no shadows" rule —
/// overlays modaux need elevation cues (spec §1.3 / §8.1).
struct ContextActionMenu: View {
    let actions: [ContextAction]
    let palette: ConversationColorPalette
    let onAction: (ContextAction.Kind) -> Void

    var body: some View {
        let accent = palette.primaryColor
        HStack(spacing: 4) {
            ForEach(Array(actions.enumerated()), id: \.element.id) { index, action in
                ContextActionButton(
                    action: action,
                    accentColor: accent,
                    onTap: { onAction(action.kind) }
                )
                if index < actions.count - 1 {
                    Capsule()
                        .fill(accent.opacity(0.18))
                        .frame(width: 1, height: 18)
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 5)
        .adaptiveGlass(in: Capsule(), tint: accent.opacity(0.18))
        .shadow(color: accent.opacity(0.20), radius: 12, x: 0, y: 4)
        .shadow(color: .black.opacity(0.18), radius: 18, x: 0, y: 8)
        .accessibilityElement(children: .contain)
    }

    static let buttonWidth: CGFloat = 50
    static let buttonHeight: CGFloat = 40
    static let buttonSpacing: CGFloat = 4
    static let separatorWidth: CGFloat = 1
    static let horizontalPadding: CGFloat = 6
    static let verticalPadding: CGFloat = 5

    /// Deterministic size given an action count. No `PreferenceKey` needed —
    /// the engine pre-computes the menu frame from this estimate so the
    /// layout decision (lift / clamp / scale) happens in one pass.
    static func estimatedSize(actionCount: Int) -> CGSize {
        let count = max(1, actionCount)
        let width = CGFloat(count) * buttonWidth
            + CGFloat(count - 1) * (buttonSpacing * 2 + separatorWidth)
            + horizontalPadding * 2
        let height = buttonHeight + verticalPadding * 2
        return CGSize(width: width, height: height)
    }
}
