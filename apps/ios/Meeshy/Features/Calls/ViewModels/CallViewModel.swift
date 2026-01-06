//
//  CallViewModel.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import Foundation
import SwiftUI

@MainActor
final class CallViewModel: ObservableObject {
    @Published var callHistory: [CallRecord] = []
    @Published var isLoading: Bool = false
    @Published var error: Error?
    @Published var selectedTab: CallTab = .all

    private let callService = CallService.shared

    enum CallTab: String, CaseIterable {
        case all = "All"
        case missed = "Missed"
    }

    // MARK: - Initialization

    init() {
        Task {
            await fetchCallHistory()
        }
    }

    // MARK: - Fetch Call History

    func fetchCallHistory() async {
        isLoading = true
        error = nil

        do {
            // Fetch from API
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/calls/history") else {
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

                let apiResponse = try decoder.decode(APIResponse<[CallRecord]>.self, from: data)

                if let records = apiResponse.data {
                    callHistory = records
                    callLogger.info("Fetched \(records.count) call records from API")
                } else {
                    // No call history yet
                    callHistory = []
                    callLogger.info("No call history available")
                }
            } else if httpResponse.statusCode == 404 {
                // No call history endpoint yet, fallback to empty
                callHistory = []
                callLogger.warn("Call history endpoint not implemented, using empty list")
            } else {
                throw MeeshyError.network(.invalidResponse)
            }

            isLoading = false
        } catch let meeshyError as MeeshyError {
            callLogger.error("API Error fetching call history: \(meeshyError.localizedDescription)")
            self.error = meeshyError
            // Fallback to empty list if API is not available
            callHistory = []
            isLoading = false
        } catch {
            callLogger.error("Error fetching call history: \(error)")
            self.error = error
            // Fallback to empty list on error
            callHistory = []
            isLoading = false
        }
    }

    func refreshCallHistory() async {
        await fetchCallHistory()
    }

    // MARK: - Filtered Calls

    func filteredCalls() -> [CallRecord] {
        switch selectedTab {
        case .all:
            return callHistory
        case .missed:
            return callHistory.filter { $0.call.direction == .missed }
        }
    }

    // MARK: - Initiate Call

    func initiateCall(conversationId: String, type: Call.CallType, recipientName: String? = nil, recipientAvatar: String? = nil) async {
        await callService.initiateCall(
            conversationId: conversationId,
            type: type,
            recipientName: recipientName,
            recipientAvatar: recipientAvatar
        )
    }

    func callBack(_ record: CallRecord) async {
        await callService.initiateCall(
            conversationId: record.call.conversationId,
            type: record.call.type,
            recipientName: record.call.userName,
            recipientAvatar: record.call.userAvatar
        )
    }

    // MARK: - Delete Call Record

    func deleteCallRecord(_ id: String) async {
        // Optimistically remove from UI
        callHistory.removeAll { $0.id == id }

        // Send delete to server
        await sendDeleteToServer(id)
    }

    private func sendDeleteToServer(_ id: String) async {
        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/calls/history/\(id)") else {
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
                callLogger.info("Call record deleted successfully: \(id)")
            } else if httpResponse.statusCode == 404 {
                callLogger.warn("Call history deletion endpoint not implemented")
            } else {
                throw MeeshyError.network(.invalidResponse)
            }
        } catch {
            callLogger.error("Error deleting call record: \(error)")
            // Refresh to restore state if delete failed
            await fetchCallHistory()
        }
    }

    // MARK: - Toggle Favorite

    func toggleFavorite(_ id: String) async {
        guard let index = callHistory.firstIndex(where: { $0.id == id }) else { return }

        // Optimistically toggle in UI
        callHistory[index].isFavorite.toggle()

        // Send update to server
        await sendFavoriteToServer(id, isFavorite: callHistory[index].isFavorite)
    }

    private func sendFavoriteToServer(_ id: String, isFavorite: Bool) async {
        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/calls/history/\(id)/favorite") else {
                throw MeeshyError.network(.invalidRequest)
            }

            var request = URLRequest(url: url)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = AuthenticationManager.shared.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let body: [String: Any] = ["isFavorite": isFavorite]
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)

            let (_, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw MeeshyError.network(.invalidResponse)
            }

            if httpResponse.statusCode == 200 {
                callLogger.info("Call favorite status updated: \(id) to \(isFavorite)")
            } else if httpResponse.statusCode == 404 {
                callLogger.warn("Call favorite endpoint not implemented")
            } else {
                throw MeeshyError.network(.invalidResponse)
            }
        } catch {
            callLogger.error("Error updating favorite status: \(error)")
            // Revert the change if API call failed
            if let index = callHistory.firstIndex(where: { $0.id == id }) {
                callHistory[index].isFavorite.toggle()
            }
        }
    }

}
