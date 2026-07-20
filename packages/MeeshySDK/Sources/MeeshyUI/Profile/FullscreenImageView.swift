import SwiftUI
import Combine
import MeeshySDK

// MARK: - Fullscreen Image View

public struct FullscreenImageView: View {
    public let imageURL: String?
    public let fallbackText: String
    public let accentColor: String
    @Environment(\.dismiss) private var dismiss

    @State private var scale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var isDragging = false

    public init(imageURL: String?, fallbackText: String, accentColor: String) {
        self.imageURL = imageURL
        self.fallbackText = fallbackText
        self.accentColor = accentColor
    }

    public var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()

            if let urlString = imageURL, !urlString.isEmpty {
                // CachedAsyncImage (DiskCacheStore persistant) plutôt qu'AsyncImage :
                // l'image plein écran a presque toujours déjà été téléchargée par
                // l'avatar/la bannière — la rouvrir doit être un hit disque, pas
                // un nouveau téléchargement.
                CachedAsyncImage(url: urlString) {
                    ProgressView()
                        .tint(Color(hex: accentColor))
                }
                .scaledToFit()
                .scaleEffect(scale)
                .offset(offset)
                .gesture(
                    MagnificationGesture()
                        .onChanged { value in
                            scale = max(1.0, min(value, 4.0))
                        }
                )
                .simultaneousGesture(
                    DragGesture()
                        .onChanged { value in
                            isDragging = true
                            offset = value.translation
                        }
                        .onEnded { _ in
                            isDragging = false
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                offset = .zero
                            }
                        }
                )
            } else {
                fallbackView
            }

            // Close button
            VStack {
                HStack {
                    Spacer()
                    Button {
                        HapticFeedback.light()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundColor(.white.opacity(0.8))
                            .shadow(color: .black.opacity(0.3), radius: 4)
                    }
                    .padding(.trailing, 20)
                    .padding(.top, 50)
                }
                Spacer()
            }
        }
        .statusBar(hidden: true)
    }

    @ViewBuilder
    private var fallbackView: some View {
        MeeshyAvatar(
            name: fallbackText,
            context: .custom(200),
            accentColor: accentColor
        )
    }
}
