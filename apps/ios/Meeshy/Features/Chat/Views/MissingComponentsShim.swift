//
//  MissingComponentsShim.swift
//  Meeshy
//
//  Shim file providing missing components for legacy views
//  These components are used by ChatView.swift and other legacy files
//

import SwiftUI

// MARK: - Date Separator View (alias for DateSeparator)

/// Legacy alias for DateSeparator used in ChatView
struct DateSeparatorView: View {
    let date: Date

    private var displayText: String {
        let calendar = Calendar.current

        if calendar.isDateInToday(date) {
            return "Aujourd'hui"
        } else if calendar.isDateInYesterday(date) {
            return "Hier"
        } else if calendar.isDate(date, equalTo: Date(), toGranularity: .weekOfYear) {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "fr_FR")
            formatter.dateFormat = "EEEE"
            return formatter.string(from: date).capitalized
        } else if calendar.isDate(date, equalTo: Date(), toGranularity: .year) {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "fr_FR")
            formatter.dateFormat = "d MMMM"
            return formatter.string(from: date)
        } else {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "fr_FR")
            formatter.dateFormat = "d MMMM yyyy"
            return formatter.string(from: date)
        }
    }

    var body: some View {
        HStack {
            VStack { Divider() }
            Text(displayText)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.secondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(Color(.systemGray6))
                )
            VStack { Divider() }
        }
    }
}

// MARK: - Message Row (Legacy component for ChatView)

/// Legacy message row component used in ChatView
struct MessageRow: View {
    let message: Message
    let isGroupChat: Bool
    let showAvatar: Bool
    let showSenderName: Bool
    var onReact: ((String) -> Void)?
    var onReply: (() -> Void)?
    var onTranslate: (() -> Void)?
    var onEdit: (() -> Void)?
    var onDelete: (() -> Void)?

    var body: some View {
        let isCurrentUser = message.senderId == AuthenticationManager.shared.currentUser?.id

        HStack(alignment: .bottom, spacing: 8) {
            if isCurrentUser {
                Spacer(minLength: 60)
            } else if showAvatar {
                // Avatar
                if let avatarUrl = message.sender?.avatar, let url = URL(string: avatarUrl) {
                    AsyncImage(url: url) { image in
                        image.resizable().aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Circle().fill(Color(.systemGray4))
                    }
                    .frame(width: 32, height: 32)
                    .clipShape(Circle())
                } else {
                    Circle()
                        .fill(Color.meeshyPrimary.opacity(0.2))
                        .frame(width: 32, height: 32)
                        .overlay(
                            Text(String(message.sender?.preferredDisplayName.prefix(1) ?? "?"))
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.meeshyPrimary)
                        )
                }
            } else {
                Color.clear.frame(width: 32)
            }

            VStack(alignment: isCurrentUser ? .trailing : .leading, spacing: 2) {
                // Sender name
                if showSenderName && !isCurrentUser {
                    Text(message.sender?.preferredDisplayName ?? "Utilisateur")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                        .padding(.leading, 4)
                }

                // Message content
                Text(message.content)
                    .font(.system(size: 15))
                    .foregroundColor(isCurrentUser ? .white : .primary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        isCurrentUser
                            ? Color.meeshyPrimary
                            : Color(.secondarySystemBackground)
                    )
                    .cornerRadius(18)

                // Timestamp
                Text(message.createdAt.formatted(date: .omitted, time: .shortened))
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            }

            if !isCurrentUser {
                Spacer(minLength: 60)
            }
        }
        .padding(.horizontal, 12)
    }
}

// MARK: - Image Full Screen View

/// Full screen image viewer
struct ImageFullScreenView: View {
    let imageURL: URL?
    let image: UIImage?

    @Environment(\.dismiss) private var dismiss
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero

    /// Initialize with a URL string (main initializer used in the app)
    init(imageUrl: String) {
        // Handle relative paths by prepending base URL if needed
        if imageUrl.hasPrefix("http") {
            self.imageURL = URL(string: imageUrl)
        } else {
            // Relative path - prepend base URL from EnvironmentConfig
            let baseUrl = EnvironmentConfig.baseURL
            self.imageURL = URL(string: "\(baseUrl)/\(imageUrl)")
        }
        self.image = nil
    }

    init(imageURL: URL?) {
        self.imageURL = imageURL
        self.image = nil
    }

    init(image: UIImage?) {
        self.image = image
        self.imageURL = nil
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Image content
            if let image = image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .scaleEffect(scale)
                    .offset(offset)
                    .gesture(magnificationGesture)
                    .gesture(dragGesture)
            } else if let url = imageURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .scaleEffect(scale)
                            .offset(offset)
                            .gesture(magnificationGesture)
                            .gesture(dragGesture)
                    case .failure:
                        VStack(spacing: 12) {
                            Image(systemName: "photo")
                                .font(.system(size: 48))
                                .foregroundColor(.gray)
                            Text("Failed to load image")
                                .foregroundColor(.gray)
                        }
                    case .empty:
                        ProgressView()
                            .tint(.white)
                    @unknown default:
                        EmptyView()
                    }
                }
            }

            // Close button
            VStack {
                HStack {
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 30))
                            .foregroundColor(.white.opacity(0.8))
                            .padding()
                    }
                }
                Spacer()
            }
        }
        .onTapGesture(count: 2) {
            withAnimation(.spring()) {
                if scale > 1 {
                    scale = 1
                    offset = .zero
                } else {
                    scale = 2
                }
            }
        }
    }

    private var magnificationGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                let delta = value / lastScale
                lastScale = value
                scale *= delta
            }
            .onEnded { _ in
                lastScale = 1.0
                if scale < 1 {
                    withAnimation(.spring()) {
                        scale = 1
                        offset = .zero
                    }
                }
            }
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                offset = CGSize(
                    width: lastOffset.width + value.translation.width,
                    height: lastOffset.height + value.translation.height
                )
            }
            .onEnded { _ in
                lastOffset = offset
                if scale <= 1 {
                    withAnimation(.spring()) {
                        offset = .zero
                        lastOffset = .zero
                    }
                }
            }
    }
}

// MARK: - Link Preview Model

/// Model for link preview data
struct LinkPreview: Identifiable, Hashable {
    let id: String
    let url: URL
    let title: String?
    let description: String?
    let imageURL: URL?

    init(id: String = UUID().uuidString, url: URL, title: String? = nil, description: String? = nil, imageURL: URL? = nil) {
        self.id = id
        self.url = url
        self.title = title
        self.description = description
        self.imageURL = imageURL
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: LinkPreview, rhs: LinkPreview) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Link Preview View

/// View for displaying link previews
struct LinkPreviewView: View {
    let preview: LinkPreview

    var body: some View {
        Link(destination: preview.url) {
            HStack(spacing: 12) {
                // Image thumbnail
                if let imageURL = preview.imageURL {
                    AsyncImage(url: imageURL) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                    } placeholder: {
                        Rectangle()
                            .fill(Color(.systemGray5))
                            .overlay(
                                Image(systemName: "link")
                                    .foregroundColor(.secondary)
                            )
                    }
                    .frame(width: 60, height: 60)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(.systemGray5))
                        .frame(width: 60, height: 60)
                        .overlay(
                            Image(systemName: "link")
                                .foregroundColor(.secondary)
                        )
                }

                // Text content
                VStack(alignment: .leading, spacing: 4) {
                    if let title = preview.title {
                        Text(title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.primary)
                            .lineLimit(2)
                    }

                    if let description = preview.description {
                        Text(description)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                    }

                    Text(preview.url.host ?? preview.url.absoluteString)
                        .font(.system(size: 11))
                        .foregroundColor(.meeshyPrimary)
                        .lineLimit(1)
                }

                Spacer()
            }
            .padding(10)
            .background(Color(.secondarySystemBackground))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Previews

#Preview("Date Separator") {
    VStack(spacing: 20) {
        DateSeparatorView(date: Date())
        DateSeparatorView(date: Date().addingTimeInterval(-86400))
        DateSeparatorView(date: Date().addingTimeInterval(-86400 * 7))
    }
    .padding()
}

#Preview("Image Full Screen") {
    ImageFullScreenView(imageURL: URL(string: "https://picsum.photos/800/600"))
}

#Preview("Link Preview") {
    LinkPreviewView(preview: LinkPreview(
        url: URL(string: "https://apple.com")!,
        title: "Apple",
        description: "Discover the innovative world of Apple",
        imageURL: nil
    ))
    .padding()
}
