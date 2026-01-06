//
//  ImageGalleryView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct ImageGalleryView: View {
    let attachments: [Attachment]
    let columns = [
        GridItem(.flexible(), spacing: 2),
        GridItem(.flexible(), spacing: 2),
        GridItem(.flexible(), spacing: 2)
    ]

    @State private var selectedAttachment: Attachment?
    @State private var showFullscreen = false

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(attachments) { attachment in
                    galleryItem(attachment)
                }
            }
        }
        .fullScreenCover(item: $selectedAttachment) { attachment in
            if let index = attachments.firstIndex(where: { $0.id == attachment.id }) {
                MediaPreviewView(
                    attachments: attachments,
                    initialIndex: index,
                    canDelete: false
                )
            }
        }
    }

    // MARK: - Gallery Item

    private func galleryItem(_ attachment: Attachment) -> some View {
        GeometryReader { geometry in
            ZStack {
                CachedAsyncImage(url: attachment.thumbnailURL ?? attachment.imageURL, cacheType: .thumbnail) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    Color.gray.opacity(0.2)
                        .overlay(
                            ProgressView()
                                .tint(.gray)
                        )
                }
                .frame(width: geometry.size.width, height: geometry.size.width)
                .clipped()

                // Video indicator
                if attachment.type == .video {
                    VStack {
                        Spacer()
                        HStack {
                            Image(systemName: "play.circle.fill")
                                .font(.title2)
                                .foregroundColor(.white)
                                .shadow(radius: 2)

                            if let duration = attachment.metadata?["duration"] as? Double {
                                Text(formatDuration(duration))
                                    .font(.caption)
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 3)
                                    .background(Color.black.opacity(0.6))
                                    .cornerRadius(4)
                            }

                            Spacer()
                        }
                        .padding(8)
                    }
                }
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .onTapGesture {
            selectedAttachment = attachment
        }
        .contextMenu {
            Button {
                shareAttachment(attachment)
            } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }

            Button {
                saveAttachment(attachment)
            } label: {
                Label("Save to Photos", systemImage: "arrow.down.circle")
            }
        }
    }

    // MARK: - Actions

    private func shareAttachment(_ attachment: Attachment) {
        // Implement share sheet
    }

    private func saveAttachment(_ attachment: Attachment) {
        // Implement save to photos
    }

    private func formatDuration(_ duration: Double) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

// MARK: - Attachment Extensions

extension Attachment {
    var thumbnailURL: URL? {
        if let urlString = thumbnailUrl, !urlString.isEmpty {
            return URL(string: urlString)
        }
        return nil
    }

    var imageURL: URL? {
        if !url.isEmpty {
            return URL(string: url)
        }
        return localURL
    }
}
