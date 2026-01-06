//
//  MeeshyActionMenu.swift
//  Meeshy
//
//  Bottom action sheet with hybrid layout: compact grid + full list
//  iOS 16+
//

import SwiftUI

// MARK: - Main Action Menu

struct MeeshyActionMenu: View {
    let actions: [MeeshyActionItem]
    let onAction: (MeeshyActionItem) -> Void
    let onCancel: (() -> Void)?

    // Expansion state
    @State private var isExpanded = false
    @State private var dragOffset: CGFloat = 0

    // Layout constants
    private let collapsedMaxActions = 6  // Max actions visible when collapsed
    private let dragThreshold: CGFloat = 50

    init(
        actions: [MeeshyActionItem],
        onAction: @escaping (MeeshyActionItem) -> Void,
        onCancel: (() -> Void)? = nil
    ) {
        self.actions = actions
        self.onAction = onAction
        self.onCancel = onCancel
    }

    /// Separate compact and full actions
    private var compactActions: [MeeshyActionItem] {
        let actionsToShow = isExpanded ? actions : Array(actions.prefix(collapsedMaxActions))
        return actionsToShow.filter { $0.displayStyle == .compact }
    }

    private var fullActions: [MeeshyActionItem] {
        let actionsToShow = isExpanded ? actions : Array(actions.prefix(collapsedMaxActions))
        return actionsToShow.filter { $0.displayStyle == .full }
    }

    private var hasMoreActions: Bool {
        actions.count > collapsedMaxActions
    }

    private var hiddenCount: Int {
        max(0, actions.count - collapsedMaxActions)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Drag handle with expansion indicator
            dragHandle

            // HYBRID LAYOUT
            VStack(spacing: 0) {
                // 1. Compact actions in grid (3 per row)
                if !compactActions.isEmpty {
                    CompactActionsGrid(
                        actions: compactActions,
                        onAction: onAction
                    )

                    // Separator if there are full actions below
                    if !fullActions.isEmpty {
                        Divider()
                            .padding(.horizontal, 16)
                            .padding(.vertical, 6)
                    }
                }

                // 2. Full actions in list
                if !fullActions.isEmpty {
                    FullActionsList(
                        actions: fullActions,
                        onAction: onAction
                    )
                }

                // "More options" button when collapsed
                if hasMoreActions && !isExpanded {
                    moreOptionsButton
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isExpanded)

            // Cancel button (optional)
            if onCancel != nil {
                Divider()
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                cancelButton
            }
        }
        .padding(.bottom, 8)
        .background(
            UnevenRoundedRectangle(
                topLeadingRadius: 20,
                topTrailingRadius: 20
            )
            .fill(Color(.systemBackground))
            .shadow(color: .black.opacity(0.15), radius: 15, x: 0, y: -5)
        )
    }

    // MARK: - Drag Handle

    private var dragHandle: some View {
        VStack(spacing: 4) {
            // Direction hint
            if hasMoreActions {
                Image(systemName: isExpanded ? "chevron.down" : "chevron.up")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(.systemGray3))
                    .opacity(0.8)
            }

            // Handle bar
            RoundedRectangle(cornerRadius: 2.5)
                .fill(Color(.systemGray3))
                .frame(width: 40, height: 5)
        }
        .padding(.top, 10)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 30)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 10)
                .onChanged { value in
                    dragOffset = value.translation.height
                }
                .onEnded { value in
                    let velocity = value.predictedEndTranslation.height - value.translation.height

                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                        // Swipe up = expand, swipe down = collapse
                        if value.translation.height < -dragThreshold || velocity < -100 {
                            isExpanded = true
                        } else if value.translation.height > dragThreshold || velocity > 100 {
                            isExpanded = false
                        }
                        dragOffset = 0
                    }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }
        )
        .onTapGesture {
            if hasMoreActions {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                    isExpanded.toggle()
                }
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }

    // MARK: - More Options Button

    private var moreOptionsButton: some View {
        VStack(spacing: 0) {
            Divider()
                .padding(.horizontal, 16)

            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                    isExpanded = true
                }
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } label: {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(
                                LinearGradient(
                                    colors: [.gray, .gray.opacity(0.7)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 36, height: 36)

                        Image(systemName: "ellipsis")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Plus d'options")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.primary)

                        Text("\(hiddenCount) options supplémentaires")
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    Image(systemName: "chevron.up")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.tertiary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            }
            .buttonStyle(PlainButtonStyle())
        }
    }

    // MARK: - Cancel Button

    private var cancelButton: some View {
        Button {
            onCancel?()
        } label: {
            HStack {
                Spacer()
                Text("Annuler")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.blue)
                Spacer()
            }
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Compact Actions Grid (3 columns)

private struct CompactActionsGrid: View {
    let actions: [MeeshyActionItem]
    let onAction: (MeeshyActionItem) -> Void

    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8)
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(actions) { action in
                CompactActionItem(action: action) {
                    onAction(action)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}

// MARK: - Compact Action Item

private struct CompactActionItem: View {
    let action: MeeshyActionItem
    let onTap: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onTap()
        }) {
            VStack(spacing: 6) {
                // Icon with gradient background
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [action.accentColor, action.accentColor.opacity(0.7)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 44, height: 44)

                    Image(systemName: action.icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                }

                // Short title
                Text(action.title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(action.style == .destructive ? .red : .primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isPressed ? action.accentColor.opacity(0.1) : Color(.systemGray6).opacity(0.5))
            )
            .scaleEffect(isPressed ? 0.95 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !isPressed { isPressed = true }
                }
                .onEnded { _ in
                    isPressed = false
                }
        )
        .animation(.spring(response: 0.2, dampingFraction: 0.7), value: isPressed)
    }
}

// MARK: - Full Actions List

private struct FullActionsList: View {
    let actions: [MeeshyActionItem]
    let onAction: (MeeshyActionItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(actions) { action in
                FullActionItem(action: action) {
                    onAction(action)
                }

                if action.id != actions.last?.id {
                    Divider()
                        .padding(.horizontal, 16)
                }
            }
        }
    }
}

// MARK: - Full Action Item

private struct FullActionItem: View {
    let action: MeeshyActionItem
    let onTap: () -> Void

    @State private var isPressed = false

    private var textColor: Color {
        action.style == .destructive ? .red : .primary
    }

    var body: some View {
        Button(action: {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            onTap()
        }) {
            HStack(spacing: 14) {
                // Icon with gradient background
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [action.accentColor, action.accentColor.opacity(0.7)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 36, height: 36)

                    Image(systemName: action.icon)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                }

                // Title and subtitle
                VStack(alignment: .leading, spacing: 2) {
                    Text(action.title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(textColor)

                    if let subtitle = action.subtitle {
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                // Warning icon for destructive OR chevron for navigation
                if action.style == .destructive {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.red.opacity(0.6))
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isPressed ? action.accentColor.opacity(0.08) : Color.clear)
            )
            .scaleEffect(isPressed ? 0.98 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    if !isPressed { isPressed = true }
                }
                .onEnded { _ in
                    isPressed = false
                }
        )
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isPressed)
    }
}

// MARK: - Preview

#Preview("Hybrid Layout") {
    ZStack {
        Color.gray.opacity(0.2).ignoresSafeArea()

        VStack {
            Spacer()

            MeeshyActionMenu(
                actions: [
                    // Compact actions (grid)
                    .init(icon: "arrow.turn.up.left", title: "Répondre", displayStyle: .compact, accentColor: .blue) {},
                    .init(icon: "doc.on.doc", title: "Copier", displayStyle: .compact, accentColor: .orange) {},
                    .init(icon: "arrowshape.turn.up.right", title: "Transférer", displayStyle: .compact, accentColor: .green) {},
                    .init(icon: "pin", title: "Épingler", displayStyle: .compact, accentColor: .purple) {},
                    .init(icon: "bookmark", title: "Sauvegarder", displayStyle: .compact, accentColor: .cyan) {},
                    .init(icon: "star", title: "Favoris", displayStyle: .compact, accentColor: .yellow) {},
                    // Full actions (list)
                    .init(icon: "pencil", title: "Modifier", subtitle: "Éditer le contenu du message", displayStyle: .full, accentColor: .blue) {},
                    .init(icon: "flag", title: "Signaler", subtitle: "Signaler un contenu inapproprié", displayStyle: .full, accentColor: .orange) {},
                    .init(icon: "trash", title: "Supprimer", subtitle: "Supprimer définitivement", style: .destructive, displayStyle: .full) {}
                ],
                onAction: { action in
                    print("Action: \(action.title)")
                },
                onCancel: {
                    print("Cancelled")
                }
            )
        }
    }
}

#Preview("All Full Layout") {
    ZStack {
        Color.gray.opacity(0.2).ignoresSafeArea()

        VStack {
            Spacer()

            MeeshyActionMenu(
                actions: [
                    .init(icon: "arrow.turn.up.left", title: "Répondre", subtitle: "Répondre à ce message", displayStyle: .full) {},
                    .init(icon: "pencil", title: "Modifier", subtitle: "Modifier votre message", displayStyle: .full) {},
                    .init(icon: "trash", title: "Supprimer", style: .destructive, displayStyle: .full) {}
                ],
                onAction: { _ in },
                onCancel: { }
            )
        }
    }
}

#Preview("All Compact Layout") {
    ZStack {
        Color.gray.opacity(0.2).ignoresSafeArea()

        VStack {
            Spacer()

            MeeshyActionMenu(
                actions: [
                    .init(icon: "arrow.turn.up.left", title: "Répondre", displayStyle: .compact, accentColor: .blue) {},
                    .init(icon: "doc.on.doc", title: "Copier", displayStyle: .compact, accentColor: .orange) {},
                    .init(icon: "arrowshape.turn.up.right", title: "Transférer", displayStyle: .compact, accentColor: .green) {},
                    .init(icon: "pin", title: "Épingler", displayStyle: .compact, accentColor: .purple) {},
                    .init(icon: "bookmark", title: "Sauvegarder", displayStyle: .compact, accentColor: .cyan) {},
                    .init(icon: "star", title: "Favoris", displayStyle: .compact, accentColor: .yellow) {},
                    .init(icon: "trash", title: "Supprimer", style: .destructive, displayStyle: .compact) {}
                ],
                onAction: { _ in },
                onCancel: { }
            )
        }
    }
}
