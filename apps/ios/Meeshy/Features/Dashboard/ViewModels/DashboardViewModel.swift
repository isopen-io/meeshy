//
//  DashboardViewModel.swift
//  Meeshy
//
//  Dashboard business logic
//

import Foundation
import SwiftUI

@MainActor
final class DashboardViewModel: ObservableObject {
    // MARK: - Published Properties
    
    @Published var messageCount: Int = 0
    @Published var conversationCount: Int = 0
    @Published var sharedLinksCount: Int = 0
    @Published var contactsCount: Int = 0
    
    @Published var sharedLinks: [SharedLink] = []
    @Published var recentContacts: [User] = []
    
    @Published var isLoading = false
    @Published var error: Error?
    
    // MARK: - Services

    // AuthenticationManager.shared used directly when needed
    
    // MARK: - Data Loading
    
    func loadData() async {
        isLoading = true
        
        // Load user stats
        await loadStats()
        
        // Load shared links (placeholder)
        sharedLinks = []
        
        // Load recent contacts (placeholder)
        recentContacts = []
        
        isLoading = false
    }
    
    func refresh() async {
        await loadData()
    }
    
    private func loadStats() async {
        // Placeholder - to be implemented with real API calls
        messageCount = 0
        conversationCount = 0
        sharedLinksCount = 0
        contactsCount = 0
    }
    
    // MARK: - Actions
    
    func createInviteLink() {
        // Placeholder
        print("📎 Creating invite link...")
    }
    
    func createConversation() {
        // Placeholder
        print("💬 Creating new conversation...")
    }
}
