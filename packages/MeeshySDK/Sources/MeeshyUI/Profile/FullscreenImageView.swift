import SwiftUI
import MeeshySDK

// MARK: - Fullscreen Image View

public struct FullscreenImageView: View {
    public let imageURL: String?
    public let fallbackText: String
    public let accentColor: String
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

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

            if let urlString = imageURL, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                            .tint(Color(hex: accentColor))
                    case .success(let image):
                        image
                            .resizable()
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
                    case .failure:
                        fallbackView
                    @unknown default:
                        fallbackView
                    }
                }
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
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            Color(hex: accentColor).opacity(0.6),
                            Color(hex: accentColor).opacity(0.3)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 200, height: 200)

            Text(String(fallbackText.prefix(2)).uppercased())
                .font(.system(size: 64, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
    }
}
