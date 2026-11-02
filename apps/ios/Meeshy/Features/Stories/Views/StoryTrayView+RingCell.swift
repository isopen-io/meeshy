import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// MARK: - Story Ring Cell (shared by grande + compact pinned trail)

/// One story group rendered as avatar ring + (optional) username, sharing the
/// exact same `MeeshyAvatar` atom across the full-size trail and the compact
/// pinned mini-trail. `context` drives the size (`.storyTray` 88pt vs
/// `.storyTrayCompact` 36pt); all proportional metrics derive from it.
struct StoryRingCell: View, Equatable {
    let group: StoryGroup
    var context: AvatarContext = StoryEntryMetrics.avatarContext
    var showsUsername: Bool = true
    let onViewStory: () -> Void
    let onShowProfile: () -> Void
    /// Entrées de menu SUPPLÉMENTAIRES, propres à un usage précis de la
    /// cellule. La mini-trail y injecte « Gérer mes stories » sur son PROPRE
    /// anneau : depuis que le tap y ouvre le viewer, c'est le seul chemin
    /// restant vers la gestion — et vers l'ÉDITION d'une story publiée — quand
    /// la grande trail est scrollée hors écran.
    var contextMenuExtras: [AvatarContextMenuItem] = []

    private var theme: ThemeManager { ThemeManager.shared }
    /// Humeur + tap humeur passés en `let` par le parent (qui observe déjà
    /// StatusViewModel) — l'`@EnvironmentObject` abonnait CHAQUE cellule du
    /// tray à chaque mise à jour de statut globale (P1-3a).
    var moodEmoji: String? = nil
    var onMoodTap: ((CGPoint) -> Void)? = nil
    /// Ce que la cellule AFFICHE, relevé une fois par passe du parent : la
    /// comparaison (`==`) ne lit que lui, jamais les fermetures (#10574).
    private let renderInputs: StoryRingCellRenderInputs

    init(
        group: StoryGroup,
        context: AvatarContext = StoryEntryMetrics.avatarContext,
        showsUsername: Bool = true,
        onViewStory: @escaping () -> Void,
        onShowProfile: @escaping () -> Void,
        contextMenuExtras: [AvatarContextMenuItem] = [],
        moodEmoji: String? = nil,
        onMoodTap: ((CGPoint) -> Void)? = nil
    ) {
        self.group = group
        self.context = context
        self.showsUsername = showsUsername
        self.onViewStory = onViewStory
        self.onShowProfile = onShowProfile
        self.contextMenuExtras = contextMenuExtras
        self.moodEmoji = moodEmoji
        self.onMoodTap = onMoodTap
        self.renderInputs = StoryRingCellRenderInputs(
            group: group,
            coverURL: latestStoryThumbnailURL(group),
            avatarSize: context.size,
            showsUsername: showsUsername,
            moodEmoji: moodEmoji,
            hasMoodTap: onMoodTap != nil,
            presence: PresenceManager.shared.presenceState(for: group.id, served: group.authorPresence),
            menuLabels: contextMenuExtras.map(\.label),
            theme: ThemeManager.shared.mode
        )
    }

    nonisolated static func == (lhs: StoryRingCell, rhs: StoryRingCell) -> Bool {
        lhs.renderInputs == rhs.renderInputs
    }

    private var isCompact: Bool { context.size <= 44 }

    var body: some View {
        VStack(spacing: isCompact ? 4 : StoryEntryMetrics.labelSpacing) {
            ZStack {
                MeeshyAvatar(
                    name: group.username,
                    context: context,
                    accentColor: group.avatarColor,
                    avatarURL: latestStoryThumbnailURL(group),
                    storyState: group.hasUnviewed ? .unread : .read,
                    moodEmoji: moodEmoji,
                    presenceState: renderInputs.presence,
                    ring: group.authorRing,
                    onMoodTap: onMoodTap,
                    contextMenuItems: [
                        AvatarContextMenuItem(label: StoryTrayCopy.viewStories, icon: "play.circle.fill") {
                            onViewStory()
                        },
                        AvatarContextMenuItem(label: StoryTrayCopy.viewProfile, icon: "person.fill") {
                            onShowProfile()
                        }
                    ] + contextMenuExtras
                )

                // Story count dots (multiple stories indicator) — offset scales
                // with the avatar so it stays pinned to the bottom edge.
                // Compte les stories VIVANTES uniquement : le groupe self garde
                // ses stories expirées (archive auteur, exemptées de la purge)
                // — les compter gonflait les points avec des stories éteintes.
                let liveCount = group.stories.filter { !$0.isExpired() }.count
                if liveCount > 1 {
                    storyCountDots(count: liveCount, unviewed: group.hasUnviewed)
                        .offset(y: context.size * 0.318)
                }
            }

            if showsUsername {
                Text(group.username)
                    .font(MeeshyFont.relative(isCompact ? 9 : StoryEntryMetrics.labelFontSize, weight: group.hasUnviewed ? .semibold : .medium))
                    .foregroundColor(group.hasUnviewed ? theme.textPrimary : theme.textMuted)
                    .lineLimit(1)
                    .frame(width: isCompact ? 56 : StoryEntryMetrics.labelWidth)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            HapticFeedback.medium()
            Logger.messages.info("[StoryRingCell] tap ring group.id=\(group.id, privacy: .public) username=\(group.username, privacy: .public)")
            onViewStory()
        }
    }
}

// MARK: - Ce qu'une cellule d'anneau affiche (#10574)

/// Mesuré sur l'iPhone le 2026-10-13 : 7 409 recalculs de `StoryRingCell` en
/// 4 min 30, une cinquantaine à chaque passe de la liste — ses fermetures
/// changent d'identité à chaque passe, SwiftUI ne pouvait rien prouver.
nonisolated struct StoryRingCellRenderInputs: Equatable {
    let id: String
    let username: String
    let avatarColor: String
    let storyIds: [String]
    let hasUnviewed: Bool
    let liveCount: Int
    let coverURL: String?
    let avatarSize: CGFloat
    let showsUsername: Bool
    let moodEmoji: String?
    let hasMoodTap: Bool
    let presence: PresenceState
    let menuLabels: [String]
    let theme: ThemeMode
    /// Le contour équipé de l'auteur (#10946) : un contour qui arrive repeint la cellule.
    let ring: ServedProfileDecorItem?

    init(
        group: StoryGroup,
        coverURL: String?,
        avatarSize: CGFloat,
        showsUsername: Bool,
        moodEmoji: String?,
        hasMoodTap: Bool,
        presence: PresenceState,
        menuLabels: [String],
        theme: ThemeMode,
        now: Date = Date()
    ) {
        id = group.id
        username = group.username
        avatarColor = group.avatarColor
        storyIds = group.stories.map(\.id)
        hasUnviewed = group.hasUnviewed
        ring = group.authorRing
        liveCount = group.stories.filter { !$0.isExpired(at: now) }.count
        self.coverURL = coverURL
        self.avatarSize = avatarSize
        self.showsUsername = showsUsername
        self.moodEmoji = moodEmoji
        self.hasMoodTap = hasMoodTap
        self.presence = presence
        self.menuLabels = menuLabels
        self.theme = theme
    }
}

// MARK: - Story Count Dots (shared)

@ViewBuilder
fileprivate func storyCountDots(count: Int, unviewed: Bool) -> some View {
    HStack(spacing: MeeshySpacing.xxs) {
        ForEach(0..<min(count, 5), id: \.self) { _ in
            Circle()
                .fill(unviewed ? Color.white.opacity(MeeshyOpacity.intense) : Color.white.opacity(MeeshyOpacity.medium))
                .frame(width: 4, height: 4)
        }
        if count > 5 {
            Text("+")
                .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .bold))
                .foregroundColor(.white.opacity(MeeshyOpacity.strong))
        }
    }
    .accessibilityHidden(true)
}
