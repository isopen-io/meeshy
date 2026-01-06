//
//  AttachmentPreviewViews.swift
//  Meeshy
//
//  Inline preview views for different attachment types
//  - PDF preview with first page thumbnail
//  - Document preview (Office docs)
//  - Code preview with syntax highlighting colors
//  - Text preview
//
//  iOS 16+
//

import SwiftUI
import PDFKit
import QuickLook

// MARK: - PDF Inline Preview

/// Displays a PDF preview with first page thumbnail in message bubbles
/// Shows: thumbnail of first page, filename, page count, file size
/// Tap to open in fullscreen DocumentFullScreenView
struct PDFInlinePreview: View {
    let attachment: Attachment
    var onTap: (() -> Void)?

    @State private var thumbnailResult: PDFThumbnailResult?
    @State private var isLoading = true
    @State private var loadError = false

    /// Maximum height for the thumbnail preview
    private let maxThumbnailHeight: CGFloat = 200

    /// Thumbnail size for generation (2x for retina)
    private var thumbnailSize: CGSize {
        CGSize(width: 300, height: maxThumbnailHeight * 2)
    }

    var body: some View {
        Button(action: { onTap?() }) {
            VStack(alignment: .leading, spacing: 0) {
                // PDF Thumbnail
                pdfThumbnailView

                // Metadata bar
                metadataBar
            }
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(.systemGray4), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 280)
        .onAppear {
            loadThumbnail()
        }
    }

    // MARK: - Thumbnail View

    @ViewBuilder
    private var pdfThumbnailView: some View {
        if let result = thumbnailResult {
            // Calculate display size maintaining aspect ratio
            let aspectRatio = result.pageSize.width / result.pageSize.height
            let displayHeight = min(maxThumbnailHeight, 280 / aspectRatio)

            Image(uiImage: result.thumbnail)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(maxWidth: 280, maxHeight: displayHeight)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 14,
                        bottomLeadingRadius: 0,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: 14
                    )
                )
                .overlay(alignment: .topTrailing) {
                    // Page count badge overlay
                    if let pageCount = pageCount, pageCount > 1 {
                        Text("\(pageCount) pages")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(
                                Capsule()
                                    .fill(Color.black.opacity(0.6))
                            )
                            .padding(8)
                    }
                }
        } else if isLoading {
            // Loading state
            Rectangle()
                .fill(Color(.systemGray5))
                .frame(height: 150)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 14,
                        bottomLeadingRadius: 0,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: 14
                    )
                )
                .overlay(
                    VStack(spacing: 8) {
                        ProgressView()
                            .scaleEffect(1.0)
                        Text("Loading PDF...")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                )
        } else {
            // Error/fallback state
            Rectangle()
                .fill(Color.red.opacity(0.1))
                .frame(height: 120)
                .clipShape(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 14,
                        bottomLeadingRadius: 0,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: 14
                    )
                )
                .overlay(
                    VStack(spacing: 8) {
                        Image(systemName: "doc.text.fill")
                            .font(.system(size: 40))
                            .foregroundColor(.red.opacity(0.6))
                        if loadError {
                            Text("Unable to preview")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                    }
                )
        }
    }

    // MARK: - Metadata Bar

    private var metadataBar: some View {
        HStack(spacing: 8) {
            // PDF icon
            Image(systemName: "doc.text.fill")
                .font(.system(size: 16))
                .foregroundColor(.red)

            // File info
            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.fileName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text("PDF")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(
                            Capsule()
                                .fill(Color.red)
                        )

                    Text(attachment.fileSizeFormatted)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            // Expand icon
            Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
        .padding(10)
        .background(Color(.systemGray6))
    }

    // MARK: - Helpers

    /// Page count from thumbnail result or attachment metadata
    private var pageCount: Int? {
        if let result = thumbnailResult {
            return result.pageCount
        }
        return attachment.pageCount
    }

    private func loadThumbnail() {
        Task {
            // Use the PDFThumbnailCache for efficient caching
            if let result = await PDFThumbnailCache.shared.getThumbnail(
                forRemoteURL: attachment.url,
                size: thumbnailSize
            ) {
                await MainActor.run {
                    self.thumbnailResult = result
                    self.isLoading = false
                }
            } else {
                await MainActor.run {
                    self.loadError = true
                    self.isLoading = false
                }
            }
        }
    }
}

// MARK: - Document Inline Preview

/// Displays non-PDF documents (Office docs, etc.) with QuickLook thumbnail
struct DocumentInlinePreview: View {
    let attachment: Attachment
    var onTap: (() -> Void)?

    @State private var thumbnail: UIImage?
    @State private var isLoading = true

    var body: some View {
        // For PDFs, use the dedicated PDFInlinePreview
        if attachment.isPDF {
            PDFInlinePreview(attachment: attachment, onTap: onTap)
        } else {
            // Non-PDF documents use the compact horizontal layout
            nonPDFDocumentView
        }
    }

    private var nonPDFDocumentView: some View {
        Button(action: { onTap?() }) {
            HStack(spacing: 12) {
                // Document thumbnail or icon
                documentThumbnailView
                    .frame(width: 56, height: 72)

                // Document info
                VStack(alignment: .leading, spacing: 4) {
                    Text(attachment.fileName)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.primary)
                        .lineLimit(2)

                    HStack(spacing: 8) {
                        // File type badge
                        Text(attachment.fileExtension.uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(colorForExtension(attachment.fileExtension))
                            )

                        // File size
                        Text(attachment.fileSizeFormatted)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)

                        // Page count for documents that support it
                        if let pageCount = attachment.pageCount {
                            Text("- \(pageCount) pages")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Spacer()

                // Expand icon
                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(.systemGray4), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 300)
        .onAppear {
            loadThumbnail()
        }
    }

    @ViewBuilder
    private var documentThumbnailView: some View {
        if let thumbnail = thumbnail {
            Image(uiImage: thumbnail)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 56, height: 72)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        } else if isLoading {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(.systemGray5))
                .overlay(
                    ProgressView()
                        .scaleEffect(0.8)
                )
        } else {
            // Fallback icon
            RoundedRectangle(cornerRadius: 8)
                .fill(colorForExtension(attachment.fileExtension).opacity(0.15))
                .overlay(
                    Image(systemName: attachment.icon)
                        .font(.system(size: 24))
                        .foregroundColor(colorForExtension(attachment.fileExtension))
                )
        }
    }

    private func loadThumbnail() {
        // Skip for PDFs (handled by PDFInlinePreview)
        guard !attachment.isPDF else { return }

        Task {
            // Try to get cached file first
            if let cachedURL = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .document) {
                await generateThumbnail(from: cachedURL)
            } else {
                // Download and cache
                if let cachedURL = await AttachmentFileCache.shared.downloadAndCache(from: attachment.url, type: .document) {
                    await generateThumbnail(from: cachedURL)
                }
            }
            await MainActor.run {
                isLoading = false
            }
        }
    }

    private func generateThumbnail(from url: URL) async {
        // Use QuickLook for non-PDF documents
        let request = QLThumbnailGenerator.Request(
            fileAt: url,
            size: CGSize(width: 112, height: 144),
            scale: UIScreen.main.scale,
            representationTypes: .thumbnail
        )

        do {
            let representation = try await QLThumbnailGenerator.shared.generateBestRepresentation(for: request)
            await MainActor.run {
                self.thumbnail = representation.uiImage
            }
        } catch {
            print("Failed to generate thumbnail: \(error)")
        }
    }

    private func colorForExtension(_ ext: String) -> Color {
        switch ext.lowercased() {
        case "pdf": return .red
        case "doc", "docx": return .blue
        case "xls", "xlsx": return .green
        case "ppt", "pptx": return .orange
        case "zip", "rar", "7z": return .purple
        default: return .gray
        }
    }
}

// MARK: - Code Inline Preview

struct CodeInlinePreview: View {
    let attachment: Attachment
    var onTap: (() -> Void)?

    @State private var previewLines: [String] = []
    @State private var isLoading = true
    @State private var totalLines: Int = 0

    private let maxPreviewLines = 8

    var body: some View {
        Button(action: { onTap?() }) {
            VStack(alignment: .leading, spacing: 0) {
                // Header
                codeHeader

                // Code preview
                codePreviewBody
            }
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(.systemGray4), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 300)
        .onAppear {
            loadCodePreview()
        }
    }

    private var codeHeader: some View {
        HStack(spacing: 8) {
            // Language icon
            Image(systemName: "chevron.left.forwardslash.chevron.right")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(languageColor)

            // File name
            Text(attachment.fileName)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.primary)
                .lineLimit(1)

            Spacer()

            // Language badge
            if let lang = CodeLanguage.from(extension: attachment.fileExtension) {
                Text(lang.displayName)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule()
                            .fill(languageColor)
                    )
            }

            // Expand icon
            Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(.systemGray5))
    }

    private var codePreviewBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            if isLoading {
                HStack {
                    Spacer()
                    ProgressView()
                        .scaleEffect(0.8)
                    Spacer()
                }
                .padding(20)
            } else if previewLines.isEmpty {
                Text("Empty file")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .padding(12)
            } else {
                // Code lines with line numbers
                ForEach(Array(previewLines.enumerated()), id: \.offset) { index, line in
                    HStack(alignment: .top, spacing: 8) {
                        // Line number
                        Text("\(index + 1)")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.secondary)
                            .frame(width: 24, alignment: .trailing)

                        // Code line
                        Text(line)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.primary)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                }

                // "More lines" indicator
                if totalLines > maxPreviewLines {
                    HStack {
                        Spacer()
                        Text("+ \(totalLines - maxPreviewLines) more lines")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.secondary)
                        Spacer()
                    }
                    .padding(.vertical, 8)
                    .background(
                        LinearGradient(
                            colors: [.clear, Color(.systemGray6)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                }
            }
        }
        .padding(.vertical, 8)
    }

    private var languageColor: Color {
        guard let lang = CodeLanguage.from(extension: attachment.fileExtension) else {
            return .gray
        }
        switch lang {
        case .swift: return .orange
        case .python: return .blue
        case .javascript, .typescript: return .yellow
        case .java: return .red
        case .kotlin: return .purple
        case .go: return .cyan
        case .rust: return .orange
        case .html: return .red
        case .css: return .blue
        case .json, .yaml, .xml: return .green
        case .markdown: return .gray
        case .sql: return .blue
        case .shell: return .green
        default: return .gray
        }
    }

    private func loadCodePreview() {
        Task {
            // Try to get cached file first
            var fileURL: URL?
            if let cachedURL = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .other) {
                fileURL = cachedURL
            } else if let cachedURL = await AttachmentFileCache.shared.downloadAndCache(from: attachment.url, type: .other) {
                fileURL = cachedURL
            }

            guard let url = fileURL else {
                await MainActor.run { isLoading = false }
                return
            }

            // Read file content
            do {
                let content = try String(contentsOf: url, encoding: .utf8)
                let lines = content.components(separatedBy: .newlines)

                await MainActor.run {
                    self.totalLines = lines.count
                    self.previewLines = Array(lines.prefix(maxPreviewLines))
                    self.isLoading = false
                }
            } catch {
                print("Failed to read code file: \(error)")
                await MainActor.run { isLoading = false }
            }
        }
    }
}

// MARK: - Text Inline Preview

struct TextInlinePreview: View {
    let attachment: Attachment
    var onTap: (() -> Void)?

    @State private var previewText: String = ""
    @State private var isLoading = true
    @State private var totalLines: Int = 0

    private let maxPreviewChars = 300

    var body: some View {
        Button(action: { onTap?() }) {
            VStack(alignment: .leading, spacing: 8) {
                // Header
                HStack(spacing: 8) {
                    Image(systemName: "doc.plaintext")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)

                    Text(attachment.fileName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.primary)
                        .lineLimit(1)

                    Spacer()

                    Text(attachment.fileSizeFormatted)
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)

                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }

                // Preview content
                if isLoading {
                    HStack {
                        Spacer()
                        ProgressView()
                            .scaleEffect(0.8)
                        Spacer()
                    }
                    .padding(.vertical, 12)
                } else if previewText.isEmpty {
                    Text("Empty file")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .italic()
                } else {
                    Text(previewText)
                        .font(.system(size: 12))
                        .foregroundColor(.primary)
                        .lineLimit(6)

                    if totalLines > 6 {
                        Text("Tap to see more...")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.meeshyPrimary)
                    }
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(.systemGray4), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 300)
        .onAppear {
            loadTextPreview()
        }
    }

    private func loadTextPreview() {
        Task {
            var fileURL: URL?
            if let cachedURL = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .other) {
                fileURL = cachedURL
            } else if let cachedURL = await AttachmentFileCache.shared.downloadAndCache(from: attachment.url, type: .other) {
                fileURL = cachedURL
            }

            guard let url = fileURL else {
                await MainActor.run { isLoading = false }
                return
            }

            do {
                let content = try String(contentsOf: url, encoding: .utf8)
                let lines = content.components(separatedBy: .newlines)

                await MainActor.run {
                    self.totalLines = lines.count
                    self.previewText = String(content.prefix(maxPreviewChars))
                    if content.count > maxPreviewChars {
                        self.previewText += "..."
                    }
                    self.isLoading = false
                }
            } catch {
                print("Failed to read text file: \(error)")
                await MainActor.run { isLoading = false }
            }
        }
    }
}

// MARK: - Archive Inline Preview

struct ArchiveInlinePreview: View {
    let attachment: Attachment
    var onTap: (() -> Void)?

    var body: some View {
        Button(action: { onTap?() }) {
            HStack(spacing: 12) {
                // Archive icon
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.purple.opacity(0.15))
                        .frame(width: 50, height: 50)

                    Image(systemName: "doc.zipper")
                        .font(.system(size: 24))
                        .foregroundColor(.purple)
                }

                // Archive info
                VStack(alignment: .leading, spacing: 4) {
                    Text(attachment.fileName)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.primary)
                        .lineLimit(2)

                    HStack(spacing: 8) {
                        Text(attachment.fileExtension.uppercased())
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(
                                Capsule()
                                    .fill(Color.purple)
                            )

                        Text(attachment.fileSizeFormatted)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                Image(systemName: "arrow.down.circle")
                    .font(.system(size: 20))
                    .foregroundColor(.purple)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(.systemGray6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(.systemGray4), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .frame(maxWidth: 300)
    }
}

// MARK: - Previews

#Preview("PDF Preview") {
    VStack(spacing: 16) {
        PDFInlinePreview(
            attachment: Attachment(
                id: "1",
                type: .document,
                url: "https://example.com/doc.pdf",
                fileName: "Annual Report 2024.pdf",
                fileSize: 2_500_000,
                mimeType: "application/pdf",
                metadata: ["pageCount": 15],
                createdAt: Date()
            )
        )

        PDFInlinePreview(
            attachment: Attachment(
                id: "2",
                type: .document,
                url: "https://example.com/contract.pdf",
                fileName: "Contract_Agreement_v2.pdf",
                fileSize: 850_000,
                mimeType: "application/pdf",
                metadata: ["pageCount": 3],
                createdAt: Date()
            )
        )
    }
    .padding()
}

#Preview("Document Preview (Non-PDF)") {
    VStack(spacing: 16) {
        DocumentInlinePreview(
            attachment: Attachment(
                id: "1",
                type: .document,
                url: "https://example.com/doc.docx",
                fileName: "Project Proposal.docx",
                fileSize: 450_000,
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                createdAt: Date()
            )
        )

        DocumentInlinePreview(
            attachment: Attachment(
                id: "2",
                type: .document,
                url: "https://example.com/doc.xlsx",
                fileName: "Budget.xlsx",
                fileSize: 150_000,
                mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                createdAt: Date()
            )
        )
    }
    .padding()
}

#Preview("Code Preview") {
    CodeInlinePreview(
        attachment: Attachment(
            id: "1",
            type: .code,
            url: "https://example.com/main.swift",
            fileName: "ContentView.swift",
            fileSize: 5_000,
            mimeType: "text/x-swift",
            createdAt: Date()
        )
    )
    .padding()
}

#Preview("Text Preview") {
    TextInlinePreview(
        attachment: Attachment(
            id: "1",
            type: .text,
            url: "https://example.com/notes.txt",
            fileName: "Meeting Notes.txt",
            fileSize: 1_500,
            mimeType: "text/plain",
            createdAt: Date()
        )
    )
    .padding()
}
