//
//  DataStorageView.swift
//  Meeshy
//
//  Storage management view with real cache statistics
//  Manages both temporary (images/avatars) and persistent (attachments) caches
//  Swift 6 compliant
//

import SwiftUI

struct DataStorageView: View {
    @Environment(\.dismiss) private var dismiss

    // MARK: - State

    @State private var isLoading = true
    @State private var imageCacheSize: Int64 = 0
    @State private var attachmentStats: AttachmentCacheStats?

    // Alerts
    @State private var showingClearImageCacheAlert = false
    @State private var showingClearAttachmentCacheAlert = false
    @State private var showingClearAllAlert = false
    @State private var showingClearTypeAlert = false
    @State private var selectedCacheType: CacheFileType?

    // MARK: - Body

    var body: some View {
        List {
            // Total Storage
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Total Storage Used")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    if isLoading {
                        ProgressView()
                    } else {
                        Text(formatBytes(totalSize))
                            .font(.title2)
                            .fontWeight(.bold)
                    }
                }
                .padding(.vertical, 8)
            }

            // Temporary Cache (Images/Avatars)
            Section {
                HStack {
                    Label {
                        Text("Image Cache")
                    } icon: {
                        Image(systemName: "photo.stack")
                            .foregroundStyle(.blue)
                    }

                    Spacer()

                    if isLoading {
                        ProgressView()
                            .scaleEffect(0.8)
                    } else {
                        Text(formatBytes(imageCacheSize))
                            .foregroundStyle(.secondary)
                    }
                }

                Button(role: .destructive) {
                    showingClearImageCacheAlert = true
                } label: {
                    HStack {
                        Image(systemName: "trash")
                        Text("Clear Image Cache")
                    }
                }
                .disabled(imageCacheSize == 0)
            } header: {
                Text("Temporary Cache")
            } footer: {
                Text("Avatars and thumbnails. Will be re-downloaded when needed. Default TTL: 30 days.")
            }

            // Persistent Cache (Attachments)
            Section {
                if let stats = attachmentStats {
                    // Total attachments
                    HStack {
                        Label {
                            Text("Total Attachments")
                        } icon: {
                            Image(systemName: "paperclip")
                                .foregroundStyle(.purple)
                        }

                        Spacer()

                        VStack(alignment: .trailing, spacing: 2) {
                            Text(formatBytes(stats.totalSizeBytes))
                                .foregroundStyle(.secondary)
                            Text("\(stats.fileCount) files")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }

                    // Breakdown by type
                    if stats.imageCount > 0 {
                        attachmentRow(
                            title: "Images",
                            count: stats.imageCount,
                            icon: "photo.fill",
                            color: .green,
                            type: .image
                        )
                    }

                    if stats.videoCount > 0 {
                        attachmentRow(
                            title: "Videos",
                            count: stats.videoCount,
                            icon: "video.fill",
                            color: .red,
                            type: .video
                        )
                    }

                    if stats.audioCount > 0 {
                        attachmentRow(
                            title: "Audio",
                            count: stats.audioCount,
                            icon: "waveform",
                            color: .orange,
                            type: .audio
                        )
                    }

                    if stats.documentCount > 0 {
                        attachmentRow(
                            title: "Documents",
                            count: stats.documentCount,
                            icon: "doc.fill",
                            color: .blue,
                            type: .document
                        )
                    }

                    if stats.archiveCount > 0 {
                        attachmentRow(
                            title: "Archives",
                            count: stats.archiveCount,
                            icon: "doc.zipper",
                            color: .brown,
                            type: .archive
                        )
                    }

                    if stats.codeCount > 0 {
                        attachmentRow(
                            title: "Code Files",
                            count: stats.codeCount,
                            icon: "chevron.left.forwardslash.chevron.right",
                            color: .cyan,
                            type: .code
                        )
                    }

                    if stats.otherCount > 0 {
                        attachmentRow(
                            title: "Other",
                            count: stats.otherCount,
                            icon: "doc.questionmark",
                            color: .gray,
                            type: .other
                        )
                    }
                } else if isLoading {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .padding(.vertical, 20)
                } else {
                    HStack {
                        Label {
                            Text("No attachments cached")
                        } icon: {
                            Image(systemName: "tray")
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                    }
                    .foregroundStyle(.secondary)
                }

                Button(role: .destructive) {
                    showingClearAttachmentCacheAlert = true
                } label: {
                    HStack {
                        Image(systemName: "trash")
                        Text("Clear All Attachments")
                    }
                }
                .disabled(attachmentStats?.fileCount == 0)
            } header: {
                Text("Persistent Cache")
            } footer: {
                Text("Message attachments stored permanently for offline access. Tap a category to clear only that type.")
            }

            // Clear All
            Section {
                Button(role: .destructive) {
                    showingClearAllAlert = true
                } label: {
                    HStack {
                        Image(systemName: "trash.fill")
                        Text("Clear All Caches")
                    }
                    .fontWeight(.medium)
                }
                .disabled(totalSize == 0)
            } footer: {
                Text("This will remove all cached data. Media will need to be re-downloaded.")
            }
        }
        .navigationTitle("Storage")
        .refreshable {
            await loadStats()
        }
        .task {
            await loadStats()
        }
        // Alert: Clear Image Cache
        .alert("Clear Image Cache", isPresented: $showingClearImageCacheAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Clear", role: .destructive) {
                clearImageCache()
            }
        } message: {
            Text("Clear \(formatBytes(imageCacheSize)) of cached images and avatars? They will be re-downloaded when needed.")
        }
        // Alert: Clear Attachment Cache
        .alert("Clear Attachment Cache", isPresented: $showingClearAttachmentCacheAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Clear All", role: .destructive) {
                clearAttachmentCache()
            }
        } message: {
            Text("Clear \(formatBytes(attachmentStats?.totalSizeBytes ?? 0)) of cached attachments? They will need to be re-downloaded.")
        }
        // Alert: Clear Specific Type
        .alert("Clear \(selectedCacheType?.rawValue ?? "")", isPresented: $showingClearTypeAlert) {
            Button("Cancel", role: .cancel) {
                selectedCacheType = nil
            }
            Button("Clear", role: .destructive) {
                if let type = selectedCacheType {
                    clearAttachmentType(type)
                }
                selectedCacheType = nil
            }
        } message: {
            Text("Clear all cached \(selectedCacheType?.rawValue.lowercased() ?? "files")? They will need to be re-downloaded.")
        }
        // Alert: Clear All
        .alert("Clear All Caches", isPresented: $showingClearAllAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Clear All", role: .destructive) {
                clearAllCaches()
            }
        } message: {
            Text("Clear \(formatBytes(totalSize)) of all cached data? Everything will need to be re-downloaded.")
        }
    }

    // MARK: - Computed Properties

    private var totalSize: Int64 {
        imageCacheSize + (attachmentStats?.totalSizeBytes ?? 0)
    }

    // MARK: - Views

    private func attachmentRow(
        title: String,
        count: Int,
        icon: String,
        color: Color,
        type: CacheFileType
    ) -> some View {
        Button {
            selectedCacheType = type
            showingClearTypeAlert = true
        } label: {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(color)
                    .frame(width: 24)

                Text(title)
                    .foregroundStyle(.primary)

                Spacer()

                Text("\(count)")
                    .foregroundStyle(.secondary)

                Image(systemName: "chevron.right")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    // MARK: - Data Loading

    private func loadStats() async {
        isLoading = true

        async let imageSize = ImageCacheManager.shared.getCacheSize()
        async let attachStats = AttachmentFileCache.shared.getStats()

        let (imgSize, attStats) = await (imageSize, attachStats)

        await MainActor.run {
            imageCacheSize = imgSize
            attachmentStats = attStats
            isLoading = false
        }
    }

    // MARK: - Cache Operations

    private func clearImageCache() {
        Task {
            await ImageCacheManager.shared.clearAllCaches()
            await loadStats()
        }
    }

    private func clearAttachmentCache() {
        Task {
            await AttachmentFileCache.shared.clearAllCache()
            await loadStats()
        }
    }

    private func clearAttachmentType(_ type: CacheFileType) {
        Task {
            await AttachmentFileCache.shared.clearCache(for: type)
            await loadStats()
        }
    }

    private func clearAllCaches() {
        Task {
            await ImageCacheManager.shared.clearAllCaches()
            await AttachmentFileCache.shared.clearAllCache()
            await loadStats()
        }
    }

    // MARK: - Helpers

    private func formatBytes(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        DataStorageView()
    }
}
