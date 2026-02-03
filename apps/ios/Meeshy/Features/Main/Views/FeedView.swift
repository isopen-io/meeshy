import SwiftUI

struct FeedView: View {
    @State private var searchText = ""
    @State private var showComposer = false
    @FocusState private var isComposerFocused: Bool
    @State private var composerText = ""
    
    // MOCK DATA
    let items = [
        FeedItem(author: "Meeshy Team", content: "Welcome to the new V2 design! 🚀", timestamp: Date(), likes: 230),
        FeedItem(author: "Sarah", content: "Love the new glass effect", timestamp: Date().addingTimeInterval(-300), likes: 45),
        FeedItem(author: "Alex", content: "Anyone up for a chat in the Music community?", timestamp: Date().addingTimeInterval(-1000), likes: 89),
        FeedItem(author: "Emma", content: "Just shipped a new feature! Check it out 🎉", timestamp: Date().addingTimeInterval(-1800), likes: 156),
        FeedItem(author: "David", content: "Great discussion in the Design community today", timestamp: Date().addingTimeInterval(-3600), likes: 67),
        FeedItem(author: "Lisa", content: "Looking for collaborators on a new project", timestamp: Date().addingTimeInterval(-5400), likes: 34),
        FeedItem(author: "Michael", content: "The new UI is absolutely stunning! 😍", timestamp: Date().addingTimeInterval(-7200), likes: 198),
        FeedItem(author: "Anna", content: "Anyone attending the tech conference next week?", timestamp: Date().addingTimeInterval(-10800), likes: 23),
        FeedItem(author: "John", content: "Just published a new article on SwiftUI", timestamp: Date().addingTimeInterval(-14400), likes: 112),
        FeedItem(author: "Sophie", content: "Coffee meetup tomorrow at 3pm! Who's in?", timestamp: Date().addingTimeInterval(-18000), likes: 45)
    ]
    
    var body: some View {
        ZStack {
            // Glass background
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()
            
            VStack(spacing: 0) {
                // Feed scroll (starts from top, under buttons)
                feedScrollView
            }
            
            // Full-screen composer overlay
            if showComposer {
                composerOverlay
            }
        }
    }
    
    private var quoiDeNeufSection: some View {
        Button(action: {
            withAnimation(.spring()) {
                showComposer = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    isComposerFocused = true
                }
            }
        }) {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color.white.opacity(0.2))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Image(systemName: "person.circle.fill")
                            .font(.title2)
                            .foregroundColor(.white.opacity(0.7))
                    )
                
                Text("Quoi de neuf ?")
                    .font(.body)
                    .foregroundColor(.white.opacity(0.7))
                
                Spacer()
                
                Image(systemName: "photo")
                    .font(.title3)
                    .foregroundColor(.white.opacity(0.6))
            }
            .padding()
            .background(Color.white.opacity(0.1))
            .cornerRadius(25)
            .overlay(
                RoundedRectangle(cornerRadius: 25)
                    .stroke(Color.white.opacity(0.3), lineWidth: 1)
            )
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
    }
    
    private var feedScrollView: some View {
        ScrollView {
            LazyVStack(spacing: 20) {
                // Top spacer for floating buttons
                Spacer()
                    .frame(height: 110)
                
                // "Quoi de neuf?" at top
                quoiDeNeufSection
                
                ForEach(items) { item in
                    FeedCard(item: item)
                }
            }
            .padding(.top, 12)
            .padding(.bottom, 40)
        }
    }
    
    private var composerOverlay: some View {
        ZStack {
            // Backdrop
            Color.black.opacity(0.5)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation {
                        showComposer = false
                        isComposerFocused = false
                    }
                }
            
            // Composer card
            VStack(spacing: 0) {
                // Header
                HStack {
                    Button(action: {
                        withAnimation {
                            showComposer = false
                            isComposerFocused = false
                            composerText = ""
                        }
                    }) {
                        Text("Annuler")
                            .foregroundColor(.white.opacity(0.8))
                    }
                    
                    Spacer()
                    
                    Text("Nouveau post")
                        .font(.headline)
                        .foregroundColor(.white)
                    
                    Spacer()
                    
                    Button(action: {
                        // TODO: Post content
                        withAnimation {
                            showComposer = false
                            isComposerFocused = false
                            composerText = ""
                        }
                    }) {
                        Text("Publier")
                            .fontWeight(.semibold)
                            .foregroundColor(composerText.isEmpty ? .white.opacity(0.3) : Color(hex: "08D9D6"))
                    }
                    .disabled(composerText.isEmpty)
                }
                .padding()
                .background(.ultraThinMaterial)
                
                Divider()
                    .background(Color.white.opacity(0.2))
                
                // Text editor
                TextEditor(text: $composerText)
                    .focused($isComposerFocused)
                    .scrollContentBackground(.hidden)
                    .foregroundColor(.white)
                    .frame(height: 200)
                    .padding()
                
                Spacer()
                
                // Toolbar
                HStack(spacing: 20) {
                    Button(action: {}) {
                        Image(systemName: "photo")
                            .font(.title2)
                            .foregroundColor(.white.opacity(0.7))
                    }
                    
                    Button(action: {}) {
                        Image(systemName: "camera")
                            .font(.title2)
                            .foregroundColor(.white.opacity(0.7))
                    }
                    
                    Button(action: {}) {
                        Image(systemName: "link")
                            .font(.title2)
                            .foregroundColor(.white.opacity(0.7))
                    }
                    
                    Spacer()
                }
                .padding()
                .background(.ultraThinMaterial)
            }
            .background(Color.black.opacity(0.3))
            .background(.ultraThinMaterial)
            .cornerRadius(20)
            .padding(.horizontal, 20)
            .padding(.vertical, 100)
            .shadow(color: Color.black.opacity(0.3), radius: 20, x: 0, y: 10)
        }
        .transition(.opacity)
        .zIndex(200)
    }
}

struct FeedCard: View {
    let item: FeedItem
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Author
            HStack {
                Circle()
                    .fill(Color.white.opacity(0.2))
                    .frame(width: 40, height: 40)
                    .overlay(
                        Text(String(item.author.prefix(1)))
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                    )
                
                VStack(alignment: .leading) {
                    Text(item.author)
                        .font(.headline)
                        .foregroundColor(.white)
                    Text(timeAgo(from: item.timestamp))
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                }
                Spacer()
                Image(systemName: "ellipsis")
                    .foregroundColor(.white.opacity(0.7))
            }
            
            // Content
            Text(item.content)
                .font(.body)
                .foregroundColor(.white.opacity(0.9))
                .lineLimit(nil)
            
            // Actions
            HStack(spacing: 20) {
                HStack(spacing: 5) {
                    Image(systemName: "heart")
                    Text("\(item.likes)")
                }
                HStack(spacing: 5) {
                    Image(systemName: "bubble.right")
                    Text("Comment")
                }
                Spacer()
                Image(systemName: "bookmark")
            }
            .font(.subheadline)
            .foregroundColor(.white.opacity(0.8))
            .padding(.top, 5)
        }
        .padding()
        .background(Color.white.opacity(0.1))
        .cornerRadius(24)
        .overlay(
            RoundedRectangle(cornerRadius: 24)
                .stroke(LinearGradient(colors: [.white.opacity(0.4), .white.opacity(0.05)], startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1)
        )
        .padding(.horizontal, 20)
    }
    
    private func timeAgo(from date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "À l'instant" }
        if seconds < 3600 { return "Il y a \(seconds / 60)m" }
        if seconds < 86400 { return "Il y a \(seconds / 3600)h" }
        return "Il y a \(seconds / 86400)j"
    }
}
