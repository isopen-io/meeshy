//
//  AppLaunchCoordinator.swift
//  Meeshy
//
//  SIMPLIFIED app launch orchestration
//  Manages startup flow with minimal complexity
//

import Foundation
import SwiftUI

// MARK: - Launch State (SIMPLIFIED)

enum LaunchState: Equatable {
    case loading            // Splash screen - loading data
    case walkthrough        // First launch onboarding
    case login              // Need authentication
    case ready              // Show main content
}

// MARK: - App Launch Coordinator (SIMPLIFIED)

@MainActor
final class AppLaunchCoordinator: ObservableObject {

    // MARK: - Published State

    @Published private(set) var launchState: LaunchState = .loading
    @Published private(set) var loadingProgress: Double = 0

    // MARK: - Dependencies

    private let authManager = AuthenticationManager.shared
    private let dataManager = DataManager.shared
    private let firstLaunchManager = FirstLaunchManager.shared

    // MARK: - Singleton

    static let shared = AppLaunchCoordinator()

    private init() {}

    // MARK: - Launch Flow (SIMPLIFIED)

    /// Main entry point - determines which screen to show
    func startLaunchSequence() async {
        launchLogger.info("=== APP LAUNCH START ===")
        let startTime = CFAbsoluteTimeGetCurrent()

        // Step 1: Check first launch → Walkthrough
        if firstLaunchManager.isFirstLaunch {
            launchLogger.info("First launch → Walkthrough")
            launchState = .walkthrough
            return
        }

        // Step 2: Initialize auth
        loadingProgress = 0.2
        await authManager.initialize()

        // Step 3: Check authentication → Login
        guard authManager.isAuthenticated else {
            launchLogger.info("Not authenticated → Login")
            launchState = .login
            return
        }

        // Step 4: Load data from cache
        loadingProgress = 0.4

        await dataManager.initialize()

        // Step 5: If cache is empty, fetch from API before showing UI
        // This ensures categories, conversations, and communities are available on first launch
        loadingProgress = 0.5
        var conversations = dataManager.getConversations()
        var categories = dataManager.categories
        var communities = dataManager.communities

        // CRITICAL FIX: TOUJOURS charger depuis l'API pour avoir les données fraîches
        // Le cache est utilisé pour l'affichage instantané, mais on refresh toujours
        let needsApiFetch = conversations.isEmpty || categories.isEmpty || communities.isEmpty
        let cachedConversationCount = conversations.count

        if needsApiFetch {
            launchLogger.info("Cache empty, fetching from API...")
        } else {
            launchLogger.info("Cache has \(cachedConversationCount) conversations, refreshing from API...")
        }

        do {
            // Fetch categories, conversations, and communities in parallel
            async let categoriesTask = CategoryService.shared.fetchCategories(forceRefresh: true)
            async let conversationsTask = ConversationService.shared.forceRefreshAllConversations()
            async let communitiesTask = CommunityService.shared.fetchCommunities()

            let (fetchedCategories, fetchedConversations, fetchedCommunities) = try await (
                categoriesTask,
                conversationsTask,
                communitiesTask
            )

            // Update DataManager with API data
            if !fetchedCategories.isEmpty {
                await dataManager.updateCategories(fetchedCategories)
                categories = fetchedCategories
            }
            if !fetchedConversations.isEmpty {
                await dataManager.updateConversations(fetchedConversations)
                conversations = fetchedConversations
            }
            if !fetchedCommunities.isEmpty {
                await dataManager.updateCommunities(fetchedCommunities)
                communities = fetchedCommunities
            }

            launchLogger.info("API refresh: \(fetchedConversations.count) conversations (was \(cachedConversationCount)), \(fetchedCategories.count) categories, \(fetchedCommunities.count) communities")
        } catch {
            launchLogger.warn("API fetch failed, continuing with cached data: \(error.localizedDescription)")
        }

        loadingProgress = 0.7
        await dataManager.structureConversations()

        // Step 6: Populate memory cache
        loadingProgress = 0.9
        if !conversations.isEmpty {
            await AppCache.conversations.setInitialPage(
                key: "all",
                items: conversations,
                cursor: nil,
                hasMore: true,
                totalCount: conversations.count,
                ttl: .infinity
            )
        }

        loadingProgress = 1.0

        let elapsed = (CFAbsoluteTimeGetCurrent() - startTime) * 1000
        launchLogger.info("=== LAUNCH COMPLETE in \(String(format: "%.0f", elapsed))ms ===")

        // Ready!
        launchState = .ready

        // Background tasks (non-blocking)
        Task.detached(priority: .utility) {
            await self.performBackgroundTasks()
        }
    }

    // MARK: - Background Tasks

    private func performBackgroundTasks() async {
        // Connect WebSocket first (important for real-time updates)
        if await MainActor.run(body: { authManager.isAuthenticated }) {
            await WebSocketService.shared.connect()
        }

        // Small delay to let UI settle before refreshing data
        try? await Task.sleep(nanoseconds: 2_000_000_000) // 2 seconds

        // Background refresh - silently update data
        do {
            async let categoriesTask = CategoryService.shared.fetchCategories(forceRefresh: true)
            async let conversationsTask = ConversationService.shared.forceRefreshAllConversations()
            async let communitiesTask = CommunityService.shared.fetchCommunities()

            let (categories, conversations, communities) = try await (
                categoriesTask,
                conversationsTask,
                communitiesTask
            )

            await dataManager.updateCategories(categories)
            await dataManager.updateConversations(conversations)
            await dataManager.updateCommunities(communities)
            await dataManager.structureConversations()

            // Update memory cache
            await AppCache.conversations.setInitialPage(
                key: "all",
                items: conversations,
                cursor: nil,
                hasMore: true,
                totalCount: conversations.count,
                ttl: .infinity
            )

            launchLogger.info("Background refresh: \(conversations.count) conversations, \(categories.count) categories, \(communities.count) communities")
        } catch {
            launchLogger.warn("Background refresh failed: \(error.localizedDescription)")
        }
    }

    // MARK: - State Transitions

    /// Called when walkthrough is completed
    func walkthroughCompleted() {
        firstLaunchManager.markWalkthroughComplete()
        launchState = .login
    }

    /// Called when user logs in
    func userDidLogin() async {
        launchState = .loading
        await startLaunchSequence()
    }

    /// Called when user logs out
    func userDidLogout() {
        launchState = .login
    }
}

// MARK: - Logger

private let launchLogger = PinoLogger(name: "AppLaunchCoordinator")
