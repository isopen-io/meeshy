//
//  MediaPreviewView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI
import AVKit

struct MediaPreviewView: View {
    let attachments: [Attachment]
    @State private var currentIndex: Int
    @Environment(\.dismiss) private var dismiss
    let onDelete: ((Attachment) -> Void)?
    let canDelete: Bool

    init(
        attachments: [Attachment],
        initialIndex: Int = 0,
        canDelete: Bool = false,
        onDelete: ((Attachment) -> Void)? = nil
    ) {
        self.attachments = attachments
        self._currentIndex = State(initialValue: initialIndex)
        self.canDelete = canDelete
        self.onDelete = onDelete
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            TabView(selection: $currentIndex) {
                ForEach(Array(attachments.enumerated()), id: \.element.id) { index, attachment in
                    mediaView(for: attachment)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))

            // Top Bar
            VStack {
                HStack {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }

                    Spacer()

                    // Page Indicator
                    if attachments.count > 1 {
                        Text("\(currentIndex + 1) / \(attachments.count)")
                            .font(.subheadline)
                            .foregroundColor(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(Color.black.opacity(0.5)))
                    }

                    Spacer()

                    Menu {
                        Button {
                            shareAttachment(attachments[currentIndex])
                        } label: {
                            Label("Share", systemImage: "square.and.arrow.up")
                        }

                        Button {
                            downloadAttachment(attachments[currentIndex])
                        } label: {
                            Label("Download", systemImage: "arrow.down.circle")
                        }

                        if canDelete {
                            Divider()

                            Button(role: .destructive) {
                                deleteCurrentAttachment()
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Color.black.opacity(0.5)))
                    }
                }
                .padding()

                Spacer()
            }
        }
    }

    // MARK: - Media View

    @ViewBuilder
    private func mediaView(for attachment: Attachment) -> some View {
        switch attachment.type {
        case .image:
            ZoomableImageView(attachment: attachment)

        case .video:
            if let url = attachment.localURL ?? (attachment.url.isEmpty ? nil : URL(string: attachment.url)) {
                VideoPlayerPreviewView(url: url)
            } else {
                placeholderView
            }

        default:
            placeholderView
        }
    }

    private var placeholderView: some View {
        VStack(spacing: 20) {
            Image(systemName: "photo")
                .font(.system(size: 60))
                .foregroundColor(.white.opacity(0.5))

            Text("Media not available")
                .font(.headline)
                .foregroundColor(.white.opacity(0.7))
        }
    }

    // MARK: - Actions

    private func shareAttachment(_ attachment: Attachment) {
        // Implement share functionality
    }

    private func downloadAttachment(_ attachment: Attachment) {
        // Implement download functionality
        Task {
            // Download to Photos library
        }
    }

    private func deleteCurrentAttachment() {
        let attachment = attachments[currentIndex]
        onDelete?(attachment)

        if attachments.count > 1 {
            if currentIndex == attachments.count - 1 {
                currentIndex -= 1
            }
        } else {
            dismiss()
        }
    }
}

// MARK: - Zoomable Image View

struct ZoomableImageView: View {
    let attachment: Attachment
    @State private var scale: CGFloat = 1.0
    @State private var lastScale: CGFloat = 1.0
    @State private var offset: CGSize = .zero
    @State private var lastOffset: CGSize = .zero
    @State private var image: UIImage?

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                if let image = image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(
                            MagnificationGesture()
                                .onChanged { value in
                                    let delta = value / lastScale
                                    lastScale = value
                                    scale = min(max(scale * delta, 1), 4)
                                }
                                .onEnded { _ in
                                    lastScale = 1.0
                                    if scale < 1 {
                                        withAnimation {
                                            scale = 1
                                            offset = .zero
                                        }
                                    }
                                }
                        )
                        .simultaneousGesture(
                            DragGesture()
                                .onChanged { value in
                                    if scale > 1 {
                                        offset = CGSize(
                                            width: lastOffset.width + value.translation.width,
                                            height: lastOffset.height + value.translation.height
                                        )
                                    }
                                }
                                .onEnded { _ in
                                    lastOffset = offset
                                }
                        )
                        .onTapGesture(count: 2) {
                            withAnimation {
                                if scale > 1 {
                                    scale = 1
                                    offset = .zero
                                    lastOffset = .zero
                                } else {
                                    scale = 2
                                }
                            }
                        }
                } else {
                    ProgressView()
                        .tint(.white)
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .task {
            await loadImage()
        }
    }

    private func loadImage() async {
        if let localURL = attachment.localURL,
           let data = try? Data(contentsOf: localURL),
           let loadedImage = UIImage(data: data) {
            image = loadedImage
        } else if !attachment.url.isEmpty,
                  let url = URL(string: attachment.url),
                  let data = try? Data(contentsOf: url),
                  let loadedImage = UIImage(data: data) {
            image = loadedImage
        }
    }
}

// MARK: - Video Player Preview View

struct VideoPlayerPreviewView: View {
    let url: URL
    @State private var player: AVPlayer?

    var body: some View {
        VideoPlayer(player: player)
            .onAppear {
                player = AVPlayer(url: url)
            }
            .onDisappear {
                player?.pause()
                player = nil
            }
    }
}
