//
//  NotificationSettingsView.swift
//  Meeshy
//
//  Notification settings view
//  iOS 16+ compatible
//

import SwiftUI

@MainActor
struct NotificationSettingsView: View {
    @State private var messagesEnabled: Bool = true
    @State private var soundEnabled: Bool = true
    @State private var badgeEnabled: Bool = true
    @State private var bannerEnabled: Bool = true

    var body: some View {
        List {
            Section {
                Toggle(isOn: $messagesEnabled) {
                    Label("Notifications de messages", systemImage: "message.fill")
                }

                Toggle(isOn: $soundEnabled) {
                    Label("Sons", systemImage: "speaker.wave.2.fill")
                }

                Toggle(isOn: $badgeEnabled) {
                    Label("Badges", systemImage: "app.badge.fill")
                }

                Toggle(isOn: $bannerEnabled) {
                    Label("Bannières", systemImage: "bell.badge.fill")
                }
            } header: {
                Text("Notifications push")
            }

            Section {
                NavigationLink {
                    Text("Notifications de groupe")
                        .navigationTitle("Groupes")
                } label: {
                    Label("Notifications de groupe", systemImage: "person.3.fill")
                }

                NavigationLink {
                    Text("Mentions")
                        .navigationTitle("Mentions")
                } label: {
                    Label("Mentions", systemImage: "at")
                }
            } header: {
                Text("Préférences")
            }
        }
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        NotificationSettingsView()
    }
}
