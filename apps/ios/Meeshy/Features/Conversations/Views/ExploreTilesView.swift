import SwiftUI

struct ExploreTileModel: Identifiable {
    let id = UUID()
    let title: String
    let icon: String
    let gradient: LinearGradient
    let action: () -> Void
}

struct ExploreTilesView: View {
    let onSelectCommunity: () -> Void
    let onSelectFavorites: () -> Void
    let onSelectArchives: () -> Void
    
    // Grid layout for tiles
    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
        GridItem(.flexible())
    ]
    
    var body: some View {
        HStack(spacing: 12) {
            // Communities Tile
            ExploreTileView(
                title: "Communautés",
                icon: "person.3.fill",
                gradient: LinearGradient(
                    colors: [Color(hex: "6366f1") ?? .indigo, Color(hex: "8b5cf6") ?? .purple], // Indigo to Violet
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                action: onSelectCommunity
            )
            
            // Favorites Tile
            ExploreTileView(
                title: "Favoris",
                icon: "heart.fill",
                gradient: LinearGradient(
                    colors: [Color(hex: "ec4899") ?? .pink, Color(hex: "f43f5e") ?? .red], // Pink to Rose
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                action: onSelectFavorites
            )
            
            // Archives Tile
            ExploreTileView(
                title: "Archives",
                icon: "archivebox.fill",
                gradient: LinearGradient(
                    colors: [Color(hex: "64748b") ?? .gray, Color(hex: "475569") ?? .gray], // Slate
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                action: onSelectArchives
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
}

struct ExploreTileView: View {
    let title: String
    let icon: String
    let gradient: LinearGradient
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(.white.opacity(0.2))
                        .frame(width: 44, height: 44)
                    
                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.white)
                }
                
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 100)
            .background(gradient)
            .cornerRadius(16)
            .shadow(color: Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
        }
        .buttonStyle(ExploreScaleButtonStyle())
    }
}

struct ExploreScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.easeInOut(duration: 0.2), value: configuration.isPressed)
    }
}

// Extension removed to avoid conflict with SettingsManager.swift

