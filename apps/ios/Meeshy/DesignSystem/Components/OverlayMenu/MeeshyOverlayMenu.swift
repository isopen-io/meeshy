//
//  MeeshyOverlayMenu.swift
//  Meeshy
//
//  Main overlay menu container with vibrant blur background, animations, and mode switching
//  iOS 16+
//

import SwiftUI
import UIKit

// MARK: - Vibrant Blur Background

/// UIKit-based vibrant blur effect for the overlay background
struct VibrantBlurView: UIViewRepresentable {
    var style: UIBlurEffect.Style
    var opacity: Double

    func makeUIView(context: Context) -> UIVisualEffectView {
        let blurEffect = UIBlurEffect(style: style)
        let view = UIVisualEffectView(effect: blurEffect)
        view.alpha = opacity
        return view
    }

    func updateUIView(_ uiView: UIVisualEffectView, context: Context) {
        uiView.alpha = opacity
    }
}

// MARK: - Drag Handle View

/// Single drag handle indicator for resizable areas
struct DragHandleView: View {
    var isExpanded: Bool = false
    var showDirectionHint: Bool = false

    var body: some View {
        VStack(spacing: 2) {
            // Direction hint arrow (optional)
            if showDirectionHint {
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(.systemGray3))
                    .opacity(0.8)
            }

            // Main handle bar
            RoundedRectangle(cornerRadius: 2.5)
                .fill(Color(.systemGray3))
                .frame(width: 40, height: 5)
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 30) // Larger touch target
        .contentShape(Rectangle())
    }
}

// MARK: - Data Models

/// Configuration for the overlay menu
struct MeeshyOverlayMenuConfiguration {
    var quickViewPages: [QuickViewPage]
    var preview: AnyView
    var actions: [MeeshyActionItem]
    var onDismiss: () -> Void

    init<PreviewContent: View>(
        quickViewPages: [QuickViewPage],
        @ViewBuilder preview: () -> PreviewContent,
        actions: [MeeshyActionItem],
        onDismiss: @escaping () -> Void
    ) {
        self.quickViewPages = quickViewPages
        self.preview = AnyView(preview())
        self.actions = actions
        self.onDismiss = onDismiss
    }
}

// MARK: - Quick View Page Configurations

/// Configuration for emoji grid
struct EmojiGridConfig {
    let recentEmojis: [String]
    let popularEmojis: [String]
    let onSelect: (String) -> Void
    let onBrowseAll: () -> Void
}

/// Configuration for message info
struct MessageInfoConfig {
    let message: Message                   // Message being inspected
    let participants: [ConversationMember] // Participants with their read cursors
    let senderName: String?
    let senderAvatar: String?
    let location: String?
    let onUserTap: ((String) -> Void)?

    /// Computed timestamp from message
    var timestamp: Date {
        message.createdAt
    }

    init(
        message: Message,
        participants: [ConversationMember] = [],
        senderName: String? = nil,
        senderAvatar: String? = nil,
        location: String? = nil,
        onUserTap: ((String) -> Void)? = nil
    ) {
        self.message = message
        self.participants = participants
        self.senderName = senderName
        self.senderAvatar = senderAvatar
        self.location = location
        self.onUserTap = onUserTap
    }

    /// Participants grouped by their read status for this message
    var participantsByStatus: (read: [ConversationMember], received: [ConversationMember], pending: [ConversationMember]) {
        var read: [ConversationMember] = []
        var received: [ConversationMember] = []
        var pending: [ConversationMember] = []

        for participant in participants {
            // Skip the sender
            if participant.userId == message.senderId {
                continue
            }

            let status = participant.readStatusForMessage(message)
            switch status {
            case .read:
                read.append(participant)
            case .received:
                received.append(participant)
            case .pending:
                pending.append(participant)
            @unknown default:
                pending.append(participant)
            }
        }

        return (read, received, pending)
    }
}

/// User info for reactions
struct ReactionUserInfo: Identifiable {
    let id: String  // userId
    let name: String
    let avatar: String?
}

/// Configuration for reactions detail with emoji picker
struct ReactionsConfig {
    // Existing reactions on the message
    let reactions: [(emoji: String, users: [ReactionUserInfo])]
    // User's recently used emojis
    let recentEmojis: [String]
    // Platform's most popular emojis
    let popularEmojis: [String]
    // Callback when user selects an emoji to react
    let onSelectEmoji: (String) -> Void
    // Callback when user taps on a user who reacted
    let onUserTap: (String) -> Void

    init(
        reactions: [(emoji: String, users: [ReactionUserInfo])],
        recentEmojis: [String] = [],
        popularEmojis: [String] = ["❤️", "👍", "😂", "🔥", "😮", "🙏", "👏", "😢"],
        onSelectEmoji: @escaping (String) -> Void = { _ in },
        onUserTap: @escaping (String) -> Void
    ) {
        self.reactions = reactions
        self.recentEmojis = recentEmojis
        self.popularEmojis = popularEmojis
        self.onSelectEmoji = onSelectEmoji
        self.onUserTap = onUserTap
    }
}

/// Configuration for translations view
struct TranslationsConfig {
    let originalContent: String
    let originalLanguage: String
    let translations: [MessageTranslation]
    let selectedLanguage: String?
    let onSelectTranslation: (String) -> Void
    let onRequestTranslation: (String, TranslationModel) -> Void
}

/// Configuration for edit action view
struct EditActionConfig {
    let initialText: String
    let onSave: (String) -> Void
}

/// Configuration for delete action view
struct DeleteActionConfig {
    let onConfirm: () -> Void
}

/// Configuration for report action view
struct ReportActionConfig {
    let onReport: (String, String) -> Void  // (reason, description)
}

/// Configuration for sentiment analysis view
struct SentimentAnalysisConfig {
    let messageId: String
    let content: String
    let sentiment: SentimentResult?
    let onAnalyze: () -> Void
}

/// Configuration for text-to-speech view
struct TextToSpeechConfig {
    let content: String
    let language: String
    let onPlay: () -> Void
    let onStop: () -> Void
}

/// Configuration for image retouch page
struct ImageRetouchConfig {
    let imageUrl: String?
    let attachmentId: String?
    let onRetouch: () -> Void
    let onResend: () -> Void
}

/// Configuration for audio effects page
struct AudioEffectsConfig {
    let audioUrl: String?
    let attachmentId: String?
    let duration: TimeInterval?
    let onApplyEffect: (AudioEffect) -> Void
    let onPreview: (AudioEffect) -> Void

    enum AudioEffect: String, CaseIterable {
        case normal = "Normal"
        case reverb = "Réverbération"
        case echo = "Écho"
        case speedUp = "Accéléré"
        case slowDown = "Ralenti"
        case highPitch = "Aigu"
        case lowPitch = "Grave"
        case robot = "Robot"

        var icon: String {
            switch self {
            case .normal: return "speaker.wave.2"
            case .reverb: return "waveform.path"
            case .echo: return "repeat"
            case .speedUp: return "hare"
            case .slowDown: return "tortoise"
            case .highPitch: return "arrow.up.circle"
            case .lowPitch: return "arrow.down.circle"
            case .robot: return "cpu"
            }
        }
    }
}

/// Pages available in the quick view area
enum QuickViewPage: Identifiable {
    case emoji(EmojiGridConfig)
    case messageInfo(MessageInfoConfig)
    case reactions(ReactionsConfig)
    case translations(TranslationsConfig)
    case sentimentAnalysis(SentimentAnalysisConfig)
    case textToSpeech(TextToSpeechConfig)
    case imageRetouch(ImageRetouchConfig)
    case audioEffects(AudioEffectsConfig)
    case editAction(EditActionConfig)
    case deleteAction(DeleteActionConfig)
    case reportAction(ReportActionConfig)

    var id: String {
        switch self {
        case .emoji: return "emoji"
        case .messageInfo: return "messageInfo"
        case .reactions: return "reactions"
        case .translations: return "translations"
        case .sentimentAnalysis: return "sentimentAnalysis"
        case .textToSpeech: return "textToSpeech"
        case .imageRetouch: return "imageRetouch"
        case .audioEffects: return "audioEffects"
        case .editAction: return "editAction"
        case .deleteAction: return "deleteAction"
        case .reportAction: return "reportAction"
        }
    }
}

/// Action item for the menu
struct MeeshyActionItem: Identifiable {
    let id: UUID
    let icon: String
    let title: String
    let subtitle: String?
    let style: ActionStyle
    let displayStyle: DisplayStyle
    let accentColor: Color
    let action: () -> Void
    /// If set, tapping this action navigates to the specified QuickView page instead of dismissing
    let navigateToPage: Int?

    enum ActionStyle {
        case `default`
        case destructive
    }

    /// Display style for the action in the menu
    enum DisplayStyle {
        case compact    // Small icon + short title in grid (2-3 per row)
        case full       // Full width with icon, title, subtitle in list
    }

    init(
        id: UUID = UUID(),
        icon: String,
        title: String,
        subtitle: String? = nil,
        style: ActionStyle = .default,
        displayStyle: DisplayStyle = .full,
        accentColor: Color = .blue,
        navigateToPage: Int? = nil,
        action: @escaping () -> Void
    ) {
        self.id = id
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.style = style
        self.displayStyle = displayStyle
        self.accentColor = style == .destructive ? .red : accentColor
        self.navigateToPage = navigateToPage
        self.action = action
    }
}

/// Mode of the overlay
enum MeeshyOverlayMode {
    case actions
    case alert(AlertConfig)
    case edit(EditConfig)
}

/// Configuration for alert mode
struct AlertConfig {
    let icon: String
    let title: String
    let message: String
    let confirmButton: ButtonConfig
    let cancelButton: ButtonConfig
}

/// Configuration for edit mode
struct EditConfig {
    let title: String
    let initialText: String
    let placeholder: String
    let onSave: (String) -> Void
    let onCancel: () -> Void
}

/// Button configuration
struct ButtonConfig {
    let title: String
    let style: ButtonStyle
    let action: () -> Void

    enum ButtonStyle {
        case `default`
        case destructive
        case cancel
    }
}

// MARK: - Main Overlay Menu

struct MeeshyOverlayMenu: View {
    @Binding var mode: MeeshyOverlayMode
    let quickViewConfig: QuickViewConfig
    let preview: AnyView
    let actions: [MeeshyActionItem]
    let onDismiss: () -> Void

    // Animation states - start at final position for instant display
    @State private var animateIn = false
    @State private var backgroundOpacity: Double = 0.85  // Start visible
    @State private var quickViewOffset: CGFloat = 0      // Start at final position
    @State private var quickViewOpacity: Double = 1.0    // Start visible
    @State private var previewScale: CGFloat = 0.95      // Start at final scale
    @State private var actionMenuOffset: CGFloat = 0     // Start at final position
    @State private var actionMenuOpacity: Double = 1.0   // Start visible

    // Resizable area states
    @State private var quickViewHeight: CGFloat = 200
    @State private var isQuickViewMinimized: Bool = false
    @State private var dragOffset: CGFloat = 0

    // QuickView page navigation
    @State private var currentQuickViewPage: Int = 0

    // Constants for resizing
    private let minQuickViewHeight: CGFloat = 50
    private let maxQuickViewHeight: CGFloat = 350
    private let minimizedQuickViewHeight: CGFloat = 50

    struct QuickViewConfig {
        let pages: [QuickViewPage]
        var initialPage: Int = 0
    }

    init<PreviewContent: View>(
        mode: Binding<MeeshyOverlayMode>,
        quickViewConfig: QuickViewConfig,
        @ViewBuilder preview: () -> PreviewContent,
        actions: [MeeshyActionItem],
        onDismiss: @escaping () -> Void
    ) {
        self._mode = mode
        self.quickViewConfig = quickViewConfig
        self.preview = AnyView(preview())
        self.actions = actions
        self.onDismiss = onDismiss
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Vibrant blur background with transparency
                VibrantBlurView(style: .systemUltraThinMaterialDark, opacity: backgroundOpacity)
                    .ignoresSafeArea()
                    .onTapGesture {
                        dismissWithAnimation()
                    }

                // Additional tinted overlay for depth
                Color.black
                    .opacity(backgroundOpacity * 0.2)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)

                VStack(spacing: 0) {
                    // Top area - QuickView (resizable) or Alert/Edit
                    topArea(screenHeight: geometry.size.height)
                        .offset(y: quickViewOffset)
                        .opacity(quickViewOpacity)

                    Spacer()

                    // Center - Preview component
                    preview
                        .scaleEffect(previewScale)
                        .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: 10)

                    Spacer()

                    // Bottom - Action menu with dynamic actions
                    bottomArea(screenHeight: geometry.size.height)
                        .offset(y: actionMenuOffset)
                        .opacity(actionMenuOpacity)
                }
                .padding(.vertical, 60)
            }
        }
        .onAppear {
            performAppearAnimation()
        }
    }

    // MARK: - Top Area

    @ViewBuilder
    private func topArea(screenHeight: CGFloat) -> some View {
        switch mode {
        case .actions:
            VStack(spacing: 0) {
                if !isQuickViewMinimized {
                    MeeshyQuickViewArea(pages: quickViewConfig.pages, currentPage: $currentQuickViewPage)
                        .frame(height: quickViewHeight)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }

                // Drag handle for resizing QuickView
                DragHandleView(isExpanded: !isQuickViewMinimized, showDirectionHint: true)
                    .gesture(quickViewDragGesture)
                    .onTapGesture {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                            isQuickViewMinimized.toggle()
                            if !isQuickViewMinimized {
                                quickViewHeight = 200
                                dragStartHeight = 200
                            } else {
                                quickViewHeight = minimizedQuickViewHeight
                                dragStartHeight = minimizedQuickViewHeight
                            }
                        }
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemBackground).opacity(0.95))
                    .shadow(color: .black.opacity(0.15), radius: 10, x: 0, y: 5)
            )
            .padding(.horizontal, 16)

        case .alert(let config):
            MeeshyAlertOverlay(
                config: config,
                onDismiss: dismissWithAnimation
            )
            .transition(.scale.combined(with: .opacity))

        case .edit(let config):
            MeeshyEditOverlay(
                config: config,
                onDismiss: dismissWithAnimation
            )
            .transition(.scale.combined(with: .opacity))
        }
    }

    // MARK: - Bottom Area

    @ViewBuilder
    private func bottomArea(screenHeight: CGFloat) -> some View {
        // Calculate how many actions can fit
        let actionItemHeight: CGFloat = 52
        let headerHeight: CGFloat = 50  // Drag handle + padding
        let cancelButtonHeight: CGFloat = 52
        let safeAreaBottom: CGFloat = 34
        let availableHeight = screenHeight * 0.45 - headerHeight - cancelButtonHeight - safeAreaBottom

        let maxVisibleActions = max(1, Int(availableHeight / actionItemHeight))
        let visibleActions = Array(actions.prefix(maxVisibleActions))
        let hasMoreActions = actions.count > maxVisibleActions

        MeeshyResizableActionMenu(
            visibleActions: visibleActions,
            allActions: actions,
            hasMoreActions: hasMoreActions,
            onAction: { action in
                // If action has a page to navigate to, navigate instead of executing action
                if let pageIndex = action.navigateToPage {
                    navigateToQuickViewPage(pageIndex)
                } else {
                    action.action()
                }
            },
            onCancel: {
                dismissWithAnimation()
            },
            onModeChange: { newMode in
                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                    mode = newMode
                    // Minimize QuickView when entering alert/edit mode
                    if case .alert = newMode {
                        isQuickViewMinimized = true
                    } else if case .edit = newMode {
                        isQuickViewMinimized = true
                    }
                }
            }
        )
    }

    // MARK: - Drag Gesture

    /// Tracks the initial height when drag starts
    @State private var dragStartHeight: CGFloat = 200

    private var quickViewDragGesture: some Gesture {
        DragGesture(minimumDistance: 5)
            .onChanged { value in
                // If minimized and dragging down, expand first
                if isQuickViewMinimized {
                    if value.translation.height > 20 {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                            isQuickViewMinimized = false
                            quickViewHeight = 150
                        }
                    }
                    return
                }

                // Calculate new height based on drag direction
                // Dragging down (positive) = increase height
                // Dragging up (negative) = decrease height
                let newHeight = dragStartHeight + value.translation.height

                // Apply with bounds
                withAnimation(.interactiveSpring(response: 0.15, dampingFraction: 0.8)) {
                    quickViewHeight = min(max(newHeight, minQuickViewHeight), maxQuickViewHeight)
                }
            }
            .onEnded { value in
                // Store current height for next drag
                dragStartHeight = quickViewHeight

                // Determine final state based on velocity and position
                let velocity = value.predictedEndTranslation.height - value.translation.height

                if quickViewHeight < 80 || velocity < -200 {
                    // Minimize if height is small or fast upward swipe
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                        isQuickViewMinimized = true
                        quickViewHeight = minimizedQuickViewHeight
                        dragStartHeight = minimizedQuickViewHeight
                    }
                } else if quickViewHeight < 150 {
                    // Snap to default height
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                        quickViewHeight = 200
                        dragStartHeight = 200
                    }
                } else {
                    // Keep current height
                    dragStartHeight = quickViewHeight
                }

                // Haptic feedback
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
    }

    // MARK: - Animations

    private func performAppearAnimation() {
        // Initialize current page from config
        currentQuickViewPage = quickViewConfig.initialPage

        // Haptic feedback only - all UI elements already visible (initialized at final values)
        let impact = UIImpactFeedbackGenerator(style: .medium)
        impact.impactOccurred()

        // No animation needed - states already at final values for instant display
        // Just ensure values are set (safety net if init values get changed)
        backgroundOpacity = 0.85
        quickViewOffset = 0
        quickViewOpacity = 1.0
        previewScale = 0.95
        actionMenuOffset = 0
        actionMenuOpacity = 1.0
    }

    private func dismissWithAnimation() {
        let impact = UIImpactFeedbackGenerator(style: .light)
        impact.impactOccurred()

        // All dismiss animations happen together for snappier feel
        withAnimation(.easeIn(duration: 0.15)) {
            quickViewOffset = -100
            quickViewOpacity = 0
            actionMenuOffset = 150
            actionMenuOpacity = 0
            previewScale = 1.0
            backgroundOpacity = 0
        }

        // Call dismiss after animations complete
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            onDismiss()
        }
    }

    /// Navigate to a specific QuickView page
    private func navigateToQuickViewPage(_ pageIndex: Int) {
        // Haptic feedback
        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        // Ensure QuickView is visible (expand if minimized)
        if isQuickViewMinimized {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                isQuickViewMinimized = false
                quickViewHeight = 200
                dragStartHeight = 200
            }
        }

        // Navigate to the page
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            currentQuickViewPage = pageIndex
        }
    }
}

// MARK: - Resizable Action Menu

struct MeeshyResizableActionMenu: View {
    let visibleActions: [MeeshyActionItem]
    let allActions: [MeeshyActionItem]
    let hasMoreActions: Bool
    let onAction: (MeeshyActionItem) -> Void
    let onCancel: () -> Void
    let onModeChange: (MeeshyOverlayMode) -> Void

    @State private var actionMenuHeight: CGFloat = 0
    @State private var showAllActions = false

    // Constants for resizing
    private let minActionMenuHeight: CGFloat = 150
    private let maxActionMenuHeight: CGFloat = 400

    /// Separate compact and full actions
    private var compactActions: [MeeshyActionItem] {
        let actions = showAllActions ? allActions : visibleActions
        return actions.filter { $0.displayStyle == .compact }
    }

    private var fullActions: [MeeshyActionItem] {
        let actions = showAllActions ? allActions : visibleActions
        return actions.filter { $0.displayStyle == .full }
    }

    /// Count hidden actions
    private var hiddenActionsCount: Int {
        allActions.count - visibleActions.count
    }

    var body: some View {
        VStack(spacing: 0) {
            // Drag handle for resizing action menu
            DragHandleView(isExpanded: showAllActions, showDirectionHint: hasMoreActions)
                .gesture(actionMenuDragGesture)
                .onTapGesture {
                    if hasMoreActions {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                            showAllActions.toggle()
                        }
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    }
                }

            // HYBRID LAYOUT: Compact actions grid + Full actions list
            VStack(spacing: 0) {
                // 1. Compact actions in grid (if any)
                if !compactActions.isEmpty {
                    CompactActionGridView(actions: compactActions) { action in
                        onAction(action)
                    }

                    // Separator between compact and full actions
                    if !fullActions.isEmpty {
                        Divider()
                            .padding(.horizontal, 16)
                            .padding(.vertical, 4)
                    }
                }

                // 2. Full actions in list
                ForEach(fullActions) { action in
                    ActionMenuItemView(
                        action: action,
                        onTap: {
                            let impact = UIImpactFeedbackGenerator(style: .light)
                            impact.impactOccurred()
                            onAction(action)
                        }
                    )

                    if action.id != fullActions.last?.id {
                        Divider()
                            .padding(.horizontal, 16)
                    }
                }

                // "Plus d'options" button when there are more actions
                if hasMoreActions && !showAllActions {
                    Divider()
                        .padding(.horizontal, 16)

                    Button {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                            showAllActions = true
                        }
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    } label: {
                        HStack(spacing: 14) {
                            // Icon with gradient background
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

                            // Title
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Plus d'options")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundStyle(.primary)

                                Text("\(hiddenActionsCount) options supplémentaires")
                                    .font(.system(size: 12))
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            // Chevron
                            Image(systemName: "chevron.down")
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

            // Separator before cancel
            Divider()
                .padding(.horizontal, 16)
                .padding(.top, 8)

            // Cancel button - always at the bottom
            Button {
                onCancel()
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
            .padding(.bottom, 8)
        }
        .background(
            UnevenRoundedRectangle(
                topLeadingRadius: 20,
                topTrailingRadius: 20
            )
            .fill(Color(.systemBackground))
            .shadow(color: .black.opacity(0.15), radius: 15, x: 0, y: -5)
        )
    }

    // MARK: - Drag Gesture for Action Menu

    private var actionMenuDragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                // Dragging up (negative) expands, dragging down (positive) collapses
                if value.translation.height < -50 && !showAllActions && hasMoreActions {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showAllActions = true
                    }
                } else if value.translation.height > 50 && showAllActions {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showAllActions = false
                    }
                }
            }
            .onEnded { _ in
                let impact = UIImpactFeedbackGenerator(style: .light)
                impact.impactOccurred()
            }
    }
}

// MARK: - Compact Action Grid View

/// Grid view for compact actions (2-3 per row)
private struct CompactActionGridView: View {
    let actions: [MeeshyActionItem]
    let onAction: (MeeshyActionItem) -> Void

    // 3 columns for compact actions
    private let columns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8)
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(actions) { action in
                CompactActionItemView(action: action) {
                    onAction(action)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}

/// Single compact action item (icon + short title)
private struct CompactActionItemView: View {
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
                    .foregroundStyle(.primary)
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

// MARK: - Action Menu Item View (Full Width)

private struct ActionMenuItemView: View {
    let action: MeeshyActionItem
    let onTap: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                // Modern icon with gradient background
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
                        .foregroundStyle(.primary)

                    if let subtitle = action.subtitle {
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                // Chevron for navigation
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.tertiary)
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
                    if !isPressed {
                        isPressed = true
                    }
                }
                .onEnded { _ in
                    isPressed = false
                }
        )
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isPressed)
    }
}

// MARK: - Preview

#Preview("Actions Mode - Hybrid Layout") {
    ZStack {
        Color.blue.opacity(0.3).ignoresSafeArea()

        MeeshyOverlayMenu(
            mode: .constant(.actions),
            quickViewConfig: .init(pages: [
                .emoji(.init(
                    recentEmojis: ["❤️", "👍", "😂", "🔥", "😮", "🙏", "👏", "🎉"],
                    popularEmojis: ["😊", "😍", "🥰", "😘", "🤔", "😢", "😡", "🤯"],
                    onSelect: { _ in },
                    onBrowseAll: { }
                ))
            ]),
            preview: {
                Text("Message Preview")
                    .padding(20)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            },
            actions: [
                // Compact actions (grid - 3 per row)
                .init(icon: "arrow.turn.up.left", title: "Répondre", displayStyle: .compact, accentColor: .blue) {},
                .init(icon: "doc.on.doc", title: "Copier", displayStyle: .compact, accentColor: .orange) {},
                .init(icon: "arrowshape.turn.up.right", title: "Transférer", displayStyle: .compact, accentColor: .green) {},
                .init(icon: "pin", title: "Épingler", displayStyle: .compact, accentColor: .purple) {},
                .init(icon: "bookmark", title: "Sauvegarder", displayStyle: .compact, accentColor: .yellow) {},
                .init(icon: "star", title: "Favoris", displayStyle: .compact, accentColor: .pink) {},
                // Full actions (list)
                .init(icon: "pencil", title: "Modifier", subtitle: "Éditer le contenu du message", displayStyle: .full) {},
                .init(icon: "trash", title: "Supprimer", subtitle: "Supprimer définitivement", style: .destructive, displayStyle: .full) {}
            ],
            onDismiss: {}
        )
    }
}

#Preview("Alert Mode") {
    @Previewable @State var mode: MeeshyOverlayMode = .alert(.init(
        icon: "exclamationmark.triangle",
        title: "Supprimer ce message ?",
        message: "Cette action est irréversible.",
        confirmButton: .init(title: "Supprimer", style: .destructive) {},
        cancelButton: .init(title: "Annuler", style: .cancel) {}
    ))

    ZStack {
        Color.blue.opacity(0.3).ignoresSafeArea()

        MeeshyOverlayMenu(
            mode: $mode,
            quickViewConfig: .init(pages: []),
            preview: {
                Text("Message Preview")
                    .padding(20)
                    .background(Color.blue)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            },
            actions: [],
            onDismiss: {}
        )
    }
}
