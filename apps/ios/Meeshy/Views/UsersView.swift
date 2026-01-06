import SwiftUI

struct UsersView: View {
    @StateObject private var viewModel = UsersViewModel()
    @State private var searchText = ""
    
    var filteredUsers: [UserDisplayData] {
        if searchText.isEmpty {
            return viewModel.users
        } else {
            return viewModel.users.filter {
                $0.username.localizedCaseInsensitiveContains(searchText) ||
                $0.fullName.localizedCaseInsensitiveContains(searchText) ||
                $0.firstName.localizedCaseInsensitiveContains(searchText) ||
                $0.lastName.localizedCaseInsensitiveContains(searchText)
            }
        }
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                // Users List
                if viewModel.isLoading && viewModel.users.isEmpty {
                    VStack {
                        Spacer()
                        ProgressView("Chargement des utilisateurs...")
                        Spacer()
                    }
                } else {
                    List {
                        ForEach(filteredUsers) { user in
                            UserRow(user: user)
                        }
                    }
                    .listStyle(.insetGrouped)
                }
                
                // Search Bar at Bottom
                VStack(spacing: 0) {
                    Divider()
                    
                    HStack(spacing: 12) {
                        Image(systemName: "magnifyingglass")
                            .foregroundColor(.secondary)
                        
                        TextField("Rechercher par nom, username...", text: $searchText)
                            .textFieldStyle(.plain)
                            .autocapitalization(.none)
                        
                        if !searchText.isEmpty {
                            Button(action: {
                                searchText = ""
                            }) {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding()
                    .background(Color(.systemBackground))
                }
            }
            .navigationTitle("Utilisateurs")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: {
                        Task {
                            await viewModel.loadUsers()
                        }
                    }) {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            .refreshable {
                await viewModel.loadUsers()
            }
            .task {
                if viewModel.users.isEmpty {
                    await viewModel.loadUsers()
                }
            }
        }
    }
}

// MARK: - User Row
struct UserRow: View {
    let user: UserDisplayData
    
    var body: some View {
        HStack(spacing: 14) {
            // Avatar
            ZStack {
                Circle()
                    .fill(user.isOnline ? Color.green.opacity(0.15) : Color.gray.opacity(0.15))
                    .frame(width: 50, height: 50)
                
                Text(user.firstName.prefix(1).uppercased())
                    .font(.title3)
                    .fontWeight(.medium)
                    .foregroundColor(user.isOnline ? .green : .gray)
                
                // Online indicator
                if user.isOnline {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 12, height: 12)
                        .overlay(
                            Circle()
                                .stroke(Color.white, lineWidth: 2)
                        )
                        .offset(x: 18, y: 18)
                }
            }
            
            VStack(alignment: .leading, spacing: 4) {
                // Username and Display Name
                HStack(spacing: 6) {
                    Text("@\(user.username)")
                        .font(.headline)
                    
                    if user.isAnonymous {
                        Image(systemName: "person.fill.questionmark")
                            .font(.caption)
                            .foregroundColor(.orange)
                    }
                }
                
                Text(user.fullName)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                
                // Dates
                HStack(spacing: 12) {
                    Text(user.createdAt, style: .date)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    Text("•")
                        .foregroundColor(.secondary)
                    
                    if user.isOnline {
                        Text("En ligne")
                            .font(.caption2)
                            .foregroundColor(.green)
                    } else {
                        Text("Vu \(user.lastActiveAt, style: .relative)")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
            }
            
            Spacer()
        }
        .padding(.vertical, 6)
    }
}

// MARK: - User Display Data
struct UserDisplayData: Identifiable {
    let id: String
    let username: String
    let firstName: String
    let lastName: String
    let fullName: String
    let isOnline: Bool
    let lastActiveAt: Date
    let createdAt: Date
    let isAnonymous: Bool
    
    init(from user: User) {
        self.id = user.id
        self.username = user.username
        self.firstName = user.firstName
        self.lastName = user.lastName
        self.fullName = user.fullName
        self.isOnline = user.isOnline
        self.lastActiveAt = user.lastActiveAt!
        self.createdAt = user.createdAt
        self.isAnonymous = user.isAnonymous ?? false
    }
    
    // Mock initializer
    init(id: String, username: String, firstName: String, lastName: String, 
         isOnline: Bool, lastActiveAt: Date, createdAt: Date, isAnonymous: Bool = false) {
        self.id = id
        self.username = username
        self.firstName = firstName
        self.lastName = lastName
        self.fullName = "\(firstName) \(lastName)"
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
        self.createdAt = createdAt
        self.isAnonymous = isAnonymous
    }
}

// MARK: - Users ViewModel
@MainActor
class UsersViewModel: ObservableObject {
    @Published var users: [UserDisplayData] = []
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    func loadUsers() async {
        isLoading = true
        errorMessage = nil
        
        // Try to load from API
        // For now, use mock data
        try? await Task.sleep(nanoseconds: 500_000_000) // Simulate network delay
        
        users = mockUsers
        isLoading = false
    }
}

// MARK: - Mock Users
private let mockUsers: [UserDisplayData] = [
    UserDisplayData(id: "1", username: "sophie_martin", firstName: "Sophie", lastName: "Martin", 
                    isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 30)),
    UserDisplayData(id: "2", username: "jean_dupont", firstName: "Jean", lastName: "Dupont", 
                    isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 45)),
    UserDisplayData(id: "3", username: "marie_claire", firstName: "Marie", lastName: "Claire", 
                    isOnline: false, lastActiveAt: Date().addingTimeInterval(-3600), createdAt: Date().addingTimeInterval(-86400 * 60)),
    UserDisplayData(id: "4", username: "alex_smith", firstName: "Alex", lastName: "Smith", 
                    isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 20)),
    UserDisplayData(id: "5", username: "emma_wilson", firstName: "Emma", lastName: "Wilson", 
                    isOnline: false, lastActiveAt: Date().addingTimeInterval(-7200), createdAt: Date().addingTimeInterval(-86400 * 90)),
    UserDisplayData(id: "6", username: "lucas_bernard", firstName: "Lucas", lastName: "Bernard", 
                    isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 15)),
    UserDisplayData(id: "7", username: "chloe_petit", firstName: "Chloé", lastName: "Petit", 
                    isOnline: false, lastActiveAt: Date().addingTimeInterval(-14400), createdAt: Date().addingTimeInterval(-86400 * 75)),
    UserDisplayData(id: "8", username: "thomas_garcia", firstName: "Thomas", lastName: "Garcia", 
                    isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 10)),
    UserDisplayData(id: "9", username: "laura_rodriguez", firstName: "Laura", lastName: "Rodriguez", 
                    isOnline: false, lastActiveAt: Date().addingTimeInterval(-21600), createdAt: Date().addingTimeInterval(-86400 * 120)),
    UserDisplayData(id: "10", username: "nathan_brown", firstName: "Nathan", lastName: "Brown", 
                     isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 5)),
    UserDisplayData(id: "11", username: "lisa_anderson", firstName: "Lisa", lastName: "Anderson", 
                     isOnline: false, lastActiveAt: Date().addingTimeInterval(-1800), createdAt: Date().addingTimeInterval(-86400 * 100)),
    UserDisplayData(id: "12", username: "hugo_moreau", firstName: "Hugo", lastName: "Moreau", 
                     isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 8)),
    UserDisplayData(id: "13", username: "sarah_lee", firstName: "Sarah", lastName: "Lee", 
                     isOnline: false, lastActiveAt: Date().addingTimeInterval(-28800), createdAt: Date().addingTimeInterval(-86400 * 140)),
    UserDisplayData(id: "14", username: "antoine_dubois", firstName: "Antoine", lastName: "Dubois", 
                     isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 25)),
    UserDisplayData(id: "15", username: "emily_taylor", firstName: "Emily", lastName: "Taylor", 
                     isOnline: false, lastActiveAt: Date().addingTimeInterval(-43200), createdAt: Date().addingTimeInterval(-86400 * 50)),
    UserDisplayData(id: "16", username: "gabriel_roux", firstName: "Gabriel", lastName: "Roux", 
                     isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 12)),
    UserDisplayData(id: "17", username: "olivia_miller", firstName: "Olivia", lastName: "Miller", 
                     isOnline: false, lastActiveAt: Date().addingTimeInterval(-10800), createdAt: Date().addingTimeInterval(-86400 * 80)),
    UserDisplayData(id: "18", username: "louis_blanc", firstName: "Louis", lastName: "Blanc", 
                     isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 18)),
    UserDisplayData(id: "19", username: "mia_johnson", firstName: "Mia", lastName: "Johnson", 
                     isOnline: false, lastActiveAt: Date().addingTimeInterval(-5400), createdAt: Date().addingTimeInterval(-86400 * 35)),
    UserDisplayData(id: "20", username: "theo_lambert", firstName: "Théo", lastName: "Lambert", 
                     isOnline: true, lastActiveAt: Date(), createdAt: Date().addingTimeInterval(-86400 * 7))
]

#Preview {
    UsersView()
}
