import Foundation
import SwiftUI
import UIKit

/// Focus Filter Manager
/// Integrates with iOS 16+ Focus Filters to customize app behavior during different Focus modes
/// Available on iOS 16.0+
@available(iOS 16.0, *)
@MainActor
class FocusFilterManager: ObservableObject {
    static let shared = FocusFilterManager()

    @Published var currentFilter: FocusFilter = .none
    @Published var isVIPOnlyMode: Bool = false
    @Published var hiddenConversationIds: Set<String> = []

    private init() {
        setupFocusFilter()
    }

    enum FocusFilter: String, Codable {
        case none
        case work
        case personal
        case sleep
        case driving
        case fitness
        case gaming
        case mindfulness
        case reading
        case custom

        var displayName: String {
            switch self {
            case .none: return "None"
            case .work: return "Work"
            case .personal: return "Personal"
            case .sleep: return "Sleep"
            case .driving: return "Driving"
            case .fitness: return "Fitness"
            case .gaming: return "Gaming"
            case .mindfulness: return "Mindfulness"
            case .reading: return "Reading"
            case .custom: return "Custom"
            }
        }
    }

    struct FocusConfiguration: Codable {
        var filter: FocusFilter
        var muteAllConversations: Bool
        var hideConversations: [String]
        var vipOnlyMode: Bool
        var allowedContactIds: [String]
        var autoReplyEnabled: Bool
        var autoReplyMessage: String?
    }

    // MARK: - Setup
    private func setupFocusFilter() {
        // Load saved filter configuration
        loadFilterConfiguration()

        // Monitor focus status changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(focusStatusChanged),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    @objc private func focusStatusChanged() {
        // Detect active Focus mode
        detectActiveFocus()
    }

    // MARK: - Focus Detection
    private func detectActiveFocus() {
        // iOS doesn't provide direct API to detect Focus mode
        // We can use heuristics or allow users to manually select
        // For now, we'll use user preferences
        loadFilterConfiguration()
    }

    // MARK: - Configuration Management
    func applyFocusFilter(_ filter: FocusFilter, configuration: FocusConfiguration) {
        currentFilter = filter
        isVIPOnlyMode = configuration.vipOnlyMode
        hiddenConversationIds = Set(configuration.hideConversations)

        // Save configuration
        saveFilterConfiguration(configuration)

        // Apply settings
        if configuration.muteAllConversations {
            muteAllConversations()
        }

        // Notify UI to update
        NotificationCenter.default.post(
            name: .focusFilterChanged,
            object: nil,
            userInfo: ["filter": filter.rawValue]
        )
    }

    func removeFocusFilter() {
        currentFilter = .none
        isVIPOnlyMode = false
        hiddenConversationIds.removeAll()
        unmuteAllConversations()

        NotificationCenter.default.post(
            name: .focusFilterChanged,
            object: nil,
            userInfo: ["filter": FocusFilter.none.rawValue]
        )
    }

    // MARK: - Filter Presets
    func getWorkFocusConfiguration() -> FocusConfiguration {
        FocusConfiguration(
            filter: .work,
            muteAllConversations: false,
            hideConversations: [],
            vipOnlyMode: false,
            allowedContactIds: [], // Add work contacts
            autoReplyEnabled: true,
            autoReplyMessage: "I'm currently focusing on work. I'll get back to you soon!"
        )
    }

    func getSleepFocusConfiguration() -> FocusConfiguration {
        FocusConfiguration(
            filter: .sleep,
            muteAllConversations: true,
            hideConversations: [],
            vipOnlyMode: true,
            allowedContactIds: [], // Emergency contacts only
            autoReplyEnabled: false,
            autoReplyMessage: nil
        )
    }

    func getDrivingFocusConfiguration() -> FocusConfiguration {
        FocusConfiguration(
            filter: .driving,
            muteAllConversations: true,
            hideConversations: [],
            vipOnlyMode: true,
            allowedContactIds: [],
            autoReplyEnabled: true,
            autoReplyMessage: "I'm driving right now. I'll respond when it's safe."
        )
    }

    func getPersonalFocusConfiguration() -> FocusConfiguration {
        FocusConfiguration(
            filter: .personal,
            muteAllConversations: false,
            hideConversations: [], // Hide work conversations
            vipOnlyMode: false,
            allowedContactIds: [],
            autoReplyEnabled: false,
            autoReplyMessage: nil
        )
    }

    // MARK: - Conversation Filtering
    func shouldShowConversation(_ conversationId: String, isVIP: Bool = false) -> Bool {
        // Always show if no filter active
        if currentFilter == .none {
            return true
        }

        // Check if explicitly hidden
        if hiddenConversationIds.contains(conversationId) {
            return false
        }

        // VIP only mode
        if isVIPOnlyMode {
            return isVIP
        }

        return true
    }

    func shouldAllowNotification(from contactId: String, isVIP: Bool = false) -> Bool {
        if currentFilter == .none {
            return true
        }

        if isVIPOnlyMode {
            return isVIP
        }

        // Check allowed contacts for current filter
        guard let config = loadFilterConfiguration() else {
            return true
        }

        return config.allowedContactIds.contains(contactId)
    }

    // MARK: - Auto Reply
    func getAutoReplyMessage() -> String? {
        guard let config = loadFilterConfiguration(),
              config.autoReplyEnabled else {
            return nil
        }
        return config.autoReplyMessage
    }

    // MARK: - Persistence
    private func saveFilterConfiguration(_ configuration: FocusConfiguration) {
        let defaults = UserDefaults.standard
        if let encoded = try? JSONEncoder().encode(configuration) {
            defaults.set(encoded, forKey: "focus_filter_configuration_\(configuration.filter.rawValue)")
            defaults.set(configuration.filter.rawValue, forKey: "current_focus_filter")
        }
    }

    private func loadFilterConfiguration() -> FocusConfiguration? {
        let defaults = UserDefaults.standard
        guard let filterRaw = defaults.string(forKey: "current_focus_filter"),
              let filter = FocusFilter(rawValue: filterRaw),
              let data = defaults.data(forKey: "focus_filter_configuration_\(filterRaw)"),
              let config = try? JSONDecoder().decode(FocusConfiguration.self, from: data) else {
            return nil
        }
        return config
    }

    // MARK: - Helper Methods
    private func muteAllConversations() {
        // Mute notifications for all conversations
        NotificationCenter.default.post(name: .muteAllConversations, object: nil)
    }

    private func unmuteAllConversations() {
        // Unmute notifications
        NotificationCenter.default.post(name: .unmuteAllConversations, object: nil)
    }
}

// MARK: - Notification Names
extension Notification.Name {
    static let focusFilterChanged = Notification.Name("focusFilterChanged")
    static let muteAllConversations = Notification.Name("muteAllConversations")
    static let unmuteAllConversations = Notification.Name("unmuteAllConversations")
}

// MARK: - Focus Filter UI
@available(iOS 16.0, *)
struct FocusFilterSettingsView: View {
    @StateObject private var manager = FocusFilterManager.shared
    @State private var selectedFilter: FocusFilterManager.FocusFilter = .none
    @State private var showingCustomConfiguration = false

    let availableFilters: [FocusFilterManager.FocusFilter] = [
        .work, .personal, .sleep, .driving, .fitness, .gaming, .mindfulness, .reading
    ]

    var body: some View {
        List {
            Section {
                HStack {
                    Image(systemName: "moon.circle.fill")
                        .foregroundColor(.purple)
                    VStack(alignment: .leading) {
                        Text("Focus Filters")
                            .font(.headline)
                        Text("Customize Meeshy for different Focus modes")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
            }

            Section("Active Filter") {
                if manager.currentFilter == .none {
                    Text("No active filter")
                        .foregroundColor(.secondary)
                } else {
                    HStack {
                        Text(manager.currentFilter.displayName)
                            .fontWeight(.semibold)
                        Spacer()
                        Button("Remove") {
                            manager.removeFocusFilter()
                        }
                        .foregroundColor(.red)
                    }
                }
            }

            Section("Quick Presets") {
                ForEach(availableFilters, id: \.self) { filter in
                    Button {
                        applyPreset(filter)
                    } label: {
                        HStack {
                            Image(systemName: iconForFilter(filter))
                                .foregroundColor(colorForFilter(filter))
                                .frame(width: 30)
                            Text(filter.displayName)
                            Spacer()
                            if manager.currentFilter == filter {
                                Image(systemName: "checkmark")
                                    .foregroundColor(.blue)
                            }
                        }
                    }
                    .foregroundColor(.primary)
                }
            }

            if manager.currentFilter != .none {
                Section("Current Settings") {
                    Toggle("VIP Only Mode", isOn: $manager.isVIPOnlyMode)
                    Text("Only show conversations from VIP contacts")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Focus Filters")
    }

    private func applyPreset(_ filter: FocusFilterManager.FocusFilter) {
        let config: FocusFilterManager.FocusConfiguration

        switch filter {
        case .work:
            config = manager.getWorkFocusConfiguration()
        case .sleep:
            config = manager.getSleepFocusConfiguration()
        case .driving:
            config = manager.getDrivingFocusConfiguration()
        case .personal:
            config = manager.getPersonalFocusConfiguration()
        default:
            config = FocusFilterManager.FocusConfiguration(
                filter: filter,
                muteAllConversations: false,
                hideConversations: [],
                vipOnlyMode: false,
                allowedContactIds: [],
                autoReplyEnabled: false,
                autoReplyMessage: nil
            )
        }

        manager.applyFocusFilter(filter, configuration: config)
    }

    private func iconForFilter(_ filter: FocusFilterManager.FocusFilter) -> String {
        switch filter {
        case .work: return "briefcase.fill"
        case .personal: return "person.fill"
        case .sleep: return "moon.fill"
        case .driving: return "car.fill"
        case .fitness: return "figure.run"
        case .gaming: return "gamecontroller.fill"
        case .mindfulness: return "brain.head.profile"
        case .reading: return "book.fill"
        case .custom: return "slider.horizontal.3"
        case .none: return "circle"
        }
    }

    private func colorForFilter(_ filter: FocusFilterManager.FocusFilter) -> Color {
        switch filter {
        case .work: return .blue
        case .personal: return .green
        case .sleep: return .purple
        case .driving: return .orange
        case .fitness: return .red
        case .gaming: return .pink
        case .mindfulness: return .mint
        case .reading: return .brown
        case .custom: return .gray
        case .none: return .gray
        }
    }
}
