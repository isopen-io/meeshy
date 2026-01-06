//
//  DashboardView.swift
//  Meeshy
//
//  User dashboard with analytics, links, and contacts
//  iOS 16+
//

import SwiftUI

// ============================================================
// 📊 TAB DASHBOARD - VUE TABLEAU DE BORD
// Cette vue est affichée dans le tab "Dashboard" de MainTabView
// Elle affiche les statistiques, analytiques et métriques de l'utilisateur
// ============================================================

struct DashboardView: View {
    @StateObject private var viewModel = DashboardViewModel()
    
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // User Stats Overview
                    statsSection
                    
                    // Quick Actions
                    quickActionsSection
                    
                    // Shared Links
                    sharedLinksSection
                    
                    // Recent Contacts
                    recentContactsSection
                }
                .padding(.vertical)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Dashboard")
            .navigationBarTitleDisplayMode(.large)
            .refreshable {
                await viewModel.refresh()
            }
            .task {
                await viewModel.loadData()
            }
        }
    }
    
    // MARK: - Stats Section
    
    private var statsSection: some View {
        VStack(spacing: 16) {
            Text("Statistiques")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
            
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                StatCard(
                    title: "Messages",
                    value: "\(viewModel.messageCount)",
                    icon: "message.fill",
                    color: .blue
                )
                
                StatCard(
                    title: "Conversations",
                    value: "\(viewModel.conversationCount)",
                    icon: "bubble.left.and.bubble.right.fill",
                    color: .green
                )
                
                StatCard(
                    title: "Liens Partagés",
                    value: "\(viewModel.sharedLinksCount)",
                    icon: "link",
                    color: .purple
                )
                
                StatCard(
                    title: "Contacts",
                    value: "\(viewModel.contactsCount)",
                    icon: "person.2.fill",
                    color: .orange
                )
            }
            .padding(.horizontal)
        }
    }
    
    // MARK: - Quick Actions
    
    private var quickActionsSection: some View {
        VStack(spacing: 16) {
            Text("Actions Rapides")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
            
            VStack(spacing: 12) {
                QuickActionButton(
                    title: "Créer un Lien d'Invitation",
                    icon: "link.badge.plus",
                    color: .blue
                ) {
                    viewModel.createInviteLink()
                }
                
                QuickActionButton(
                    title: "Nouvelle Conversation",
                    icon: "plus.message",
                    color: .green
                ) {
                    viewModel.createConversation()
                }
            }
            .padding(.horizontal)
        }
    }
    
    // MARK: - Shared Links
    
    private var sharedLinksSection: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Liens Partagés")
                    .font(.headline)
                Spacer()
                NavigationLink("Voir tout") {
                    SharedLinksListView()
                }
                .font(.subheadline)
            }
            .padding(.horizontal)
            
            if viewModel.sharedLinks.isEmpty {
                EmptyStateView(
                    icon: "link.slash",
                    title: "Aucun lien partagé",
                    message: "Créez votre premier lien d'invitation"
                )
                .padding()
            } else {
                ForEach(viewModel.sharedLinks.prefix(3)) { link in
                    SharedLinkRow(link: link)
                }
                .padding(.horizontal)
            }
        }
    }
    
    // MARK: - Recent Contacts
    
    private var recentContactsSection: some View {
        VStack(spacing: 16) {
            HStack {
                Text("Contacts Récents")
                    .font(.headline)
                Spacer()
                NavigationLink("Voir tout") {
                    ContactsListView()
                }
                .font(.subheadline)
            }
            .padding(.horizontal)
            
            if viewModel.recentContacts.isEmpty {
                EmptyStateView(
                    icon: "person.slash",
                    title: "Aucun contact",
                    message: "Commencez à discuter pour voir vos contacts"
                )
                .padding()
            } else {
                ForEach(viewModel.recentContacts.prefix(5)) { contact in
                    ContactRow(contact: contact)
                }
                .padding(.horizontal)
            }
        }
    }
}

// MARK: - Supporting Views

struct StatCard: View {
    let title: String
    let value: String
    let icon: String
    let color: Color
    
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 30))
                .foregroundColor(color)
            
            Text(value)
                .font(.system(size: 24, weight: .bold))
            
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(12)
    }
}

struct QuickActionButton: View {
    let title: String
    let icon: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(color)
                    .frame(width: 40)
                
                Text(title)
                    .font(.body)
                    .foregroundColor(.primary)
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            .padding()
            .background(Color(.secondarySystemGroupedBackground))
            .cornerRadius(10)
        }
    }
}

struct EmptyStateView: View {
    let icon: String
    let title: String
    let message: String
    
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundColor(.secondary)
            
            Text(title)
                .font(.headline)
            
            Text(message)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

// MARK: - Placeholder Views (to be implemented)

struct SharedLinkRow: View {
    let link: SharedLink
    
    var body: some View {
        HStack {
            VStack(alignment: .leading) {
                Text(link.name)
                    .font(.subheadline)
                Text("\(link.clicks) clics")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            Spacer()
            Button(action: {}) {
                Image(systemName: "square.and.arrow.up")
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(10)
    }
}

struct ContactRow: View {
    let contact: User
    
    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color.gray.opacity(0.3))
                .frame(width: 40, height: 40)
                .overlay(
                    Text(contact.initials)
                        .font(.caption)
                        .foregroundColor(.white)
                )
            
            VStack(alignment: .leading) {
                Text(contact.displayNameOrUsername)
                    .font(.subheadline)
                Text("@\(contact.username)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(10)
    }
}

// MARK: - Placeholder List Views

struct SharedLinksListView: View {
    var body: some View {
        Text("Liste complète des liens partagés")
            .navigationTitle("Liens Partagés")
    }
}

struct ContactsListView: View {
    var body: some View {
        Text("Liste complète des contacts")
            .navigationTitle("Contacts")
    }
}

// MARK: - Preview

#Preview {
    DashboardView()
}
