//
//  DocumentBubbleView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI
import QuickLook

struct DocumentBubbleView: View {
    let attachment: Attachment
    @State private var isDownloading = false
    @State private var downloadProgress: Double = 0
    @State private var showQuickLook = false
    @State private var localURL: URL?

    var body: some View {
        HStack(spacing: 12) {
            // File Icon
            fileIcon
                .frame(width: 48, height: 48)
                .background(fileIconColor.opacity(0.15))
                .cornerRadius(8)

            // File Info
            VStack(alignment: .leading, spacing: 4) {
                Text(attachment.fileName)
                    .font(.system(size: 17))
                    .lineLimit(1)
                    .truncationMode(.middle)

                HStack(spacing: 8) {
                    Text(formatFileSize(attachment.fileSize))
                        .font(.caption)
                        .foregroundColor(.secondary)

                    if isDownloading {
                        ProgressView(value: downloadProgress)
                            .frame(width: 60)
                    }
                }
            }

            Spacer()

            // Action Button
            if attachment.localURL != nil {
                Button {
                    openDocument()
                } label: {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 20))
                        .foregroundColor(.blue)
                }
            } else if isDownloading {
                ProgressView()
            } else {
                Button {
                    downloadDocument()
                } label: {
                    Image(systemName: "arrow.down.circle")
                        .font(.system(size: 24))
                        .foregroundColor(.blue)
                }
            }
        }
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(12)
        .onTapGesture {
            if attachment.localURL != nil {
                openDocument()
            } else if !isDownloading {
                downloadDocument()
            }
        }
        .sheet(isPresented: $showQuickLook) {
            if let url = localURL ?? attachment.localURL {
                QuickLookView(url: url)
            }
        }
    }

    // MARK: - File Icon

    private var fileIcon: some View {
        Image(systemName: fileIconName)
            .font(.system(size: 24))
            .foregroundColor(fileIconColor)
    }

    private var fileIconName: String {
        let ext = (attachment.fileName as NSString).pathExtension.lowercased()

        switch ext {
        case "pdf":
            return "doc.text.fill"
        case "doc", "docx":
            return "doc.richtext.fill"
        case "xls", "xlsx":
            return "tablecells.fill"
        case "ppt", "pptx":
            return "rectangle.fill.on.rectangle.fill"
        case "zip", "rar":
            return "doc.zipper"
        case "txt":
            return "doc.plaintext.fill"
        default:
            return "doc.fill"
        }
    }

    private var fileIconColor: Color {
        let ext = (attachment.fileName as NSString).pathExtension.lowercased()

        switch ext {
        case "pdf":
            return .red
        case "doc", "docx":
            return .blue
        case "xls", "xlsx":
            return .green
        case "ppt", "pptx":
            return .orange
        case "zip", "rar":
            return .purple
        default:
            return .gray
        }
    }

    // MARK: - Actions

    private func openDocument() {
        localURL = attachment.localURL
        showQuickLook = true
    }

    private func downloadDocument() {
        isDownloading = true

        Task {
            do {
                guard let url = URL(string: attachment.url) else { return }

                // Download file
                let (tempURL, _) = try await URLSession.shared.download(from: url)

                // Move to permanent location
                let destinationURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent(attachment.fileName)

                try? FileManager.default.removeItem(at: destinationURL)
                try FileManager.default.moveItem(at: tempURL, to: destinationURL)

                await MainActor.run {
                    localURL = destinationURL
                    isDownloading = false
                    showQuickLook = true
                }

            } catch {
                await MainActor.run {
                    isDownloading = false
                }
            }
        }
    }

    private func formatFileSize(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
}

// MARK: - QuickLook View

struct QuickLookView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(url: url)
    }

    class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL

        init(url: URL) {
            self.url = url
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
            return 1
        }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            return url as QLPreviewItem
        }
    }
}
