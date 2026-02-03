import SwiftUI

struct OverlayMenu: View {
    let onDismiss: () -> Void
    
    var body: some View {
        ZStack {
            // Semi-transparent backdrop
            Color.black.opacity(0.4)
                .ignoresSafeArea()
                .onTapGesture {
                    onDismiss()
                }
            
            // Menu content (top-right)
            VStack(spacing: 16) {
                menuButton(icon: "person.crop.circle", title: "Profil")
                menuButton(icon: "plus.bubble", title: "Nouvelle Conversation")
                menuButton(icon: "link", title: "Créer un lien")
                menuButton(icon: "bell.fill", title: "Notifications")
            }
            .padding()
            .background(.ultraThinMaterial)
            .background(Color.white.opacity(0.1))
            .cornerRadius(20)
            .padding(.top, 100)
            .padding(.trailing, 20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        }
    }
    
    private func menuButton(icon: String, title: String) -> some View {
        Button(action: onDismiss) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundColor(.white)
                    .frame(width: 30)
                
                Text(title)
                    .foregroundColor(.white)
                    .font(.body)
                
                Spacer()
            }
            .padding(.vertical, 8)
        }
    }
}
