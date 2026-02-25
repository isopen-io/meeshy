import SwiftUI
import PhotosUI
import MeeshySDK

// MARK: - Unified Post Composer

public struct UnifiedPostComposer: View {
    @State private var selectedType: PostType = .post
    @State private var content = ""
    @State private var moodEmoji: String? = nil
    @State private var visibility = "PUBLIC"
    @State private var showStoryComposer = false
    @State private var selectedPhotoItem: PhotosPickerItem? = nil
    @State private var selectedImage: UIImage? = nil
    @State private var isPublishing = false

    @ObservedObject private var theme = ThemeManager.shared

    public var onPublish: (PostType, String, String?, StoryEffects?, UIImage?) -> Void
    public var onDismiss: () -> Void

    public init(onPublish: @escaping (PostType, String, String?, StoryEffects?, UIImage?) -> Void,
                onDismiss: @escaping () -> Void) {
        self.onPublish = onPublish; self.onDismiss = onDismiss
    }

    public var body: some View {
        NavigationView {
            VStack(spacing: 0) {
                typeSelector
                Divider().overlay(Color.white.opacity(0.1))
                contentArea
                Spacer()
                bottomBar
            }
            .background(theme.backgroundPrimary.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { onDismiss() }
                        .foregroundColor(.white.opacity(0.7))
                }
                ToolbarItem(placement: .principal) {
                    Text("Create")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    publishButton
                }
            }
        }
        .fullScreenCover(isPresented: $showStoryComposer) {
            StoryComposerView(
                onPublish: { effects, text, image in
                    onPublish(.story, text ?? "", nil, effects, image)
                    showStoryComposer = false
                },
                onDismiss: { showStoryComposer = false }
            )
        }
        .photosPicker(isPresented: Binding(
            get: { selectedPhotoItem != nil ? false : false },
            set: { _ in }
        ), selection: $selectedPhotoItem, matching: .images)
        .onChange(of: selectedPhotoItem) { newItem in
            loadImage(from: newItem)
        }
    }

    // MARK: - Type Selector

    private var typeSelector: some View {
        HStack(spacing: 0) {
            ForEach(PostType.allCases, id: \.self) { type in
                typeTab(type)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private func typeTab(_ type: PostType) -> some View {
        let isSelected = selectedType == type
        return Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                selectedType = type
                if type == .story {
                    showStoryComposer = true
                }
            }
            HapticFeedback.light()
        } label: {
            VStack(spacing: 4) {
                HStack(spacing: 4) {
                    Image(systemName: type.icon)
                        .font(.system(size: 14, weight: .medium))
                    Text(type.displayName)
                        .font(.system(size: 14, weight: isSelected ? .bold : .medium))
                }
                .foregroundColor(isSelected ? Color(hex: "FF2E63") : theme.textMuted)

                Rectangle()
                    .fill(isSelected ? Color(hex: "FF2E63") : Color.clear)
                    .frame(height: 2)
                    .cornerRadius(1)
            }
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Content Area

    @ViewBuilder
    private var contentArea: some View {
        switch selectedType {
        case .post:
            postComposer
        case .status:
            statusComposer
        case .story:
            storyPlaceholder
        }
    }

    private var postComposer: some View {
        VStack(spacing: 12) {
            TextField("What's on your mind?", text: $content, axis: .vertical)
                .font(.system(size: 16))
                .foregroundColor(theme.textPrimary)
                .lineLimit(3...12)
                .padding(16)

            if let image = selectedImage {
                imagePreview(image)
            }

            HStack(spacing: 16) {
                PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                    Label("Photo", systemImage: "photo")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                }

                visibilityPicker
                Spacer()
            }
            .padding(.horizontal, 16)
        }
    }

    private var statusComposer: some View {
        VStack(spacing: 16) {
            moodEmojiPicker
            TextField("How are you feeling?", text: $content, axis: .vertical)
                .font(.system(size: 16))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2...4)
                .padding(.horizontal, 16)
            visibilityPicker
                .padding(.horizontal, 16)
        }
        .padding(.top, 16)
    }

    private var storyPlaceholder: some View {
        VStack(spacing: 12) {
            Image(systemName: "camera.fill")
                .font(.system(size: 40))
                .foregroundColor(.white.opacity(0.3))
            Text("Tap to open Story Editor")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture {
            showStoryComposer = true
        }
    }

    // MARK: - Image Preview

    private func imagePreview(_ image: UIImage) -> some View {
        ZStack(alignment: .topTrailing) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(height: 200)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 16)

            Button {
                selectedImage = nil
                selectedPhotoItem = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 22))
                    .foregroundColor(.white)
                    .shadow(radius: 4)
            }
            .padding(.trailing, 24)
            .padding(.top, 8)
        }
    }

    // MARK: - Mood Emoji Picker

    private var moodEmojiPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(moodEmojis, id: \.self) { emoji in
                    Button {
                        withAnimation(.spring(response: 0.2)) { moodEmoji = emoji }
                        HapticFeedback.light()
                    } label: {
                        Text(emoji)
                            .font(.system(size: 32))
                            .scaleEffect(moodEmoji == emoji ? 1.2 : 1)
                            .background(
                                Circle()
                                    .fill(moodEmoji == emoji ? Color(hex: "FF2E63").opacity(0.2) : Color.clear)
                                    .frame(width: 50, height: 50)
                            )
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private var moodEmojis: [String] {
        ["\u{1F60A}", "\u{1F60E}", "\u{1F60D}", "\u{1F622}", "\u{1F621}", "\u{1F92F}", "\u{1F973}", "\u{1F634}",
         "\u{1F914}", "\u{1F60B}", "\u{1F4AA}", "\u{1F525}", "\u{2764}\u{FE0F}", "\u{1F31F}", "\u{1F389}"]
    }

    // MARK: - Visibility Picker

    private var visibilityPicker: some View {
        Menu {
            Button { visibility = "PUBLIC" } label: { Label("Public", systemImage: "globe") }
            Button { visibility = "FRIENDS" } label: { Label("Friends", systemImage: "person.2") }
            Button { visibility = "PRIVATE" } label: { Label("Private", systemImage: "lock") }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: visibilityIcon)
                    .font(.system(size: 12))
                Text(visibility.capitalized)
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundColor(theme.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(Color.white.opacity(0.08)))
        }
    }

    private var visibilityIcon: String {
        switch visibility {
        case "FRIENDS": return "person.2"
        case "PRIVATE": return "lock"
        default: return "globe"
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        Divider()
            .overlay(Color.white.opacity(0.1))
    }

    // MARK: - Publish Button

    private var publishButton: some View {
        Button {
            guard !content.isEmpty || selectedType == .story else { return }
            isPublishing = true
            onPublish(selectedType, content, moodEmoji, nil, selectedImage)
            HapticFeedback.success()
        } label: {
            Text("Post")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(canPublish ? .white : .white.opacity(0.3))
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(
                    Capsule().fill(canPublish
                        ? LinearGradient(colors: [Color(hex: "FF2E63"), Color(hex: "E94057")], startPoint: .leading, endPoint: .trailing)
                        : LinearGradient(colors: [Color.gray.opacity(0.3)], startPoint: .leading, endPoint: .trailing)
                    )
                )
        }
        .disabled(!canPublish || isPublishing)
    }

    private var canPublish: Bool {
        switch selectedType {
        case .post: return !content.isEmpty
        case .status: return moodEmoji != nil
        case .story: return false
        }
    }

    // MARK: - Image Loading

    private func loadImage(from item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                selectedImage = image
            }
        }
    }
}
