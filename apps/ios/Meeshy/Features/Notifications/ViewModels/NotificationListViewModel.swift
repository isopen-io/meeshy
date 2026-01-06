//
//  NotificationListViewModel.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import Foundation
import SwiftUI

@MainActor
final class NotificationListViewModel: ObservableObject {
    @Published var notifications: [MeeshyNotification] = []
    @Published var unreadCount: Int = 0
    @Published var isLoading: Bool = false
    @Published var error: Error?

    @Published var settings: NotificationSettings = NotificationSettings()

    // MARK: - Initialization

    init() {
        loadSettings()
        Task {
            await fetchNotifications()
        }
    }

    // MARK: - Fetch Notifications

    func fetchNotifications() async {
        isLoading = true
        error = nil

        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/notifications") else {
                throw MeeshyError.network(.invalidRequest)
            }

            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw MeeshyError.network(.invalidResponse)
            }

            if httpResponse.statusCode == 200 {
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds

                let apiResponse = try decoder.decode(APIResponse<[MeeshyNotification]>.self, from: data)
                notifications = apiResponse.data ?? []
                updateUnreadCount()
                logger.info("Fetched \(notifications.count) notifications")
            } else if httpResponse.statusCode == 404 {
                // Notifications endpoint not implemented yet
                notifications = []
                logger.warn("Notifications endpoint not implemented")
            } else {
                throw MeeshyError.network(.serverError(httpResponse.statusCode))
            }

            isLoading = false
        } catch {
            logger.error("Error fetching notifications: \(error)")
            self.error = error
            notifications = []
            isLoading = false
        }
    }

    func refreshNotifications() async {
        await fetchNotifications()
    }

    // MARK: - Mark as Read

    func markAsRead(_ id: String) async {
        guard let index = notifications.firstIndex(where: { $0.id == id }) else { return }

        notifications[index].isRead = true
        updateUnreadCount()

        // TODO: Send to API
        await sendMarkAsReadToServer(id)
    }

    func markAllAsRead() async {
        for index in notifications.indices {
            notifications[index].isRead = true
        }
        updateUnreadCount()

        // TODO: Send to API
        await sendMarkAllAsReadToServer()
    }

    private func sendMarkAsReadToServer(_ id: String) async {
        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/notifications/\(id)/read") else {
                throw MeeshyError.network(.invalidRequest)
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let (_, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw MeeshyError.network(.invalidResponse)
            }

            if httpResponse.statusCode == 200 || httpResponse.statusCode == 204 {
                logger.info("Notification marked as read: \(id)")
            } else if httpResponse.statusCode == 404 {
                logger.warn("Mark as read endpoint not implemented")
            } else {
                throw MeeshyError.network(.serverError(httpResponse.statusCode))
            }
        } catch {
            logger.error("Error marking notification as read: \(error)")
        }
    }

    private func sendMarkAllAsReadToServer() async {
        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/notifications/read-all") else {
                throw MeeshyError.network(.invalidRequest)
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let (_, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw MeeshyError.network(.invalidResponse)
            }

            if httpResponse.statusCode == 200 || httpResponse.statusCode == 204 {
                logger.info("All notifications marked as read")
            } else if httpResponse.statusCode == 404 {
                logger.warn("Mark all as read endpoint not implemented")
            } else {
                throw MeeshyError.network(.serverError(httpResponse.statusCode))
            }
        } catch {
            logger.error("Error marking all notifications as read: \(error)")
        }
    }

    // MARK: - Delete

    func deleteNotification(_ id: String) async {
        notifications.removeAll { $0.id == id }
        updateUnreadCount()

        // TODO: Send to API
        await sendDeleteToServer(id)
    }

    private func sendDeleteToServer(_ id: String) async {
        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/notifications/\(id)") else {
                throw MeeshyError.network(.invalidRequest)
            }

            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let (_, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw MeeshyError.network(.invalidResponse)
            }

            if httpResponse.statusCode == 200 || httpResponse.statusCode == 204 {
                logger.info("Notification deleted: \(id)")
            } else if httpResponse.statusCode == 404 {
                logger.warn("Delete notification endpoint not implemented")
            } else {
                throw MeeshyError.network(.serverError(httpResponse.statusCode))
            }
        } catch {
            logger.error("Error deleting notification: \(error)")
            // Restore notification if delete failed
            await fetchNotifications()
        }
    }

    // MARK: - Unread Count

    private func updateUnreadCount() {
        unreadCount = notifications.filter { !$0.isRead }.count
        NotificationManager.shared.unreadCount = unreadCount

        Task {
            await NotificationManager.shared.updateBadgeCount(unreadCount)
        }
    }

    // MARK: - Grouped Notifications

    func groupedNotifications() -> [(NotificationSection, [MeeshyNotification])] {
        let grouped = Dictionary(grouping: notifications) { $0.sectionDate }
        return NotificationSection.allCases.compactMap { section in
            if let notifications = grouped[section], !notifications.isEmpty {
                return (section, notifications.sorted { $0.timestamp > $1.timestamp })
            }
            return nil
        }
    }

    // MARK: - Settings

    func loadSettings() {
        if let data = UserDefaults.standard.data(forKey: "notificationSettings"),
           let settings = try? JSONDecoder().decode(NotificationSettings.self, from: data) {
            self.settings = settings
        }
    }

    func saveSettings() {
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: "notificationSettings")
        }
    }

    func updateSetting<T>(_ keyPath: WritableKeyPath<NotificationSettings, T>, value: T) {
        settings[keyPath: keyPath] = value
        saveSettings()
    }

}
