import SwiftUI
import MeeshySDK
import MeeshyUI

struct NotificationSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var prefs = UserPreferencesManager.shared

    private let accentColor = "08D9D6"

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
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Notifications")
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
        settingsSection(title: "Général", icon: "bell.fill", color: "FF6B6B") {
            notifToggle(icon: "bell.badge.fill", title: "Push", color: "FF6B6B",
                        keyPath: \.pushEnabled)

            notifToggle(icon: "envelope.fill", title: "Email", color: "45B7D1",
                        keyPath: \.emailEnabled)

            notifToggle(icon: "speaker.wave.2.fill", title: "Sons", color: "4ECDC4",
                        keyPath: \.soundEnabled)

            notifToggle(icon: "iphone.radiowaves.left.and.right", title: "Vibrations", color: "9B59B6",
                        keyPath: \.vibrationEnabled)

            notifToggle(icon: "app.badge.fill", title: "Badges", color: "F8B500",
                        keyPath: \.notificationBadgeEnabled)
        }
    }

    // MARK: - Messages

    private var messagesSection: some View {
        settingsSection(title: "Messages", icon: "message.fill", color: "4ECDC4") {
            notifToggle(icon: "bubble.left.fill", title: "Nouveaux messages", color: "4ECDC4",
                        keyPath: \.newMessageEnabled)

            notifToggle(icon: "phone.arrow.down.left", title: "Appels manqués", color: "FF6B6B",
                        keyPath: \.missedCallEnabled)

            notifToggle(icon: "mic.fill", title: "Messages vocaux", color: "9B59B6",
                        keyPath: \.voicemailEnabled)

            notifToggle(icon: "gear", title: "Système", color: "45B7D1",
                        keyPath: \.systemEnabled)
        }
    }

    // MARK: - Conversations

    private var conversationsSection: some View {
        settingsSection(title: "Conversations", icon: "bubble.left.and.bubble.right.fill", color: "9B59B6") {
            notifToggle(icon: "text.bubble.fill", title: "Conversations", color: "9B59B6",
                        keyPath: \.conversationEnabled)

            notifToggle(icon: "arrowshape.turn.up.left.fill", title: "Réponses", color: "4ECDC4",
                        keyPath: \.replyEnabled)

            notifToggle(icon: "at", title: "Mentions", color: "F8B500",
                        keyPath: \.mentionEnabled)

            notifToggle(icon: "face.smiling.fill", title: "Réactions", color: "FF6B6B",
                        keyPath: \.reactionEnabled)
        }
    }

    // MARK: - Contacts & Groups

    private var contactsSection: some View {
        settingsSection(title: "Contacts & Groupes", icon: "person.2.fill", color: "4ECDC4") {
            notifToggle(icon: "person.badge.plus", title: "Demandes de contact", color: "4ECDC4",
                        keyPath: \.contactRequestEnabled)

            notifToggle(icon: "person.3.fill", title: "Invitations groupe", color: "45B7D1",
                        keyPath: \.groupInviteEnabled)

            notifToggle(icon: "person.badge.shield.checkmark", title: "Membre rejoint", color: "4ADE80",
                        keyPath: \.memberJoinedEnabled)

            notifToggle(icon: "person.fill.xmark", title: "Membre parti", color: "FF6B6B",
                        keyPath: \.memberLeftEnabled)
        }
    }

    // MARK: - Feed Social

    private var feedSection: some View {
        settingsSection(title: "Feed Social", icon: "square.stack.fill", color: "F8B500") {
            notifToggle(icon: "heart.fill", title: "Likes posts", color: "FF6B6B",
                        keyPath: \.postLikeEnabled)

            notifToggle(icon: "text.bubble.fill", title: "Commentaires posts", color: "4ECDC4",
                        keyPath: \.postCommentEnabled)

            notifToggle(icon: "arrow.triangle.2.circlepath", title: "Reposts", color: "45B7D1",
                        keyPath: \.postRepostEnabled)

            notifToggle(icon: "sparkles", title: "Réactions stories", color: "F8B500",
                        keyPath: \.storyReactionEnabled)

            notifToggle(icon: "arrowshape.turn.up.left.2.fill", title: "Réponses commentaires", color: "9B59B6",
                        keyPath: \.commentReplyEnabled)

            notifToggle(icon: "hand.thumbsup.fill", title: "Likes commentaires", color: "FF6B6B",
                        keyPath: \.commentLikeEnabled)
        }
    }

    // MARK: - Display

    private var displaySection: some View {
        settingsSection(title: "Affichage", icon: "eye.fill", color: "45B7D1") {
            notifToggle(icon: "text.below.photo.fill", title: "Aperçu", color: "45B7D1",
                        keyPath: \.showPreview)

            notifToggle(icon: "person.text.rectangle", title: "Nom expéditeur", color: "9B59B6",
                        keyPath: \.showSenderName)

            notifToggle(icon: "rectangle.stack.fill", title: "Grouper notifications", color: "4ECDC4",
                        keyPath: \.groupNotifications)
        }
    }

    // MARK: - Do Not Disturb

    private var dndSection: some View {
        settingsSection(title: "Ne pas déranger", icon: "moon.fill", color: "9B59B6") {
            notifToggle(icon: "moon.zzz.fill", title: "Activer DnD", color: "9B59B6",
                        keyPath: \.dndEnabled)

            settingsRow(icon: "clock.fill", title: "Heure début", color: "45B7D1") {
                TextField("", text: Binding(
                    get: { prefs.notification.dndStartTime },
                    set: { val in prefs.updateNotification { $0.dndStartTime = val } }
                ))
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .multilineTextAlignment(.trailing)
                .frame(width: 60)
            }

            settingsRow(icon: "clock.badge.checkmark", title: "Heure fin", color: "4ECDC4") {
                TextField("", text: Binding(
                    get: { prefs.notification.dndEndTime },
                    set: { val in prefs.updateNotification { $0.dndEndTime = val } }
                ))
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .multilineTextAlignment(.trailing)
                .frame(width: 60)
            }

            settingsRow(icon: "calendar", title: "Jours", color: "F8B500") {
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
