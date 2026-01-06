//
//  ThumbnailView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct ThumbnailView: View {
    let attachment: Attachment
    var size: CGFloat = 60
    @State private var image: UIImage?
    @State private var isLoading = false

    var body: some View {
        ZStack {
            // Base background - black for video, gray for others
            if attachment.type == .video {
                Color.black
            } else {
                Color.gray.opacity(0.2)
            }

            if let image = image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .frame(width: size, height: size)
                    .clipped()
            } else if !isLoading {
                // Show placeholder icon when not loading and no image
                Image(systemName: iconName)
                    .font(.title2)
                    .foregroundColor(attachment.type == .video ? .white.opacity(0.5) : .gray)
            }

            // Overlay for video type
            if attachment.type == .video {
                Color.black.opacity(0.3)

                Image(systemName: "play.circle.fill")
                    .font(.title2)
                    .foregroundColor(.white)
            }

            // Loading indicator
            if isLoading {
                ProgressView()
                    .tint(attachment.type == .video ? .white : .gray)
            }
        }
        .frame(width: size, height: size)
        .cornerRadius(8)
        .task {
            await loadThumbnail()
        }
    }

    private var iconName: String {
        switch attachment.type {
        case .image: return "photo"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .document, .file: return "doc.text"
        case .code: return "chevron.left.forwardslash.chevron.right"
        case .text: return "doc.plaintext"
        case .location: return "location"
        }
    }

    private func loadThumbnail() async {
        isLoading = true

        // Check cache first
        if let cachedImage = await ImageCacheManager.shared.getImage(for: attachment.id) {
            image = cachedImage
            isLoading = false
            return
        }

        // Load from local URL
        if let localURL = attachment.localURL {
            if attachment.type == .image {
                if let data = try? Data(contentsOf: localURL),
                   let loadedImage = UIImage(data: data) {
                    let thumbnail = ImageCompressor.generateThumbnail(loadedImage, size: CGSize(width: size * 2, height: size * 2))
                    image = thumbnail
                    if let thumbnail = thumbnail {
                        await ImageCacheManager.shared.cacheImage(thumbnail, for: attachment.id)
                    }
                }
            } else if attachment.type == .video {
                // Generate thumbnail from first frame
                if let thumbnail = try? await VideoCompressor.generateThumbnail(localURL, at: .zero) {
                    image = thumbnail
                    await ImageCacheManager.shared.cacheImage(thumbnail, for: attachment.id)
                }
            }
            isLoading = false
            return
        }

        // Try server-provided thumbnail URL first
        if let thumbnailURL = attachment.thumbnailUrl, !thumbnailURL.isEmpty {
            if let url = URL(string: thumbnailURL),
               let data = try? Data(contentsOf: url),
               let loadedImage = UIImage(data: data) {
                image = loadedImage
                await ImageCacheManager.shared.cacheImage(loadedImage, for: attachment.id)
                isLoading = false
                return
            }
        }

        // For video: generate thumbnail from remote URL if no server thumbnail
        if attachment.type == .video, let videoURL = URL(string: attachment.url) {
            do {
                if let thumbnail = try await VideoCompressor.generateThumbnail(videoURL, at: .zero) {
                    image = thumbnail
                    await ImageCacheManager.shared.cacheImage(thumbnail, for: attachment.id)
                }
            } catch {
                print("[ThumbnailView] Failed to generate video thumbnail: \(error)")
            }
        }

        isLoading = false
    }
}
