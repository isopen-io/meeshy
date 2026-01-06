//
//  AppState.swift
//  Meeshy
//
//  Global app state management
//  Uses @Observable for iOS 17+ with ObservableObject fallback for iOS 16
//

import Foundation
import Combine

// MARK: - App State

/// Global application state
/// iOS 16 compatible using ObservableObject
/// Swift 6 compliant with proper MainActor isolation
@MainActor
final class AppState: ObservableObject {
    // MARK: - Singleton

    static let shared = AppState()

    // MARK: - Published Properties

    @Published var isLoading = true
    @Published var isAuthenticated = false
    @Published var currentUser: User?
    @Published var conversations: [Conversation] = []
    @Published var activeConversationId: String?
    @Published var unreadCount: Int = 0
    @Published var isConnected = false
    @Published var networkStatus: NetworkStatus = .unknown

    // MARK: - Network Status

    enum NetworkStatus {
        case unknown
        case notReachable
        case reachableViaWiFi
        case reachableViaCellular
    }

    // MARK: - Initialization

    private init() {
        // Initialize with current values to avoid race conditions
        // Properties are already initialized with defaults above
    }

    // MARK: - Setup

    /// Start observing state changes from other managers
    /// Call this early in app lifecycle (e.g., in MeeshyApp.init())
    func startObserving() {
        // Prevent duplicate observer setup
        guard cancellables.isEmpty else {
            return
        }

        // Sync current values immediately to avoid race conditions
        self.isAuthenticated = AuthenticationManager.shared.isAuthenticated
        self.currentUser = AuthenticationManager.shared.currentUser
        self.isConnected = WebSocketService.shared.isConnected

        // Setup observers for future changes
        setupObservers()
    }

    private func setupObservers() {
        // Observe authentication state safely
        AuthenticationManager.shared.$isAuthenticated
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in
                self?.isAuthenticated = value
            }
            .store(in: &cancellables)

        AuthenticationManager.shared.$currentUser
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in
                self?.currentUser = value
            }
            .store(in: &cancellables)

        // Observe WebSocket connection
        WebSocketService.shared.$isConnected
            .receive(on: DispatchQueue.main)
            .sink { [weak self] value in
                self?.isConnected = value
            }
            .store(in: &cancellables)

        // Network monitoring - stub for now
        // TODO: Implement NetworkMonitor.shared.$status when NetworkMonitor is ready
    }
    
    // MARK: - Cancellables
    
    private var cancellables = Set<AnyCancellable>()

    // MARK: - State Management

    func checkAuthenticationState() async {
        await MainActor.run {
            self.isLoading = true
        }

        // AuthService.shared.checkAuthenticationState()

        // Wait a bit for auth check
        try? await Task.sleep(nanoseconds: 500_000_000)

        await MainActor.run {
            self.isLoading = false
        }
    }

    func updateConversations(_ conversations: [Conversation]) {
        self.conversations = conversations
        self.unreadCount = conversations.reduce(0) { $0 + $1.unreadCount }
    }

    func updateConversation(_ conversation: Conversation) {
        if let index = conversations.firstIndex(where: { $0.id == conversation.id }) {
            conversations[index] = conversation
        } else {
            conversations.insert(conversation, at: 0)
        }
        recalculateUnreadCount()
    }

    func removeConversation(id: String) {
        conversations.removeAll { $0.id == id }
        recalculateUnreadCount()
    }

    func setActiveConversation(id: String?) {
        activeConversationId = id
    }

    private func recalculateUnreadCount() {
        unreadCount = conversations.reduce(0) { $0 + $1.unreadCount }
    }

    // MARK: - Reset

    func reset() {
        isAuthenticated = false
        currentUser = nil
        conversations = []
        activeConversationId = nil
        unreadCount = 0
    }
}

// MARK: - iOS 17+ Observable Version (for future use)

#if compiler(>=5.9)
/// iOS 17+ version using @Observable macro
/// Enable this when dropping iOS 16 support
/*
@available(iOS 17.0, *)
@Observable
final class AppStateObservable {
    static let shared = AppStateObservable()

    var isLoading = true
    var isAuthenticated = false
    var currentUser: User?
    var conversations: [Conversation] = []
    var activeConversationId: String?
    var unreadCount: Int = 0
    var isConnected = false
    var networkStatus: NetworkStatus = .unknown

    enum NetworkStatus {
        case unknown
        case notReachable
        case reachableViaWiFi
        case reachableViaCellular
    }

    private init() {
        setupObservers()
    }

    // Same methods as above...
}
*/
#endif
