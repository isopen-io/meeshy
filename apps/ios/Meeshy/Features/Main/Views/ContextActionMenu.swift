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
        case .destructive: return .red
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
            VStack(spacing: showLabel ? 3 : 0) {
                Image(systemName: action.icon)
                    .font(.system(size: 17, weight: .medium))
                    .symbolRenderingMode(.hierarchical)
                if showLabel {
                    Text(action.label)
                        .font(.system(size: 11, weight: .medium))
                        .lineLimit(1)
                }
            }
            .foregroundStyle(foregroundColor)
            .frame(minWidth: 54, minHeight: 48)
            .background(
                RoundedRectangle(cornerRadius: 12)
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
/// `MessageOverlayLayoutEngine`. The capsule overlays the dimmed backdrop
/// with a `.regularMaterial` blur + faint hairline border + soft drop shadow.
/// The shadow is a documented exception to the flatten spec's "no shadows"
/// rule — overlays modaux need elevation cues (spec §1.3 / §8.1).
struct ContextActionMenu: View {
    let actions: [ContextAction]
    let palette: ConversationColorPalette
    let onAction: (ContextAction.Kind) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(actions) { action in
                ContextActionButton(
                    action: action,
                    accentColor: palette.primaryColor,
                    onTap: { onAction(action.kind) }
                )
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: Capsule())
        .overlay(
            Capsule().strokeBorder(Color.white.opacity(0.06), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.12), radius: 16, x: 0, y: 4)
        .accessibilityElement(children: .contain)
    }

    static let buttonWidth: CGFloat = 54
    static let buttonHeight: CGFloat = 48
    static let buttonSpacing: CGFloat = 6
    static let horizontalPadding: CGFloat = 10
    static let verticalPadding: CGFloat = 8

    /// Deterministic size given an action count. No `PreferenceKey` needed —
    /// the engine pre-computes the menu frame from this estimate so the
    /// layout decision (lift / clamp / scale) happens in one pass.
    static func estimatedSize(actionCount: Int) -> CGSize {
        let count = max(1, actionCount)
        let width = CGFloat(count) * buttonWidth
            + CGFloat(count - 1) * buttonSpacing
            + horizontalPadding * 2
        let height = buttonHeight + verticalPadding * 2
        return CGSize(width: width, height: height)
    }
}
