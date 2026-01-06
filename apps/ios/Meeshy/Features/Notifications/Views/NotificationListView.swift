//
//  NotificationListView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct NotificationListView: View {
    @StateObject private var viewModel = NotificationListViewModel()
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ZStack {
                if viewModel.notifications.isEmpty && !viewModel.isLoading {
                    emptyStateView
                } else {
                    notificationListContent
                }

                if viewModel.isLoading {
                    ProgressView()
                }
            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 16) {
                        Button {
                            Task {
                                await viewModel.markAllAsRead()
                            }
                        } label: {
                            Image(systemName: "checkmark.circle")
                                .foregroundColor(.blue)
                        }
                        .disabled(viewModel.unreadCount == 0)

                        Button {
                            showSettings = true
                        } label: {
                            Image(systemName: "gear")
                                .foregroundColor(.blue)
                        }
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                NotificationSettingsView()
            }
            .refreshable {
                await viewModel.refreshNotifications()
            }
        }
        .badge(viewModel.unreadCount > 0 ? viewModel.unreadCount : 0)
    }

    // MARK: - Notification List Content

    private var notificationListContent: some View {
        List {
            ForEach(viewModel.groupedNotifications(), id: \.0) { section, notifications in
                Section {
                    ForEach(notifications) { notification in
                        NotificationRowView(notification: notification)
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    Task {
                                        await viewModel.deleteNotification(notification.id)
                                    }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: false) {
                                if !notification.isRead {
                                    Button {
                                        Task {
                                            await viewModel.markAsRead(notification.id)
                                        }
                                    } label: {
                                        Label("Mark as Read", systemImage: "checkmark")
                                    }
                                    .tint(.blue)
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture {
                                handleNotificationTap(notification)
                            }
                    }
                } header: {
                    Text(section.rawValue)
                        .font(.headline)
                        .foregroundColor(.primary)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "bell.slash.fill")
                .font(.system(size: 60))
                .foregroundColor(.gray)

            Text("All caught up!")
                .font(.title2)
                .fontWeight(.semibold)

            Text("You have no notifications")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Handle Notification Tap

    private func handleNotificationTap(_ notification: MeeshyNotification) {
        // Mark as read
        Task {
            await viewModel.markAsRead(notification.id)
        }

        // Navigate based on notification type
        if let conversationId = notification.actionData?["conversationId"] {
            NotificationCenter.default.post(
                name: .openConversation,
                object: nil,
                userInfo: ["conversationId": conversationId]
            )
        } else if let userId = notification.actionData?["userId"] {
            // Navigate to user profile or start call
            print("Navigate to user: \(userId)")
        }
    }
}

#Preview {
    NotificationListView()
}
