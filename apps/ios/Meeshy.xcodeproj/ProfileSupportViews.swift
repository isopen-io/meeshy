//
//  ProfileSupportViews.swift
//  Meeshy
//
//  Supporting views for EnhancedUnifiedProfileView
//  iOS 16+ compatible
//

import SwiftUI

// MARK: - QR Code View

struct QRCodeView: View {
    let user: User?
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()
                
                // QR Code placeholder
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemBackground))
                    .frame(width: 250, height: 250)
                    .overlay {
                        VStack(spacing: 16) {
                            Image(systemName: "qrcode")
                                .font(.system(size: 120))
                                .foregroundColor(.primary)
                            
                            Text("@\(user?.username ?? "user")")
                                .font(.headline)
                        }
                    }
                    .shadow(color: .black.opacity(0.1), radius: 10)
                
                VStack(spacing: 8) {
                    Text("Scan to connect")
                        .font(.title3)
                        .fontWeight(.semibold)
                    
                    Text("Share this QR code with others to quickly connect on Meeshy")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                
                Spacer()
                
                // Action buttons
                HStack(spacing: 16) {
                    Button {
                        // Save QR code to photos
                    } label: {
                        Label("Save", systemImage: "square.and.arrow.down")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    
                    Button {
                        // Share QR code
                    } label: {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                }
                .padding(.horizontal)
            }
            .padding()
            .navigationTitle("My QR Code")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Share Profile View

struct ShareProfileView: View {
    let user: User?
    @Environment(\.dismiss) private var dismiss
    
    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(spacing: 16) {
                        if let avatarURL = user?.avatarURL {
                            AsyncImage(url: avatarURL) { image in
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(width: 80, height: 80)
                                    .clipShape(Circle())
                            } placeholder: {
                                ProgressView()
                            }
                        } else {
                            Circle()
                                .fill(LinearGradient(
                                    colors: [.blue, .purple],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ))
                                .frame(width: 80, height: 80)
                                .overlay {
                                    Text(user?.initials ?? "?")
                                        .font(.largeTitle)
                                        .foregroundColor(.white)
                                }
                        }
                        
                        Text(user?.displayName ?? "User")
                            .font(.title2)
                            .fontWeight(.semibold)
                        
                        Text("@\(user?.username ?? "username")")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical)
                }
                
                Section("Share via") {
                    Button {
                        // Share via message
                    } label: {
                        Label("Message", systemImage: "message.fill")
                    }
                    
                    Button {
                        // Share via email
                    } label: {
                        Label("Email", systemImage: "envelope.fill")
                    }
                    
                    Button {
                        // Copy link
                    } label: {
                        Label("Copy Link", systemImage: "link")
                    }
                    
                    Button {
                        // More options
                    } label: {
                        Label("More...", systemImage: "ellipsis")
                    }
                }
            }
            .navigationTitle("Share Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Blocked Users View

struct BlockedUsersView: View {
    @State private var blockedUsers: [User] = []
    
    var body: some View {
        List {
            if blockedUsers.isEmpty {
                ContentUnavailableView(
                    "No Blocked Users",
                    systemImage: "person.2.slash",
                    description: Text("Users you block will appear here")
                )
            } else {
                ForEach(blockedUsers) { user in
                    HStack {
                        Circle()
                            .fill(LinearGradient(
                                colors: [.blue, .purple],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ))
                            .frame(width: 40, height: 40)
                            .overlay {
                                Text(user.initials)
                                    .font(.caption)
                                    .foregroundColor(.white)
                            }
                        
                        VStack(alignment: .leading) {
                            Text(user.displayName)
                                .font(.body)
                            Text("@\(user.username)")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        
                        Spacer()
                        
                        Button("Unblock") {
                            // Unblock user
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }
            }
        }
        .navigationTitle("Blocked Users")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - App Icon Selector View

struct AppIconSelectorView: View {
    @State private var selectedIcon = "Default"
    
    let icons = [
        ("Default", "app"),
        ("Dark", "app.fill"),
        ("Blue", "app.badge"),
        ("Purple", "app.badge.fill")
    ]
    
    var body: some View {
        List {
            ForEach(icons, id: \.0) { icon in
                Button {
                    selectedIcon = icon.0
                    // Change app icon
                } label: {
                    HStack {
                        Image(systemName: icon.1)
                            .font(.largeTitle)
                            .foregroundColor(.blue)
                            .frame(width: 60, height: 60)
                            .background(Color(.secondarySystemGroupedBackground))
                            .cornerRadius(12)
                        
                        Text(icon.0)
                            .font(.body)
                            .foregroundColor(.primary)
                        
                        Spacer()
                        
                        if selectedIcon == icon.0 {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                    .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
            }
        }
        .navigationTitle("App Icon")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Chat Background View

struct ChatBackgroundView: View {
    @State private var selectedBackground = "Default"
    
    let backgrounds = [
        ("Default", Color(.systemBackground)),
        ("Light Gray", Color(.systemGray6)),
        ("Blue", Color.blue.opacity(0.1)),
        ("Purple", Color.purple.opacity(0.1))
    ]
    
    var body: some View {
        List {
            ForEach(backgrounds, id: \.0) { background in
                Button {
                    selectedBackground = background.0
                } label: {
                    HStack {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(background.1)
                            .frame(width: 60, height: 60)
                            .overlay {
                                RoundedRectangle(cornerRadius: 8)
                                    .strokeBorder(Color.secondary.opacity(0.3), lineWidth: 1)
                            }
                        
                        Text(background.0)
                            .font(.body)
                            .foregroundColor(.primary)
                        
                        Spacer()
                        
                        if selectedBackground == background.0 {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                    .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
            }
        }
        .navigationTitle("Chat Background")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Extension for Bundle

extension Bundle {
    var appVersion: String {
        infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    }
}
