//
//  ProfileHeaderSummaryView.swift
//  Meeshy
//
//  Header résumé du profil utilisateur – placé dans Views/Components
//  iOS 16+ – utilise le modèle `User` de l'application
//

import SwiftUI

/// Vue d'en-tête du profil qui affiche avatar, nom, pseudo, bio, etc.
/// Taper sur le header ouvre la vue d'édition complète du profil.
struct ProfileHeaderSummaryView: View {
    // MARK: - Props
    let user: User               // modèle existant dans l'app
    let isLoading: Bool
    let onTap: () -> Void
    
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 16) {
                // Avatar
                AvatarView(
                    imageURL: user.avatarURL?.absoluteString,
                    initials: user.initials,
                    size: 72,
                    showOnlineIndicator: false
                )
                .overlay(alignment: .bottomTrailing) {
                    // Indicateur d'édition
                    Circle()
                        .fill(Color(.systemBackground))
                        .frame(width: 24, height: 24)
                        .overlay(
                            Image(systemName: "pencil.circle.fill")
                                .font(.system(size: 20))
                                .foregroundColor(.blue)
                        )
                }
                
                // Infos utilisateur
                VStack(alignment: .leading, spacing: 4) {
                    // Nom affiché ou complet
                    Text(user.displayNameOrFullName)
                        .font(.title3.bold())
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    
                    // Nom complet si différent du displayName
                    if let displayName = user.displayName, !displayName.isEmpty {
                        Text("\(user.firstName) \(user.lastName)")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                    
                    // Pseudo
                    Text("@\(user.username)")
                        .font(.footnote)
                        .foregroundColor(.blue)
                    
                    // Bio éventuel
                    if let bio = user.bio, !bio.isEmpty {
                        Text(bio)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                
                // Chevron de navigation
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.secondary)
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.secondarySystemGroupedBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color(.separator).opacity(0.2), lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(ProfileHeaderButtonStyle())
        .disabled(isLoading)
    }
}

// MARK: - Button style
struct ProfileHeaderButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Preview
#if DEBUG
#Preview("Profile Header Summary") {
    VStack(spacing: 20) {
        ProfileHeaderSummaryView(
            user: User(
                id: "1",
                username: "johndoe",
                firstName: "John",
                lastName: "Doe",
                bio: "Développeur passionné par l'innovation et la technologie mobile",
                email: "john.doe@example.com",
                displayName: "John D.",
                avatar: "https://via.placeholder.com/150"
            ),
            isLoading: false,
            onTap: { print("Header tapped") }
        )
        .padding()
        
        ProfileHeaderSummaryView(
            user: User(
                id: "2",
                username: "janedoe",
                firstName: "Jane",
                lastName: "Doe",
                email: "jane.doe@example.com"
            ),
            isLoading: false,
            onTap: { print("Header tapped") }
        )
        .padding()
    }
    .background(Color(.systemGroupedBackground))
}
#endif