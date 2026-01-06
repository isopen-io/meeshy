//
//  MeeshyBottomActionMenu.swift
//  Meeshy
//
//  Reusable bottom action menu with hybrid layout (compact grid + full list)
//  Presented as a sheet from the bottom of the screen
//  iOS 16+
//

import SwiftUI

// MARK: - Bottom Action Menu

/// A bottom sheet action menu with hybrid layout support
/// Use with .sheet() modifier for presentation
struct MeeshyBottomActionMenu: View {
    let title: String?
    let subtitle: String?
    let actions: [MeeshyActionItem]
    let quickReactions: [String]?
    let onReaction: ((String) -> Void)?
    let onDismiss: () -> Void

    @State private var isExpanded = false
    @State private var dragOffset: CGFloat = 0

    // Layout constants
    private let collapsedMaxActions = 9
    private let dragThreshold: CGFloat = 50

    init(
        title: String? = nil,
        subtitle: String? = nil,
        actions: [MeeshyActionItem],
        quickReactions: [String]? = nil,
        onReaction: ((String) -> Void)? = nil,
        onDismiss: @escaping () -> Void
    ) {
        self.title = title
        self.subtitle = subtitle
        self.actions = actions
        self.quickReactions = quickReactions
        self.onReaction = onReaction
        self.onDismiss = onDismiss
    }

    // MARK: - Computed Properties

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

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // Drag handle
            dragHandle

            // Title section (optional)
            if title != nil || subtitle != nil {
                titleSection
            }

            // Quick reactions (optional)
            if let reactions = quickReactions, let onReact = onReaction {
                quickReactionsRow(reactions: reactions, onReact: onReact)

                Divider()
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
            }

            // Actions content
            ScrollView {
                VStack(spacing: 0) {
                    // Compact actions grid
                    if !compactActions.isEmpty {
                        BottomMenuCompactGrid(actions: compactActions) { action in
                            handleActionTap(action)
                        }

                        if !fullActions.isEmpty {
                            Divider()
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                        }
                    }

                    // Full actions list
                    if !fullActions.isEmpty {
                        BottomMenuFullList(actions: fullActions) { action in
                            handleActionTap(action)
                        }
                    }

                    // More options button
                    if hasMoreActions && !isExpanded {
                        moreOptionsButton
                    }
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isExpanded)

            // Cancel button
            Divider()
                .padding(.horizontal, 16)
                .padding(.top, 8)

            cancelButton
        }
        .padding(.bottom, 8)
        .background(
            UnevenRoundedRectangle(
                topLeadingRadius: 20,
                topTrailingRadius: 20
            )
            .fill(Color(.systemBackground))
        )
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.hidden)
    }

    // MARK: - Drag Handle

    private var dragHandle: some View {
        VStack(spacing: 4) {
            if hasMoreActions {
                Image(systemName: isExpanded ? "chevron.down" : "chevron.up")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(.systemGray3))
                    .opacity(0.8)
            }

            RoundedRectangle(cornerRadius: 2.5)
                .fill(Color(.systemGray3))
                .frame(width: 40, height: 5)
        }
        .padding(.top, 10)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 10)
                .onChanged { value in
                    dragOffset = value.translation.height
                }
                .onEnded { value in
                    let velocity = value.predictedEndTranslation.height - value.translation.height

                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
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

    // MARK: - Title Section

    private var titleSection: some View {
        VStack(spacing: 4) {
            if let title = title {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(.primary)
            }

            if let subtitle = subtitle {
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Quick Reactions

    @ViewBuilder
    private func quickReactionsRow(reactions: [String], onReact: @escaping (String) -> Void) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(reactions, id: \.self) { emoji in
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        onReact(emoji)
                        onDismiss()
                    } label: {
                        Text(emoji)
                            .font(.system(size: 32))
                            .frame(width: 50, height: 50)
                            .background(
                                Circle()
                                    .fill(Color(.systemGray6))
                            )
                    }
                    .buttonStyle(.reaction)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
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
            onDismiss()
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

    // MARK: - Actions

    private func handleActionTap(_ action: MeeshyActionItem) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        action.action()
        onDismiss()
    }
}

// MARK: - Compact Grid

private struct BottomMenuCompactGrid: View {
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
                BottomMenuCompactItem(action: action) {
                    onAction(action)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}

// MARK: - Compact Item

private struct BottomMenuCompactItem: View {
    let action: MeeshyActionItem
    let onTap: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 6) {
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
                .onChanged { _ in if !isPressed { isPressed = true } }
                .onEnded { _ in isPressed = false }
        )
        .animation(.spring(response: 0.2, dampingFraction: 0.7), value: isPressed)
    }
}

// MARK: - Full List

private struct BottomMenuFullList: View {
    let actions: [MeeshyActionItem]
    let onAction: (MeeshyActionItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(actions) { action in
                BottomMenuFullItem(action: action) {
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

// MARK: - Full Item

private struct BottomMenuFullItem: View {
    let action: MeeshyActionItem
    let onTap: () -> Void

    @State private var isPressed = false

    private var textColor: Color {
        action.style == .destructive ? .red : .primary
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
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
                .onChanged { _ in if !isPressed { isPressed = true } }
                .onEnded { _ in isPressed = false }
        )
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isPressed)
    }
}

// MARK: - Preview

#Preview("Conversation Actions") {
    Color.gray.opacity(0.3)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            MeeshyBottomActionMenu(
                title: "Alice Johnson",
                subtitle: "Conversation directe",
                actions: [
                    // Compact actions
                    .init(icon: "pin.fill", title: "Épingler", displayStyle: .compact, accentColor: .orange) {},
                    .init(icon: "checkmark.circle.fill", title: "Lu", displayStyle: .compact, accentColor: .green) {},
                    .init(icon: "bell.slash.fill", title: "Muet", displayStyle: .compact, accentColor: .purple) {},
                    .init(icon: "archivebox.fill", title: "Archiver", displayStyle: .compact, accentColor: .blue) {},
                    .init(icon: "tag.fill", title: "Tags", displayStyle: .compact, accentColor: .cyan) {},
                    .init(icon: "folder.fill", title: "Catégorie", displayStyle: .compact, accentColor: .indigo) {},
                    // Full actions
                    .init(icon: "trash.fill", title: "Supprimer", subtitle: "Supprimer cette conversation", style: .destructive, displayStyle: .full) {}
                ],
                quickReactions: ["❤️", "👍", "😂", "😮", "😢", "🙏"],
                onReaction: { emoji in print("Reaction: \(emoji)") },
                onDismiss: {}
            )
        }
}

#Preview("Without Reactions") {
    Color.gray.opacity(0.3)
        .ignoresSafeArea()
        .sheet(isPresented: .constant(true)) {
            MeeshyBottomActionMenu(
                title: "Actions",
                actions: [
                    .init(icon: "square.and.arrow.up", title: "Partager", displayStyle: .compact, accentColor: .blue) {},
                    .init(icon: "doc.on.doc", title: "Copier", displayStyle: .compact, accentColor: .orange) {},
                    .init(icon: "bookmark.fill", title: "Sauvegarder", displayStyle: .compact, accentColor: .yellow) {},
                    .init(icon: "pencil", title: "Modifier", subtitle: "Éditer le contenu", displayStyle: .full, accentColor: .green) {},
                    .init(icon: "trash.fill", title: "Supprimer", style: .destructive, displayStyle: .full) {}
                ],
                onDismiss: {}
            )
        }
}
