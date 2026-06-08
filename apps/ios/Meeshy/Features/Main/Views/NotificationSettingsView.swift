import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct NotificationSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @ObservedObject private var prefs = UserPreferencesManager.shared

    private let accentColor = "6366F1"

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text(String(localized: "settings.notifications.title", defaultValue: "Notifications", bundle: .main))
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                generalSection
                messagesSection
                conversationsSection
                contactsSection
                feedSection
                displaySection
                dndSection

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    // MARK: - General

    private var generalSection: some View {
        settingsSection(title: String(localized: "settings.notifications.general", defaultValue: "Général", bundle: .main), icon: "bell.fill", color: "FF6B6B") {
            notifToggle(icon: "bell.badge.fill", title: String(localized: "settings.notifications.push", defaultValue: "Push", bundle: .main), color: "FF6B6B",
                        keyPath: \.pushEnabled)

            notifToggle(icon: "envelope.fill", title: String(localized: "settings.notifications.email", defaultValue: "Email", bundle: .main), color: "45B7D1",
                        keyPath: \.emailEnabled)

            notifToggle(icon: "speaker.wave.2.fill", title: String(localized: "settings.notifications.sounds", defaultValue: "Sons", bundle: .main), color: "4ECDC4",
                        keyPath: \.soundEnabled)

            notifToggle(icon: "iphone.radiowaves.left.and.right", title: String(localized: "settings.notifications.vibrations", defaultValue: "Vibrations", bundle: .main), color: "9B59B6",
                        keyPath: \.vibrationEnabled)

            notifToggle(icon: "app.badge.fill", title: String(localized: "settings.notifications.badges", defaultValue: "Badges", bundle: .main), color: "F8B500",
                        keyPath: \.notificationBadgeEnabled)
        }
    }

    // MARK: - Messages

    private var messagesSection: some View {
        settingsSection(title: String(localized: "settings.notifications.messages", defaultValue: "Messages", bundle: .main), icon: "message.fill", color: "4ECDC4") {
            notifToggle(icon: "bubble.left.fill", title: String(localized: "settings.notifications.new_messages", defaultValue: "Nouveaux messages", bundle: .main), color: "4ECDC4",
                        keyPath: \.newMessageEnabled)

            notifToggle(icon: "phone.arrow.down.left", title: String(localized: "settings.notifications.missed_calls", defaultValue: "Appels manqués", bundle: .main), color: "FF6B6B",
                        keyPath: \.missedCallEnabled)

            notifToggle(icon: "mic.fill", title: String(localized: "settings.notifications.voicemail", defaultValue: "Messages vocaux", bundle: .main), color: "9B59B6",
                        keyPath: \.voicemailEnabled)

            notifToggle(icon: "gear", title: String(localized: "settings.notifications.system", defaultValue: "Système", bundle: .main), color: "45B7D1",
                        keyPath: \.systemEnabled)
        }
    }

    // MARK: - Conversations

    private var conversationsSection: some View {
        settingsSection(title: String(localized: "settings.notifications.conversations", defaultValue: "Conversations", bundle: .main), icon: "bubble.left.and.bubble.right.fill", color: "9B59B6") {
            notifToggle(icon: "text.bubble.fill", title: String(localized: "settings.notifications.conversations", defaultValue: "Conversations", bundle: .main), color: "9B59B6",
                        keyPath: \.conversationEnabled)

            notifToggle(icon: "arrowshape.turn.up.left.fill", title: String(localized: "settings.notifications.replies", defaultValue: "Réponses", bundle: .main), color: "4ECDC4",
                        keyPath: \.replyEnabled)

            notifToggle(icon: "at", title: String(localized: "settings.notifications.mentions", defaultValue: "Mentions", bundle: .main), color: "F8B500",
                        keyPath: \.mentionEnabled)

            notifToggle(icon: "face.smiling.fill", title: String(localized: "settings.notifications.reactions", defaultValue: "Réactions", bundle: .main), color: "FF6B6B",
                        keyPath: \.reactionEnabled)
        }
    }

    // MARK: - Contacts & Groups

    private var contactsSection: some View {
        settingsSection(title: String(localized: "settings.notifications.contacts_groups", defaultValue: "Contacts & Groupes", bundle: .main), icon: "person.2.fill", color: "4ECDC4") {
            notifToggle(icon: "person.badge.plus", title: String(localized: "settings.notifications.contact_requests", defaultValue: "Demandes de contact", bundle: .main), color: "4ECDC4",
                        keyPath: \.contactRequestEnabled)

            notifToggle(icon: "person.3.fill", title: String(localized: "settings.notifications.group_invites", defaultValue: "Invitations groupe", bundle: .main), color: "45B7D1",
                        keyPath: \.groupInviteEnabled)

            notifToggle(icon: "person.badge.shield.checkmark", title: String(localized: "settings.notifications.member_joined", defaultValue: "Membre rejoint", bundle: .main), color: "4ADE80",
                        keyPath: \.memberJoinedEnabled)

            notifToggle(icon: "person.fill.xmark", title: String(localized: "settings.notifications.member_left", defaultValue: "Membre parti", bundle: .main), color: "FF6B6B",
                        keyPath: \.memberLeftEnabled)
        }
    }

    // MARK: - Feed Social

    private var feedSection: some View {
        settingsSection(title: String(localized: "settings.notifications.feed_social", defaultValue: "Feed Social", bundle: .main), icon: "square.stack.fill", color: "F8B500") {
            notifToggle(icon: "heart.fill", title: String(localized: "settings.notifications.post_likes", defaultValue: "Likes posts", bundle: .main), color: "FF6B6B",
                        keyPath: \.postLikeEnabled)

            notifToggle(icon: "text.bubble.fill", title: String(localized: "settings.notifications.post_comments", defaultValue: "Commentaires posts", bundle: .main), color: "4ECDC4",
                        keyPath: \.postCommentEnabled)

            notifToggle(icon: "arrow.triangle.2.circlepath", title: String(localized: "settings.notifications.reposts", defaultValue: "Reposts", bundle: .main), color: "45B7D1",
                        keyPath: \.postRepostEnabled)

            notifToggle(icon: "sparkles", title: String(localized: "settings.notifications.story_reactions", defaultValue: "Réactions stories", bundle: .main), color: "F8B500",
                        keyPath: \.storyReactionEnabled)

            notifToggle(icon: "arrowshape.turn.up.left.2.fill", title: String(localized: "settings.notifications.comment_replies", defaultValue: "Réponses commentaires", bundle: .main), color: "9B59B6",
                        keyPath: \.commentReplyEnabled)

            notifToggle(icon: "hand.thumbsup.fill", title: String(localized: "settings.notifications.comment_likes", defaultValue: "Likes commentaires", bundle: .main), color: "FF6B6B",
                        keyPath: \.commentLikeEnabled)
        }
    }

    // MARK: - Display

    private var displaySection: some View {
        settingsSection(title: String(localized: "settings.notifications.display", defaultValue: "Affichage", bundle: .main), icon: "eye.fill", color: "45B7D1") {
            notifToggle(icon: "text.below.photo.fill", title: String(localized: "settings.notifications.preview", defaultValue: "Aperçu", bundle: .main), color: "45B7D1",
                        keyPath: \.showPreview)

            notifToggle(icon: "person.text.rectangle", title: String(localized: "settings.notifications.sender_name", defaultValue: "Nom expéditeur", bundle: .main), color: "9B59B6",
                        keyPath: \.showSenderName)

            notifToggle(icon: "rectangle.stack.fill", title: String(localized: "settings.notifications.group_notifications", defaultValue: "Grouper notifications", bundle: .main), color: "4ECDC4",
                        keyPath: \.groupNotifications)
        }
    }

    // MARK: - Do Not Disturb

    private var dndSection: some View {
        settingsSection(title: String(localized: "settings.notifications.dnd", defaultValue: "Ne pas déranger", bundle: .main), icon: "moon.fill", color: "9B59B6") {
            notifToggle(icon: "moon.zzz.fill", title: String(localized: "settings.notifications.dnd_enable", defaultValue: "Activer DnD", bundle: .main), color: "9B59B6",
                        keyPath: \.dndEnabled)

            settingsRow(icon: "clock.fill", title: String(localized: "settings.notifications.dnd_start", defaultValue: "Heure début", bundle: .main), color: "45B7D1") {
                TextField("", text: Binding(
                    get: { prefs.notification.dndStartTime },
                    set: { val in prefs.updateNotification { $0.dndStartTime = val } }
                ))
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .multilineTextAlignment(.trailing)
                .frame(width: 60)
            }

            settingsRow(icon: "clock.badge.checkmark", title: String(localized: "settings.notifications.dnd_end", defaultValue: "Heure fin", bundle: .main), color: "4ECDC4") {
                TextField("", text: Binding(
                    get: { prefs.notification.dndEndTime },
                    set: { val in prefs.updateNotification { $0.dndEndTime = val } }
                ))
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .multilineTextAlignment(.trailing)
                .frame(width: 60)
            }

            settingsRow(icon: "calendar", title: String(localized: "settings.notifications.dnd_days", defaultValue: "Jours", bundle: .main), color: "F8B500") {
                dndDaysSelector
            }
        }
    }

    // MARK: - DnD Days Selector

    private var dndDaysSelector: some View {
        HStack(spacing: 4) {
            ForEach(DndDay.allCases, id: \.self) { day in
                let isSelected = prefs.notification.dndDays.contains(day)
                Button {
                    HapticFeedback.light()
                    prefs.updateNotification { notif in
                        if isSelected {
                            notif.dndDays.removeAll { $0 == day }
                        } else {
                            notif.dndDays.append(day)
                        }
                    }
                } label: {
                    Text(dayLabel(day))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(isSelected ? .white : theme.textMuted)
                        .frame(width: 28, height: 28)
                        .background(
                            Capsule()
                                .fill(isSelected ? Color(hex: accentColor) : Color(hex: accentColor).opacity(0.15))
                        )
                }
            }
        }
    }

    // MARK: - Helpers

    private func dayLabel(_ day: DndDay) -> String {
        switch day {
        case .mon: return "L"
        case .tue: return "M"
        case .wed: return "M"
        case .thu: return "J"
        case .fri: return "V"
        case .sat: return "S"
        case .sun: return "D"
        }
    }

    private func notifToggle(
        icon: String,
        title: String,
        color: String,
        keyPath: WritableKeyPath<UserNotificationPreferences, Bool>
    ) -> some View {
        settingsRow(icon: icon, title: title, color: color) {
            Toggle("", isOn: Binding(
                get: { prefs.notification[keyPath: keyPath] },
                set: { val in prefs.updateNotification { $0[keyPath: keyPath] = val } }
            ))
            .labelsHidden()
            .tint(Color(hex: accentColor))
        }
    }

    // MARK: - Reusable Components

    private func settingsSection<Content: View>(
        title: String,
        icon: String,
        color: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                Text(title.uppercased())
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

            VStack(spacing: 0) {
                content()
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: color))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: color), lineWidth: 1)
                    )
            )
        }
    }

    private func settingsRow<Trailing: View>(
        icon: String,
        title: String,
        color: String,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: color).opacity(0.12))
                )

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
