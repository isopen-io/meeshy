import SwiftUI
import MeeshySDK
import MeeshyUI

extension ConversationInfoSheet {

    // MARK: - Hero Conversation Header (every conversation type)

    var heroConversationHeader: some View {
        VStack(spacing: 0) {
            Color.clear
                .frame(height: ProfileHeaderMetrics.expandedBanner)
                .overlay { heroBannerImage.allowsHitTesting(false).accessibilityHidden(true) }
                .clipped()
                .contentShape(Rectangle())

            // Avatar overlapping banner
            headerAvatar
                .padding(.top, -40)

            Text(conversation.name)
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold, design: .rounded))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .padding(.top, MeeshySpacing.smPlus)
                .padding(.horizontal, MeeshySpacing.xl)

            conversationInfoRow
                .padding(.top, MeeshySpacing.sm)

            muteIndicator
                .padding(.top, MeeshySpacing.xsPlus)

            // La batterie du pair d'un direct (#14147) : le détail pendant un épisode, rien hors épisode.
            if let peer = ConversationRowListening.userId(for: conversation) {
                BatteryDetailSection(userId: peer)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.top, MeeshySpacing.sm)
                // Son téléphone injoignable (#18737) : depuis quand et pourquoi, rien quand il répond.
                PhoneReachabilityDetailSection(userId: peer)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.top, MeeshySpacing.sm)
                // Sans réponse à « Tout va bien ? » (#18738) : depuis quand, sa batterie et sa position si partagées.
                InactivityAlertDetailSection(userId: peer)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.top, MeeshySpacing.sm)
                // La chute détectée (#18748) : l'heure, la batterie et la position seulement si servies ; rien hors épisode.
                FallDetailSection(userId: peer)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.top, MeeshySpacing.sm)
                // En appel (#18753) : depuis quand, jamais avec qui ; rien hors appel.
                PhoneCallDetailSection(userId: peer)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .padding(.top, MeeshySpacing.sm)
            }

            Text(String(format: String(localized: "conversation.info.created-on", defaultValue: "Créé le %@", bundle: .main), conversation.createdAt.formatted(.dateTime.day().month().year())))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundStyle(theme.textMuted)
                .padding(.top, MeeshySpacing.xsPlus)
        }
        .padding(.bottom, MeeshySpacing.lg)
    }

    /// L'avatar du pair (présence, humeur, anneau) en tête-à-tête, celui de l'entité ailleurs.
    @ViewBuilder
    private var headerAvatar: some View {
        if isDirect {
            LivePresence { MeeshyAvatar(
                name: conversation.name,
                context: .profileSheet,
                accentColor: accentColor,
                avatarURL: conversation.participantAvatarURL,
                moodEmoji: otherUserId.flatMap { moodEmojiResolver?($0) },
                presenceState: otherUserId.map { presenceManager.presenceState(for: $0) },
                isHere: otherUserId.map { presenceManager.here(userId: $0, conversationId: conversation.id) } ?? .absent,
                ring: conversation.participantRing,
                onMoodTap: otherUserId.flatMap { moodTapResolver?($0) }
            ) }
        } else {
            MeeshyAvatar(
                name: conversation.name,
                context: .profileBanner,
                kind: .entity,
                accentColor: accentColor,
                avatarURL: conversation.avatar
            )
            .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 4))
        }
    }

    // MARK: - Compact pinned bar (overlay, fades in when collapsed)
    /// Le petit avatar de la barre compacte : le pair avec sa présence et son contour servis, ou l'entité.
    @ViewBuilder
    private var compactAvatar: some View {
        if isDirect {
            LivePresence { MeeshyAvatar(
                name: conversation.name,
                context: .custom(32),
                accentColor: accentColor,
                avatarURL: conversation.participantAvatarURL,
                presenceState: otherUserId.map { presenceManager.presenceState(for: $0) },
                ring: conversation.participantRing
            ) }
        } else {
            MeeshyAvatar(
                name: conversation.name,
                context: .custom(32),
                kind: .entity,
                accentColor: accentColor,
                avatarURL: conversation.avatar
            )
        }
    }

    var compactPinnedBar: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            compactAvatar

            VStack(alignment: .leading, spacing: 0) {
                Text(conversation.name)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold, design: .rounded))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                Text(conversation.type.displayName)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(accent)
                    .lineLimit(1)
            }

            Spacer()
        }
        // Les insets dégagent Fermer (à gauche) et Réglages (à droite), posés par-dessus.
        .padding(.leading, 56)
        .padding(.trailing, canManageMembers && !isDirect ? 56 : MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .frame(height: ProfileHeaderMetrics.collapsedBar)
        .background(theme.backgroundPrimary)
        .overlay(alignment: .bottom) {
            Divider().opacity(MeeshyOpacity.medium)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var heroBannerImage: some View {
        if let bannerURL = conversation.banner, !bannerURL.isEmpty {
            // CachedAsyncImage (vs raw AsyncImage) caches the banner so reopening
            // the info sheet doesn't re-download it, and decodes it at the 140-pt
            // banner size rather than full resolution.
            // showsStatusOverlays: false — echec silencieux vers le gradient
            // deja fourni ; pas de bouton retry sur une banniere decorative.
            CachedAsyncImage(
                url: bannerURL,
                targetSize: CGSize(width: 400, height: 140),
                showsStatusOverlays: false
            ) {
                heroBannerPlaceholder
            }
            .aspectRatio(contentMode: .fill)
        } else {
            heroBannerPlaceholder
        }
    }

    private var heroBannerPlaceholder: some View {
        LinearGradient(
            colors: [
                accent.opacity(0.4),
                accent.opacity(MeeshyOpacity.light),
                accent.opacity(MeeshyOpacity.medium)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Shared Info Sub-views

    private var conversationInfoRow: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: conversationTypeIcon)
                .font(MeeshyFont.relative(11, weight: .semibold))
                .foregroundColor(accent)

            Text(conversation.type.displayName)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundStyle(theme.textSecondary)

            if conversation.memberCount > 0 {
                MetaSeparator()
                    .foregroundStyle(theme.textMuted)
                Image(systemName: "person.2.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs))
                    .foregroundStyle(theme.textMuted)
                Text(conversation.memberCountDisplay)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundStyle(theme.textSecondary)
            }
        }
    }

    @ViewBuilder
    private var muteIndicator: some View {
        if conversation.userState.isMuted {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: "bell.slash.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs))
                Text(String(localized: "conversation.info.muted", defaultValue: "Notifications désactivées", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            }
            .foregroundColor(theme.textMuted)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xs)
            .background(Capsule().fill(theme.textMuted.opacity(MeeshyOpacity.subtle)))
        }
    }

    private var conversationTypeIcon: String {
        switch conversation.type {
        case .direct: return "person.fill"
        case .group: return "person.3.fill"
        case .public, .global, .broadcast: return "globe"
        case .community: return "building.2.fill"
        case .channel: return "megaphone.fill"
        case .bot: return "cpu.fill"
        }
    }
}
