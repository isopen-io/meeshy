import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from ConversationListView.swift

// MARK: - Section Header View
struct SectionHeaderView: View {
    let section: ConversationSection
    let count: Int
    let isExpanded: Bool
    var isDropTarget: Bool = false
    let onToggle: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var isTapped = false

    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
                isTapped = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
                    isTapped = false
                }
            }
            onToggle()
        }) {
            HStack(spacing: 10) {
                // Section icon with glow
                ZStack {
                    // Glow ring behind icon
                    Circle()
                        .fill(Color(hex: section.color).opacity(isExpanded ? 0.15 : 0))
                        .frame(width: 40, height: 40)
                        .blur(radius: 4)
                        .animation(.easeInOut(duration: 0.4), value: isExpanded)

                    Circle()
                        .fill(Color(hex: section.color).opacity(isDropTarget ? 0.5 : (isDark ? 0.25 : 0.18)))
                        .frame(width: 32, height: 32)
                        .scaleEffect(isDropTarget ? 1.15 : (isTapped ? 1.2 : 1.0))

                    Image(systemName: section.icon)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(Color(hex: section.color))
                        .scaleEffect(isTapped ? 1.15 : 1.0)
                }

                // Section name
                Text(section.name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(isDropTarget ? Color(hex: section.color) : (isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950))

                // Count badge
                Text("\(count)")
                    .font(.caption.weight(.bold))
                    .foregroundColor(Color(hex: section.color))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(
                        Capsule()
                            .fill(Color(hex: section.color).opacity(isDropTarget ? 0.4 : (isDark ? 0.2 : 0.15)))
                    )
                    .scaleEffect(isTapped ? 1.1 : 1.0)

                Spacer()

                // Drop indicator when dragging over
                if isDropTarget {
                    Image(systemName: "plus.circle.fill")
                        .font(.title3.weight(.semibold))
                        .foregroundColor(Color(hex: section.color))
                        .transition(.scale.combined(with: .opacity))
                }

                // Expand/collapse chevron with rotation animation
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(Color(hex: section.color))
                    .opacity(isDropTarget ? 0.5 : 1)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    .animation(.easeOut(duration: 0.2), value: isExpanded)
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(isDropTarget ? Color(hex: section.color).opacity(isDark ? 0.15 : 0.1) : (isExpanded ? Color(hex: section.color).opacity(0.04) : Color.clear))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(
                                isDropTarget ? Color(hex: section.color).opacity(0.5) : Color.clear,
                                lineWidth: 2
                            )
                            .animation(.easeInOut(duration: 0.3), value: isDropTarget)
                    )
            )
            .contentShape(Rectangle())
            .animation(.easeOut(duration: 0.2), value: isDropTarget)
            .animation(.easeOut(duration: 0.2), value: isExpanded)
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityValue(
            isExpanded
                ? String(localized: "accessibility.section_expanded", defaultValue: "Développée", bundle: .main)
                : String(localized: "accessibility.section_collapsed", defaultValue: "Réduite", bundle: .main)
        )
    }
}

// MARK: - Conversation Preview View (for hard press)
struct ConversationPreviewView: View {
    let conversation: Conversation
    var cachedMessages: [Message] = []

    var bannerURL: URL? = nil
    var avatarURL: String? = nil
    var storyState: StoryRingState = .none
    var moodEmoji: String? = nil
    var presenceState: PresenceState? = nil
    var isDirect: Bool = false
    var onCall: (() -> Void)? = nil
    var onSearch: (() -> Void)? = nil
    var onInfo: (() -> Void)? = nil
    var onProfileInfo: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme

    private var isDark: Bool { colorScheme == .dark }

    private var accentColor: String { conversation.accentColor }
    private var secondaryColor: String { conversation.colorPalette.secondary }

    /// Couleur du texte de l'en-tête du preview. Avec bannière, le voile sombre
    /// du `headerBackground` garantit la lisibilité du blanc. Sans bannière, le
    /// fond est pâle → texte sombre en Light (le blanc y serait illisible),
    /// blanc en Dark.
    private var headerContentColor: Color {
        if bannerURL != nil { return .white }
        return isDark ? .white : .black
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header — banner background + dark overlay for legibility
            HStack(alignment: .top, spacing: 12) {
                // Real avatar with story ring / mood / presence
                MeeshyAvatar(
                    name: conversation.name,
                    context: .conversationList,
                    accentColor: accentColor,
                    secondaryColor: secondaryColor,
                    avatarURL: avatarURL,
                    storyState: storyState,
                    moodEmoji: moodEmoji,
                    presenceState: presenceState
                )

                VStack(alignment: .leading, spacing: 8) {
                    // Titre pleine largeur — peut aller à la ligne (2 lignes).
                    // displayName (customName prioritaire) : même convention
                    // que la ligne de liste (ThemedConversationRow) — l'avatar
                    // reste sur `name` (initiales/couleur du vrai nom).
                    HStack(alignment: .top, spacing: 6) {
                        Text(conversation.displayName)
                            .font(.callout.weight(.bold))
                            .foregroundColor(headerContentColor)
                            .shadow(color: .black.opacity(0.5), radius: 3, y: 1)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)

                        if conversation.userState.isPinned {
                            Image(systemName: "pin.fill")
                                .font(.caption2)
                                .foregroundColor(MeeshyColors.error)
                                .shadow(color: .black.opacity(0.5), radius: 2, y: 1)
                        }

                        if conversation.userState.isMuted {
                            Image(systemName: "bell.slash.fill")
                                .font(.caption2)
                                .foregroundColor(headerContentColor.opacity(0.7))
                                .shadow(color: .black.opacity(0.5), radius: 2, y: 1)
                        }

                        Spacer(minLength: 0)
                    }

                    if conversation.type != .direct {
                        HStack(spacing: 3) {
                            Image(systemName: conversation.type == .group ? "person.2.fill" : "person.3.fill")
                                .font(.caption2)
                            Text("\(conversation.memberCount) " + String(localized: "unit.members", defaultValue: "membres"))
                                .font(.caption2.weight(.medium))
                        }
                        .foregroundColor(headerContentColor.opacity(0.9))
                        .shadow(color: .black.opacity(0.5), radius: 2, y: 1)
                    }

                    // Boutons d'action SOUS le titre, alignés à droite.
                    HStack(spacing: 8) {
                        Spacer(minLength: 0)
                        headerActions
                    }
                }
            }
            .padding(14)
            .background(headerBackground)

            // Recent messages preview
            VStack(spacing: 0) {
                Spacer(minLength: 0)

                if cachedMessages.isEmpty {
                    EmptyStateView(
                        icon: "bubble.left.and.bubble.right",
                        title: String(localized: "preview.no_messages", defaultValue: "Aucun message"),
                        subtitle: ""
                    )
                    .padding(.bottom, 10)
                } else {
                    ScrollViewReader { proxy in
                        ScrollView(.vertical, showsIndicators: false) {
                            VStack(spacing: 0) {
                                ForEach(cachedMessages) { msg in
                                    ThemedMessageBubble(
                                        message: msg,
                                        contactColor: accentColor,
                                        showAvatar: !msg.isMe
                                    )
                                    .allowsHitTesting(false)
                                }
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                        }
                        .onAppear {
                            guard let lastID = cachedMessages.last?.id else { return }
                            proxy.scrollTo(lastID, anchor: .bottom)
                        }
                    }
                }
            }
            .frame(minHeight: 120, maxHeight: 300)
            .background(previewBackground)
        }
        // Largeur pilotée par le call site (overlay) — source de vérité unique.
        // La carte remplit la largeur proposée ; le conteneur la fixe à 340.
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(
                    LinearGradient(
                        colors: [Color(hex: accentColor).opacity(0.5), Color(hex: secondaryColor).opacity(0.3)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .shadow(color: Color(hex: accentColor).opacity(0.3), radius: 20, y: 10)
    }

    // MARK: - Header background (banner + dark gradient)

    @ViewBuilder
    private var headerBackground: some View {
        if let bannerURL {
            ZStack {
                CachedAsyncImage(url: bannerURL.absoluteString) {
                    LinearGradient(
                        colors: [
                            Color(hex: accentColor).opacity(0.6),
                            Color(hex: secondaryColor).opacity(0.4)
                        ],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                }
                .scaledToFill()
                .clipped()

                // Dark gradient (top → bottom) + light global veil for title legibility
                LinearGradient(
                    colors: [Color.black.opacity(0.0), Color.black.opacity(0.55)],
                    startPoint: .top, endPoint: .bottom
                )
                Color.black.opacity(0.15)
            }
        } else {
            LinearGradient(
                    colors: [
                        Color(hex: accentColor).opacity(isDark ? 0.15 : 0.08),
                        Color(hex: accentColor).opacity(isDark ? 0.045 : 0.024)
                    ],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                .overlay(
                    Rectangle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: accentColor).opacity(0.1), Color.clear],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                )
        }
    }

    // MARK: - Header action buttons (glass call / search / info)

    @ViewBuilder
    private var headerActions: some View {
        HStack(spacing: 8) {
            if conversation.userState.unreadCount > 0 {
                Text("\(min(conversation.userState.unreadCount, 99))")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(
                        Capsule().fill(
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                startPoint: .topLeading, endPoint: .bottomTrailing
                            )
                        )
                    )
            }

            if let onCall {
                headerGlassButton(icon: "phone.fill", action: onCall)
            }

            headerGlassButton(icon: "magnifyingglass") { onSearch?() }

            if isDirect {
                Menu {
                    Button {
                        onInfo?()
                    } label: {
                        Label(String(localized: "conversation.info", defaultValue: "Infos conversation", bundle: .main), systemImage: "info.circle")
                    }
                    Button {
                        onProfileInfo?()
                    } label: {
                        Label(String(localized: "profile.title", defaultValue: "Profil", bundle: .main), systemImage: "person.crop.circle")
                    }
                } label: {
                    headerGlassButtonLabel(icon: "info.circle.fill")
                }
            } else {
                headerGlassButton(icon: "info.circle.fill") { onInfo?() }
            }
        }
    }

    private func headerGlassButton(icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            headerGlassButtonLabel(icon: icon)
        }
        .buttonStyle(PlainButtonStyle())
    }

    private func headerGlassButtonLabel(icon: String) -> some View {
        Image(systemName: icon)
            .font(.footnote.weight(.semibold))
            .foregroundColor(.white)
            .frame(width: 34, height: 34)
            .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(0.25))
    }

    private var previewBackground: some View {
        ZStack {
            LinearGradient(
                    colors: isDark
                        ? [Color(hex: "09090B"), Color(hex: "0F0D19"), Color(hex: "13111C")]
                        : [Color(hex: "FFFFFF"), Color(hex: "FAFAFF"), Color(hex: "F8F7FF")],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )

            // Accent colored orbs (smaller for preview)
            Circle()
                .fill(Color(hex: accentColor).opacity(isDark ? 0.1 : 0.06))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: 80, y: -80)

            Circle()
                .fill(Color(hex: secondaryColor).opacity(isDark ? 0.08 : 0.05))
                .frame(width: 150, height: 150)
                .blur(radius: 50)
                .offset(x: -60, y: 100)
        }
    }
}

// MARK: - Themed Community Card
struct ThemedCommunityCard: View, Equatable {
    let community: Community
    var action: (() -> Void)? = nil
    @State private var isPressed = false
    @State private var displayColor: String

    init(community: Community, action: (() -> Void)? = nil) {
        self.community = community
        self.action = action
        _displayColor = State(initialValue: UserDefaults.standard.string(forKey: "community.color.\(community.id)") ?? community.color)
    }

    // Leaf-cell equality (CLAUDE.md "Leaf Views"): only the community data
    // drives the body — the `action` closure and transient `@State` do not.
    static func == (lhs: ThemedCommunityCard, rhs: ThemedCommunityCard) -> Bool {
        lhs.community == rhs.community
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            // Banner image — full-bleed. Falls back to the community's
            // derived accent colour gradient when no banner is set.
            CachedBannerImage(
                urlString: community.banner,
                fallbackColor: displayColor,
                height: 110
            )

            // Dark overlay for text readability over any banner
            LinearGradient(
                colors: [.clear, .clear, Color.black.opacity(0.7)],
                startPoint: .top,
                endPoint: .bottom
            )

            // Content
            VStack(alignment: .leading, spacing: 3) {
                Text(community.name)
                    .font(.caption.weight(.bold))
                    .foregroundColor(.white)
                    .lineLimit(3)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 6) {
                    HStack(spacing: 2) {
                        Image(systemName: "person.2.fill")
                            .font(.caption2)
                        Text(formatCount(community.memberCount))
                            .font(.caption2.weight(.semibold))
                    }
                    HStack(spacing: 2) {
                        Image(systemName: "bubble.left.fill")
                            .font(.caption2)
                        Text(formatCount(community.conversationCount))
                            .font(.caption2.weight(.semibold))
                    }
                }
                .foregroundColor(.white.opacity(0.9))
            }
            .padding(8)
        }
        .frame(width: 130, height: 110)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
        .scaleEffect(isPressed ? 0.95 : 1)
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                isPressed = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                    isPressed = false
                }
                action?()
            }
            HapticFeedback.light()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(community.name), "
            + "\(community.memberCount) " + String(localized: "unit.members", defaultValue: "membres") + ", "
            + "\(community.conversationCount) " + String(localized: "tab.conversations", defaultValue: "Conversations")
        )
        .accessibilityAddTraits(.isButton)
    }

    private func formatCount(_ count: Int) -> String {
        if count >= 1000000 {
            return String(format: "%.1fM", Double(count) / 1000000.0)
        } else if count >= 1000 {
            return String(format: "%.1fk", Double(count) / 1000.0)
        }
        return "\(count)"
    }
}

// MARK: - Themed Filter Chip
struct ThemedFilterChip: View {
    let title: String
    let color: String
    let isSelected: Bool
    let action: () -> Void

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            action()
        }) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundColor(isSelected ? .white : Color(hex: color))
                .padding(.horizontal, 16)
                .padding(.vertical, 9)
                .background(
                    Capsule()
                        .fill(
                            isSelected ?
                            AnyShapeStyle(LinearGradient(colors: [Color(hex: color), Color(hex: color).opacity(0.85)], startPoint: .leading, endPoint: .trailing)) :
                            AnyShapeStyle(Color(hex: color).opacity(colorScheme == .dark ? 0.4 : 0.3))
                        )
                        .overlay(
                            Capsule()
                                .stroke(Color(hex: color).opacity(isSelected ? 0 : 0.7), lineWidth: 1)
                        )
                )
        }
        .scaleEffect(isSelected ? 1.05 : 1)
        .animation(.easeOut(duration: 0.2), value: isSelected)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - Tag Chip Component
struct TagChip: View {
    let tag: ConversationTag
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Text(tag.name)
            .font(.caption2.weight(.semibold))
            .foregroundColor(Color(hex: tag.color))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(
                Capsule()
                    .fill(Color(hex: tag.color).opacity(colorScheme == .dark ? 0.25 : 0.18))
                    .overlay(
                        Capsule()
                            .stroke(Color(hex: tag.color).opacity(0.4), lineWidth: 0.5)
                    )
            )
    }
}

