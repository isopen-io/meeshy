import SwiftUI
import Intents

// MARK: - Siri & Shortcuts View
struct SiriShortcutsView: View {
    @StateObject private var settingsManager = SettingsManager.shared
    @State private var shortcuts = [
        SiriShortcut(phrase: "Send a message", isEnabled: true),
        SiriShortcut(phrase: "Start a video call", isEnabled: true),
        SiriShortcut(phrase: "Check messages", isEnabled: false)
    ]

    var body: some View {
        List {
            Section {
                Toggle("Enable Siri Shortcuts", isOn: $settingsManager.siriShortcutsEnabled)
            } footer: {
                Text("Use Siri to quickly perform actions in Meeshy")
            }

            if settingsManager.siriShortcutsEnabled {
                Section("Available Shortcuts") {
                    ForEach($shortcuts) { $shortcut in
                        Toggle(shortcut.phrase, isOn: $shortcut.isEnabled)
                    }
                }

                Section {
                    Button {
                        addToSiri()
                    } label: {
                        Label("Add Custom Shortcut", systemImage: "plus.circle.fill")
                    }
                }

                Section {
                    Link(destination: URL(string: UIApplication.openSettingsURLString)!) {
                        Label("Manage in Settings", systemImage: "gear")
                    }
                }
            }
        }
        .navigationTitle("Siri & Shortcuts")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func addToSiri() {
        // Add shortcut to Siri
        // Would use INUIAddVoiceShortcutViewController in production
    }
}

struct SiriShortcut: Identifiable {
    let id = UUID()
    let phrase: String
    var isEnabled: Bool
}

// MARK: - Widget Settings View
struct WidgetSettingsView: View {
    @StateObject private var settingsManager = SettingsManager.shared

    var body: some View {
        List {
            Section {
                Toggle("Enable Widgets", isOn: $settingsManager.widgetEnabled)
            } footer: {
                Text("Show Meeshy widgets on your home screen and lock screen")
            }

            if settingsManager.widgetEnabled {
                Section("Conversations Widget") {
                    Stepper("Show \(settingsManager.widgetConversationCount) conversations",
                            value: $settingsManager.widgetConversationCount,
                            in: 1...8)

                    Toggle("Show Message Preview", isOn: .constant(true))
                    Toggle("Show Unread Count", isOn: .constant(true))
                }

                Section {
                    Toggle("Unread Count", isOn: .constant(true))
                    Toggle("Recent Message", isOn: .constant(false))
                } header: {
                    Text("Lock Screen Widgets")
                } footer: {
                    Text("Choose which widgets appear on your lock screen")
                }

                Section {
                    Link(destination: URL(string: "meeshy://widget-settings")!) {
                        Label("Edit Widgets", systemImage: "square.stack.3d.up.fill")
                    }
                }
            }
        }
        .navigationTitle("Widgets")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Apple Watch Settings View
struct AppleWatchSettingsView: View {
    @StateObject private var settingsManager = SettingsManager.shared
    @State private var isPaired = true

    var body: some View {
        List {
            if isPaired {
                Section {
                    Toggle("Sync with Apple Watch", isOn: $settingsManager.watchSyncEnabled)
                } footer: {
                    Text("Sync conversations and notifications with your Apple Watch")
                }

                if settingsManager.watchSyncEnabled {
                    Section("Notifications") {
                        Toggle("Mirror iPhone", isOn: .constant(true))
                        Toggle("Custom Watch Alerts", isOn: .constant(false))
                    }

                    Section("Sync") {
                        Toggle("Recent Conversations", isOn: .constant(true))
                        Toggle("Favorites", isOn: .constant(true))

                        Stepper("Sync last \(5) conversations",
                                value: .constant(5),
                                in: 1...10)
                    }

                    Section {
                        NavigationLink(destination: WatchQuickRepliesView()) {
                            Text("Manage Quick Replies")
                        }
                    } header: {
                        Text("Quick Replies")
                    } footer: {
                        Text("Set up quick reply messages for Apple Watch")
                    }
                }
            } else {
                Section {
                    VStack(spacing: 16) {
                        Image(systemName: "applewatch.slash")
                            .font(.system(size: 60))
                            .foregroundStyle(.gray)

                        Text("Apple Watch Not Paired")
                            .font(.headline)

                        Text("Pair your Apple Watch to sync Meeshy conversations and notifications")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)

                        Button {
                            openWatchApp()
                        } label: {
                            Text("Open Watch App")
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(Color.blue)
                                .foregroundStyle(.white)
                                .cornerRadius(10)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                }
            }
        }
        .navigationTitle("Apple Watch")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func openWatchApp() {
        if let url = URL(string: "itms-watch://") {
            UIApplication.shared.open(url)
        }
    }
}

// MARK: - Watch Quick Replies View
struct WatchQuickRepliesView: View {
    @State private var quickReplies = [
        "OK", "Thanks", "On my way", "Can't talk now",
        "Call you later", "Yes", "No", "Maybe"
    ]
    @State private var showingAddReply = false
    @State private var newReply = ""

    var body: some View {
        List {
            ForEach(quickReplies, id: \.self) { reply in
                Text(reply)
            }
            .onDelete { indexSet in
                quickReplies.remove(atOffsets: indexSet)
            }
            .onMove { source, destination in
                quickReplies.move(fromOffsets: source, toOffset: destination)
            }

            Button {
                showingAddReply = true
            } label: {
                Label("Add Reply", systemImage: "plus.circle.fill")
            }
        }
        .navigationTitle("Quick Replies")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            EditButton()
        }
        .alert("Add Quick Reply", isPresented: $showingAddReply) {
            TextField("Reply message", text: $newReply)
            Button("Cancel", role: .cancel) { }
            Button("Add") {
                if !newReply.isEmpty {
                    quickReplies.append(newReply)
                    newReply = ""
                }
            }
        }
    }
}

// MARK: - Handoff Settings (in main settings, but iOS exclusive)
struct HandoffSettingsView: View {
    @StateObject private var settingsManager = SettingsManager.shared

    var body: some View {
        List {
            Section {
                Toggle("Handoff", isOn: $settingsManager.handoffEnabled)
            } footer: {
                Text("Continue conversations seamlessly across your Apple devices")
            }

            if settingsManager.handoffEnabled {
                Section {
                    Label("iPhone", systemImage: "iphone")
                    Label("iPad", systemImage: "ipad")
                    Label("Mac", systemImage: "laptopcomputer")
                } header: {
                    Text("Supported Devices")
                } footer: {
                    Text("Handoff works with devices signed in to the same Apple ID")
                }
            }
        }
        .navigationTitle("Handoff")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("Siri") {
    NavigationStack {
        SiriShortcutsView()
    }
}

#Preview("Widgets") {
    NavigationStack {
        WidgetSettingsView()
    }
}

#Preview("Watch") {
    NavigationStack {
        AppleWatchSettingsView()
    }
}