import AppIntents
import UIKit

// MARK: - App Shortcuts
/// App Shortcuts are available on iOS 16+
/// These appear in Spotlight, Siri, and Shortcuts app
@available(iOS 16.0, *)
struct MeeshyAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: SendMessageIntent(),
            phrases: [
                "Send message on \(.applicationName)",
                "Send a message to \(\.$contact) on \(.applicationName)",
                "Message \(\.$contact) on \(.applicationName)"
            ],
            shortTitle: "Send Message",
            systemImageName: "message.fill"
        )

        AppShortcut(
            intent: CallContactIntent(),
            phrases: [
                "Call \(\.$contact) on \(.applicationName)",
                "Start call with \(\.$contact) on \(.applicationName)",
                "Video call \(\.$contact) on \(.applicationName)"
            ],
            shortTitle: "Call Contact",
            systemImageName: "phone.fill"
        )

        AppShortcut(
            intent: TranslateTextIntent(),
            phrases: [
                "Translate on \(.applicationName)",
                "Translate this to \(\.$targetLanguage) on \(.applicationName)",
                "Translate \(\.$text) on \(.applicationName)"
            ],
            shortTitle: "Translate",
            systemImageName: "translate"
        )

        AppShortcut(
            intent: OpenRecentConversationIntent(),
            phrases: [
                "Open recent conversation on \(.applicationName)",
                "Show recent messages on \(.applicationName)",
                "Open last chat on \(.applicationName)"
            ],
            shortTitle: "Recent Conversation",
            systemImageName: "clock.fill"
        )

        AppShortcut(
            intent: CheckNotificationsIntent(),
            phrases: [
                "Check notifications on \(.applicationName)",
                "Show unread messages on \(.applicationName)",
                "Any new messages on \(.applicationName)"
            ],
            shortTitle: "Check Notifications",
            systemImageName: "bell.fill"
        )
    }
}

// MARK: - Send Message Intent
@available(iOS 16.0, *)
struct SendMessageIntent: AppIntent {
    static var title: LocalizedStringResource = "Send Message"
    static var description = IntentDescription("Send a message to a contact")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Contact", requestValueDialog: "Who would you like to message?")
    var contact: ContactEntity?

    @Parameter(title: "Message", requestValueDialog: "What would you like to say?")
    var message: String?

    static var parameterSummary: some ParameterSummary {
        Summary("Send \(\.$message) to \(\.$contact)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        // Get contact
        let selectedContact: ContactEntity
        if let contact = contact {
            selectedContact = contact
        } else {
            // Show contact picker
            selectedContact = try await $contact.requestValue()
        }

        // Get message
        let messageText: String
        if let message = message, !message.isEmpty {
            messageText = message
        } else {
            messageText = try await $message.requestValue("What would you like to say?")
        }

        // Build deep link
        let urlString = "meeshy://send?contactId=\(selectedContact.id)&message=\(messageText.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")"

        return .result(opensIntent: OpenURLIntent(url: URL(string: urlString)!))
    }
}

// MARK: - Call Contact Intent
@available(iOS 16.0, *)
struct CallContactIntent: AppIntent {
    static var title: LocalizedStringResource = "Call Contact"
    static var description = IntentDescription("Start a call with a contact")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Contact", requestValueDialog: "Who would you like to call?")
    var contact: ContactEntity?

    @Parameter(title: "Call Type", default: .audio)
    var callType: CallType

    enum CallType: String, AppEnum {
        case audio
        case video

        static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Call Type")
        static var caseDisplayRepresentations: [CallType: DisplayRepresentation] = [
            .audio: "Audio Call",
            .video: "Video Call"
        ]
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Call \(\.$contact) with \(\.$callType)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        let selectedContact: ContactEntity
        if let contact = contact {
            selectedContact = contact
        } else {
            selectedContact = try await $contact.requestValue()
        }

        let type = callType == .video ? "video" : "audio"
        let urlString = "meeshy://call?contactId=\(selectedContact.id)&type=\(type)"

        return .result(opensIntent: OpenURLIntent(url: URL(string: urlString)!))
    }
}

// MARK: - Translate Text Intent
@available(iOS 16.0, *)
struct TranslateTextIntent: AppIntent {
    static var title: LocalizedStringResource = "Translate Text"
    static var description = IntentDescription("Translate text to another language")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Text", requestValueDialog: "What would you like to translate?")
    var text: String?

    @Parameter(title: "Target Language", default: .spanish)
    var targetLanguage: LanguageOption

    enum LanguageOption: String, AppEnum {
        case spanish = "es"
        case french = "fr"
        case german = "de"
        case italian = "it"
        case portuguese = "pt"
        case chinese = "zh"
        case japanese = "ja"
        case korean = "ko"
        case arabic = "ar"
        case russian = "ru"

        static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Language")
        static var caseDisplayRepresentations: [LanguageOption: DisplayRepresentation] = [
            .spanish: "Spanish",
            .french: "French",
            .german: "German",
            .italian: "Italian",
            .portuguese: "Portuguese",
            .chinese: "Chinese",
            .japanese: "Japanese",
            .korean: "Korean",
            .arabic: "Arabic",
            .russian: "Russian"
        ]
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Translate \(\.$text) to \(\.$targetLanguage)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        let textToTranslate: String
        if let text = text, !text.isEmpty {
            textToTranslate = text
        } else {
            textToTranslate = try await $text.requestValue("What would you like to translate?")
        }

        let urlString = "meeshy://translate?text=\(textToTranslate.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")&target=\(targetLanguage.rawValue)"

        return .result(opensIntent: OpenURLIntent(url: URL(string: urlString)!))
    }
}

// MARK: - Open Recent Conversation Intent
@available(iOS 16.0, *)
struct OpenRecentConversationIntent: AppIntent {
    static var title: LocalizedStringResource = "Open Recent Conversation"
    static var description = IntentDescription("Open your most recent conversation")
    static var openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        return .result(opensIntent: OpenURLIntent(url: URL(string: "meeshy://conversations/recent")!))
    }
}

// MARK: - Check Notifications Intent
@available(iOS 16.0, *)
struct CheckNotificationsIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Notifications"
    static var description = IntentDescription("Check for unread messages")
    static var openAppWhenRun: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        // Load unread count from shared container
        let unreadCount = getUnreadCount()

        if unreadCount == 0 {
            return .result(
                dialog: "You have no unread messages",
                view: NotificationCheckView(unreadCount: 0, recentMessages: [])
            )
        } else {
            let recentMessages = getRecentUnreadMessages()
            return .result(
                dialog: "You have \(unreadCount) unread message\(unreadCount == 1 ? "" : "s")",
                view: NotificationCheckView(unreadCount: unreadCount, recentMessages: recentMessages)
            )
        }
    }

    private func getUnreadCount() -> Int {
        guard let sharedDefaults = UserDefaults(suiteName: "group.me.meeshy.app") else {
            return 0
        }
        return sharedDefaults.integer(forKey: "unread_count")
    }

    private func getRecentUnreadMessages() -> [String] {
        guard let sharedDefaults = UserDefaults(suiteName: "group.me.meeshy.app"),
              let messages = sharedDefaults.stringArray(forKey: "recent_unread_messages") else {
            return []
        }
        return Array(messages.prefix(3))
    }
}

@available(iOS 16.0, *)
struct NotificationCheckView: View {
    let unreadCount: Int
    let recentMessages: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "bell.fill")
                    .foregroundColor(.blue)
                Text("\(unreadCount) Unread")
                    .font(.headline)
            }

            if !recentMessages.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(recentMessages, id: \.self) { message in
                        HStack {
                            Image(systemName: "message.fill")
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(message)
                                .font(.caption)
                                .lineLimit(1)
                        }
                    }
                }
            }
        }
        .padding()
    }
}

// MARK: - Contact Entity
@available(iOS 16.0, *)
struct ContactEntity: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Contact")
    static var defaultQuery = ContactQuery()

    var id: String
    var displayString: String
    var name: String
    var avatar: String?

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: "\(name)",
            subtitle: "",
            image: avatar != nil ? DisplayRepresentation.Image(url: URL(string: avatar!)!) : nil
        )
    }
}

@available(iOS 16.0, *)
struct ContactQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ContactEntity] {
        // Load contacts from shared container
        guard let sharedDefaults = UserDefaults(suiteName: "group.me.meeshy.app"),
              let data = sharedDefaults.data(forKey: "contacts"),
              let contacts = try? JSONDecoder().decode([ContactData].self, from: data) else {
            return []
        }

        return contacts
            .filter { identifiers.contains($0.id) }
            .map { ContactEntity(id: $0.id, displayString: $0.name, name: $0.name, avatar: $0.avatar) }
    }

    func suggestedEntities() async throws -> [ContactEntity] {
        // Return favorite/recent contacts
        guard let sharedDefaults = UserDefaults(suiteName: "group.me.meeshy.app"),
              let data = sharedDefaults.data(forKey: "favorite_contacts"),
              let contacts = try? JSONDecoder().decode([ContactData].self, from: data) else {
            return []
        }

        return contacts.map {
            ContactEntity(id: $0.id, displayString: $0.name, name: $0.name, avatar: $0.avatar)
        }
    }
}

struct ContactData: Codable {
    let id: String
    let name: String
    let avatar: String?
}

// MARK: - Legacy Intent Handler (for iOS 14-15 compatibility)
class IntentHandler: NSObject {
    // This will be extended for specific intent types if needed
}

// MARK: - Siri Tip Provider
/// Shows helpful tips in the app about available Siri shortcuts
@available(iOS 16.0, *)
struct SiriTipsView: View {
    let tips = [
        SiriTip(
            phrase: "Send message to John on Meeshy",
            icon: "message.fill",
            color: .blue
        ),
        SiriTip(
            phrase: "Call Sarah on Meeshy",
            icon: "phone.fill",
            color: .green
        ),
        SiriTip(
            phrase: "Translate this to Spanish on Meeshy",
            icon: "translate",
            color: .purple
        ),
        SiriTip(
            phrase: "Check notifications on Meeshy",
            icon: "bell.fill",
            color: .orange
        )
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Try asking Siri:")
                .font(.headline)

            ForEach(tips) { tip in
                HStack(spacing: 12) {
                    Image(systemName: tip.icon)
                        .foregroundColor(tip.color)
                        .frame(width: 30)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("\"\(tip.phrase)\"")
                            .font(.subheadline)
                            .fontWeight(.medium)
                    }

                    Spacer()
                }
                .padding()
                .background(Color.secondary.opacity(0.1))
                .cornerRadius(12)
            }
        }
        .padding()
    }
}

struct SiriTip: Identifiable {
    let id = UUID()
    let phrase: String
    let icon: String
    let color: Color
}