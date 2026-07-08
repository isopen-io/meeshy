import SwiftUI
import MeeshySDK

// MARK: - Avatar Context

public enum AvatarContext: Sendable {
    // Stories
    case storyTray              // 88pt (doubled 2026-05-27 — story trail = primary CTA)
    case storyTrayCompact       // 44pt (pinned mini-trail revealed in the collapsed header)
    case storyViewer            // 44pt

    // Feed
    case feedComposer           // 36pt
    case postAuthor             // 44pt
    case postComment            // 28pt
    case postReaction           // 20pt

    // Messages
    case messageBubble          // 32pt
    case typingIndicator        // 24pt

    // Conversation
    case conversationList       // 52pt
    case conversationHeaderCollapsed  // 44pt
    case conversationHeaderExpanded   // 44pt
    case conversationHeaderStacked    // 28pt
    case recentParticipant      // 20pt

    // Profile
    case profileBanner          // 90pt
    case profileEdit            // 80pt
    case profileSheet           // 80pt

    // Listings
    case userListItem           // 44pt

    // Notifications
    case notification           // 44pt

    // Custom
    case custom(CGFloat)

    public var size: CGFloat {
        switch self {
        case .storyTray: return 88  // doubled 2026-05-27 (user request — trail = primary CTA)
        case .storyTrayCompact, .storyViewer, .conversationHeaderCollapsed,
             .conversationHeaderExpanded, .postAuthor, .userListItem, .notification:
            return 44
        case .conversationList: return 52
        case .messageBubble: return 32
        case .feedComposer: return 36
        case .postComment, .conversationHeaderStacked: return 28
        case .typingIndicator: return 24
        case .postReaction, .recentParticipant: return 20
        case .profileBanner: return 90
        case .profileEdit, .profileSheet: return 80
        case .custom(let v): return v
        }
    }

    public var showsStoryRing: Bool {
        switch self {
        case .storyViewer, .postComment, .postReaction, .typingIndicator, .profileEdit:
            return false
        default: return true
        }
    }

    public var showsMoodBadge: Bool {
        switch self {
        case .storyViewer, .postComment, .postReaction, .typingIndicator,
             .profileEdit, .userListItem, .notification:
            return false
        default: return true
        }
    }

    public var showsOnlineDot: Bool {
        switch self {
        case .storyViewer, .postComment, .postReaction, .typingIndicator,
             .profileEdit, .notification:
            return false
        default: return true
        }
    }

    public var isTappable: Bool {
        switch self {
        case .postReaction, .typingIndicator:
            return false
        default: return true
        }
    }

    public var defaultPulse: Bool {
        switch self {
        case .messageBubble, .conversationHeaderCollapsed, .conversationHeaderExpanded,
             .profileBanner, .profileSheet, .custom:
            return true
        default: return false
        }
    }

    /// Si vrai, l'anneau "story unread" tourne en continu (linear repeatForever).
    /// Faux pour les contextes list/feed où 30+ avatars visibles simultanément
    /// rendraient le scroll saccadé : on garde le dégradé statique (toujours
    /// reconnaissable comme story non lue) sans animation GPU continue.
    public var animatesStoryRing: Bool {
        switch self {
        case .storyTray, .storyTrayCompact, .storyViewer, .feedComposer, .postAuthor,
             .profileBanner, .profileSheet, .profileEdit,
             .conversationHeaderExpanded:
            return true
        default: return false
        }
    }

    /// Si vrai, le badge mood pulse en continu (spring repeatForever).
    /// Idem : exclu des contextes list pour éviter N animations simultanées
    /// pendant le scroll.
    public var animatesMoodBadge: Bool {
        switch self {
        case .storyTray, .storyTrayCompact, .feedComposer, .postAuthor,
             .profileBanner, .profileSheet,
             .conversationHeaderExpanded, .conversationHeaderCollapsed:
            return true
        default: return false
        }
    }

    public var shadowRadius: CGFloat {
        switch self {
        case .postReaction, .typingIndicator, .recentParticipant: return 0
        case .postComment: return 2
        case .messageBubble, .storyViewer, .feedComposer, .userListItem, .notification,
             .conversationHeaderStacked: return 4
        case .profileBanner: return 12
        default: return 8
        }
    }

    public var shadowY: CGFloat {
        switch self {
        case .postReaction, .typingIndicator, .recentParticipant: return 0
        case .postComment: return 1
        case .messageBubble, .conversationHeaderStacked: return 2
        default: return 4
        }
    }

    public var ringSize: CGFloat { size + 6 }
    public var initialFont: CGFloat { size * 0.38 }
    public var ringWidth: CGFloat {
        switch self {
        case .storyTray: return 0.7
        // Compact pinned trail (44pt) — keep the thin story aesthetic but a
        // touch crisper so the ring stays readable at half the trail size.
        case .storyTrayCompact: return 1.5
        default: return size <= 32 ? 1.5 : 2.5
        }
    }
    public var badgeSize: CGFloat {
        // storyTray — user request 2026-05-28 « emoji mood = x0.8 du
        // bouton (+) d'ajout de story ». Le (+) fait 40pt (cf.
        // StoryTrayView), donc badge = 32pt fixes. S'applique au mood
        // placeholder ET à l'emoji animé pour garder la parité visuelle
        // entre les deux états (avant/après set du mood).
        switch self {
        case .storyTray: return 32
        default: return size * 0.42
        }
    }
    public var onlineDotSize: CGFloat { size * 0.26 }
}

// MARK: - Story Ring State

/// `nonisolated` : la conformance Equatable doit rester utilisable depuis
/// les `==` nonisolated des leaf views Equatable (FeedPostCard…) — sous
/// SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor, la conformance synthétisée
/// serait sinon MainActor-isolée.
nonisolated public enum StoryRingState: Equatable, Sendable {
    case none, unread, read
}

// MARK: - Avatar Kind

public enum AvatarKind: Sendable {
    case user
    case entity
}

// MARK: - Avatar Context Menu Item

public struct AvatarContextMenuItem: Identifiable {
    /// Stable identity derived from label+icon so SwiftUI can diff items
    /// across re-evaluations instead of tearing down / recreating them.
    /// Using UUID() caused identity churn → use-after-free when the
    /// AttributeGraph held stale closure references during view transitions.
    public let id: String
    public let label: String
    public let icon: String
    public var role: ButtonRole? = nil
    public let action: () -> Void

    public init(label: String, icon: String, role: ButtonRole? = nil, action: @escaping () -> Void) {
        self.id = "\(label)_\(icon)"
        self.label = label; self.icon = icon; self.role = role; self.action = action
    }
}

// MARK: - MeeshyAvatar

public struct MeeshyAvatar: View {
    public let name: String
    public let context: AvatarContext
    public var accentColor: String = ""
    public var secondaryColor: String? = nil
    public var avatarURL: String? = nil
    public var thumbHash: String? = nil
    public var storyState: StoryRingState = .none
    public var moodEmoji: String? = nil
    /// Présence de l'avatar. `nil` = aucune donnée (pas de dot). `.offline`
    /// (hors ligne > 30min) ne rend PAS de dot non plus — seuls online/recent
    /// (vert) et away (orange) affichent une pastille.
    public var presenceState: PresenceState? = nil
    public var onTap: (() -> Void)? = nil
    public var onViewProfile: (() -> Void)? = nil
    public var onViewStory: (() -> Void)? = nil
    public var onMoodTap: ((CGPoint) -> Void)? = nil
    public var onOnlineTap: (() -> Void)? = nil
    public var contextMenuItems: [AvatarContextMenuItem]? = nil
    public var enablePulse: Bool = true
    public var kind: AvatarKind = .user

    // Primary init (AvatarContext)
    public init(name: String, context: AvatarContext, kind: AvatarKind = .user, accentColor: String = "",
                secondaryColor: String? = nil, avatarURL: String? = nil, thumbHash: String? = nil,
                storyState: StoryRingState = .none, moodEmoji: String? = nil,
                presenceState: PresenceState? = nil, enablePulse: Bool? = nil,
                isDark: Bool = ThemeManager.shared.mode.isDark,
                onTap: (() -> Void)? = nil, onViewProfile: (() -> Void)? = nil,
                onViewStory: (() -> Void)? = nil, onMoodTap: ((CGPoint) -> Void)? = nil,
                onOnlineTap: (() -> Void)? = nil, contextMenuItems: [AvatarContextMenuItem]? = nil) {
        self.name = name; self.context = context; self.kind = kind; self.accentColor = accentColor
        self.secondaryColor = secondaryColor; self.avatarURL = avatarURL; self.thumbHash = thumbHash
        self.storyState = storyState; self.moodEmoji = moodEmoji; self.presenceState = presenceState
        self.enablePulse = enablePulse ?? context.defaultPulse; self.isDark = isDark
        self.onTap = onTap; self.onViewProfile = onViewProfile; self.onViewStory = onViewStory
        self.onMoodTap = onMoodTap; self.onOnlineTap = onOnlineTap; self.contextMenuItems = contextMenuItems
        // Memoized once from the immutable inputs (name/accentColor/secondaryColor).
        // Previously computed vars: `colorForName` (DJB2 hash) and the initials
        // split re-ran on every body access — once per shadow/fill/ring/secondary
        // read, and again on every story-ring rotation tick. Computing here keeps
        // every subsequent render allocation- and hash-free.
        let accent = accentColor.isEmpty ? DynamicColorGenerator.colorForName(name) : accentColor
        self.resolvedAccent = accent
        self.resolvedSecondary = secondaryColor ?? accent
        self.initials = Self.makeInitials(from: name)
    }

    @State private var tapScale: CGFloat = 1.0
    @State private var moodScale: CGFloat = 1.0
    private let isDark: Bool
    private let resolvedAccent: String
    private let resolvedSecondary: String
    private let initials: String
    private var theme: ThemeManager { ThemeManager.shared }

    private var secondaryGradientColor: Color {
        secondaryColor != nil ? Color(hex: resolvedSecondary) : Color(hex: resolvedAccent).opacity(0.6)
    }

    private var effectiveStoryState: StoryRingState {
        guard kind == .user else { return .none }
        return context.showsStoryRing ? storyState : .none
    }

    private var effectiveMoodEmoji: String? {
        guard kind == .user else { return nil }
        return context.showsMoodBadge ? moodEmoji : nil
    }

    private var effectivePresence: PresenceState? {
        guard kind == .user, context.showsOnlineDot else { return nil }
        // Offline (>30min) : aucun dot. Le gris reste défini dans
        // PresenceState.dotColor pour les affichages labellisés, pas ici.
        guard presenceState != .offline else { return nil }
        return presenceState
    }

    private var hasTapHandler: Bool {
        context.isTappable && (onTap != nil || onViewProfile != nil || onViewStory != nil)
    }

    private var effectiveContextMenuItems: [AvatarContextMenuItem] {
        var items: [AvatarContextMenuItem] = []
        if let onViewProfile {
            items.append(.init(label: "Voir le profil", icon: "person.fill", action: onViewProfile))
        }
        if let onViewStory, kind == .user, storyState != .none {
            items.append(.init(label: "Voir la story", icon: "play.circle.fill", action: onViewStory))
        }
        if let custom = contextMenuItems {
            for item in custom {
                if !items.contains(where: { $0.label == item.label }) {
                    items.append(item)
                }
            }
        }
        return items
    }

    private func hasContextMenu(resolvedItems: [AvatarContextMenuItem]) -> Bool {
        context.isTappable && !resolvedItems.isEmpty
    }

    private func handleTap() {
        HapticFeedback.light()
        if storyState == .unread, let onViewStory { onViewStory(); return }
        if let onTap { onTap(); return }
        if let onViewProfile { onViewProfile(); return }
    }

    // MARK: - Body

    public var body: some View {
        // Eagerly resolve the menu items ONCE per body evaluation so the
        // contextMenu closure captures a single, stable array. Previously
        // the computed property was called lazily inside the closure,
        // creating a new array (with new closures) on each SwiftUI
        // attribute-graph pass — the old closures could be deallocated
        // while the graph still referenced them (EXC_BAD_ACCESS).
        let resolvedMenuItems = effectiveContextMenuItems
        let showContextMenu = hasContextMenu(resolvedItems: resolvedMenuItems)

        let visual = ZStack {
            storyRing
            avatarBody
        }
        .overlay(alignment: .bottomTrailing) {
            if let emoji = effectiveMoodEmoji, !emoji.isEmpty {
                moodBadge(emoji: emoji)
                    .offset(badgeOffset(badgeHalfSize: context.badgeSize / 2))
            } else if let presence = effectivePresence {
                onlineDot(for: presence)
                    .offset(badgeOffset(badgeHalfSize: context.onlineDotSize / 2))
            }
        }
        .scaleEffect(tapScale)

        let tappable = Group {
            if hasTapHandler {
                visual
                    .contentShape(Circle())
                    .onTapGesture {
                        withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { tapScale = 0.9 }
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { tapScale = 1.0 }
                        }
                        handleTap()
                    }
            } else { visual }
        }

        if showContextMenu {
            tappable
                .contextMenu {
                    ForEach(resolvedMenuItems) { item in
                        Button(role: item.role) {
                            item.action()
                        } label: {
                            Label(item.label, systemImage: item.icon)
                        }
                    }
                }
                .accessibilityLabel(name)
        } else {
            tappable
                .accessibilityLabel(name)
        }
    }

    // MARK: - Avatar Body

    @ViewBuilder
    private var avatarBody: some View {
        if let url = avatarURL, !url.isEmpty {
            CachedAvatarImage(urlString: url, thumbHash: thumbHash, name: name, size: context.size, accentColor: resolvedAccent)
                .shadow(color: Color(hex: resolvedAccent).opacity(0.4), radius: context.shadowRadius, y: context.shadowY)
        } else {
            ZStack {
                Circle()
                    .fill(LinearGradient(
                        colors: [Color(hex: resolvedAccent), secondaryGradientColor],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
                    .frame(width: context.size, height: context.size)
                Text(initials)
                    .font(.system(size: context.initialFont, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
            }
            .shadow(color: Color(hex: resolvedAccent).opacity(0.4), radius: context.shadowRadius, y: context.shadowY)
        }
    }

    // MARK: - Story Ring

    @ViewBuilder
    private var storyRing: some View {
        switch effectiveStoryState {
        case .unread:
            // Unread-story affordance: solid brand-primary ring at double the
            // resting width (product decision 2026-06-21). Replaces the former
            // Instagram-style multi-colour rotating gradient.
            Circle()
                .stroke(MeeshyColors.brandPrimary, lineWidth: context.ringWidth * 2)
                .frame(width: context.ringSize, height: context.ringSize)
        case .read:
            Circle()
                .stroke(Color(hex: resolvedAccent).opacity(0.3), lineWidth: context.ringWidth)
                .frame(width: context.ringSize, height: context.ringSize)
        case .none:
            EmptyView()
        }
    }

    /// Calcule l'offset pour positionner le badge sur le bord de l'avatar à 45°,
    /// en tenant compte du fait que le glow story-unread agrandit le ZStack à (size+20).
    private func badgeOffset(badgeHalfSize: CGFloat) -> CGSize {
        guard effectiveStoryState != .none else { return .zero }
        let avatarR = context.size / 2
        let zstackSize = context.ringSize
        let zstackCenter = zstackSize / 2
        let target = zstackCenter + avatarR * cos(.pi / 4)
        let current = zstackSize - badgeHalfSize
        let delta = target - current
        return CGSize(width: delta, height: delta)
    }

    private func moodBadge(emoji: String) -> some View {
        // Frame explicite = `context.badgeSize` pour éviter le collapse du
        // GeometryReader en overlay context (sans frame, le reader peut
        // s'effondrer à 0×0 selon le contexte parent → emoji invisible).
        // Le glyphe Text est rendu à `badgeSize × 0.65` ; le frame de la
        // bounding box vaut badgeSize pour donner au glyph la place
        // visuelle complète + la hit area du tap mood.
        GeometryReader { geo in
            Text(emoji)
                .font(.system(size: context.badgeSize * 0.65))
                .frame(width: context.badgeSize, height: context.badgeSize)
                .scaleEffect(moodScale)
                .contentShape(Circle())
                .onTapGesture {
                    HapticFeedback.light()
                    let f = geo.frame(in: .global)
                    onMoodTap?(CGPoint(x: f.midX, y: f.midY))
                }
                .onAppear {
                    // `moodScale == 1.0` = pas de pulse en vol pour cette
                    // identité de vue. Un `.onAppear` peut re-fire sans
                    // `.onDisappear` intermédiaire (ScrollView, re-parenting) ;
                    // relancer un `repeatForever` par-dessus un autre les fait
                    // COMBINER par le moteur (aucun des deux ne se termine
                    // jamais) et chaque frame les évalue tous, pour toujours
                    // (hog device 2026-07-03 : `DefaultCombiningAnimation` à
                    // ~90 % du thread ViewGraphDisplayLink).
                    guard context.animatesMoodBadge, moodScale == 1.0 else { return }
                    withAnimation(
                        .spring(response: 0.5, dampingFraction: 0.4)
                        .repeatForever(autoreverses: true)
                        .delay(Double.random(in: 0...1.5))
                    ) {
                        moodScale = 1.18
                    }
                }
                .onDisappear {
                    withTransaction(Transaction(animation: nil)) {
                        moodScale = 1.0
                    }
                }
        }
        .frame(width: context.badgeSize, height: context.badgeSize)
        .ifTrue(enablePulse) { $0.pulse(intensity: 0.12) }
    }

    @ViewBuilder
    private func onlineDot(for presence: PresenceState) -> some View {
        // Couleur via le mapping central PresenceState.dotColor (PresenceStyle) :
        // vert online/recent, orange away, gris offline.
        let dot = Circle()
            .fill(presence.dotColor)
            .frame(width: context.onlineDotSize, height: context.onlineDotSize)
            .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 2))
            .onTapGesture {
                HapticFeedback.light()
                onOnlineTap?()
            }

        // Pulse actif uniquement quand en ligne ET story ring visible ET enablePulse
        if enablePulse && presence.pulses && effectiveStoryState != .none {
            dot.pulse(intensity: 0.12)
        } else {
            dot
        }
    }

    // MARK: - Helpers

    /// Pure initials derivation (first letter of up to two words, uppercased,
    /// falling back to the first character). `nonisolated` so it is reachable
    /// from the `nonisolated`-friendly path and unit-testable off the MainActor.
    nonisolated static func makeInitials(from name: String) -> String {
        let parts = name.components(separatedBy: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
        return parts.isEmpty ? String(name.prefix(1)).uppercased() : parts
    }

}

