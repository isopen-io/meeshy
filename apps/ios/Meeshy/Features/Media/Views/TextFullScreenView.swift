//
//  TextFullScreenView.swift
//  Meeshy
//
//  Full screen text viewer for plain text files
//  iOS 16+
//

import SwiftUI

// MARK: - Text Full Screen View

struct TextFullScreenView: View {
    @Environment(\.dismiss) private var dismiss

    let attachment: Attachment
    let localURL: URL?

    @State private var textContent: String = ""
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var showShareSheet = false
    @State private var searchText: String = ""
    @State private var showSearch = false
    @State private var fontSize: CGFloat = 15

    private let minFontSize: CGFloat = 12
    private let maxFontSize: CGFloat = 24

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 0) {
                // Navigation bar
                navigationBar

                // Search bar
                if showSearch {
                    searchBar
                }

                // Content
                if isLoading {
                    loadingView
                } else if let error = loadError {
                    errorView(error)
                } else {
                    textContentView
                }
            }
        }
        .onAppear {
            loadText()
        }
        .sheet(isPresented: $showShareSheet) {
            if let url = localURL {
                ShareSheet(items: [url])
            }
        }
    }

    // MARK: - Navigation Bar

    private var navigationBar: some View {
        VStack(spacing: 0) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)
                }

                Spacer()

                Text(attachment.fileName)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)

                Spacer()

                // Action buttons
                HStack(spacing: 12) {
                    // Download button
                    Button {
                        downloadTextFile()
                    } label: {
                        Image(systemName: "arrow.down.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.meeshyPrimary)
                    }

                    // Share button
                    Button {
                        showShareSheet = true
                    } label: {
                        Image(systemName: "square.and.arrow.up.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.meeshyPrimary)
                    }

                    // More options menu
                    Menu {
                        Button {
                            showSearch.toggle()
                        } label: {
                            Label(showSearch ? "Hide Search" : "Search", systemImage: "magnifyingglass")
                        }

                        Divider()

                        Button {
                            fontSize = min(fontSize + 2, maxFontSize)
                        } label: {
                            Label("Increase Font", systemImage: "textformat.size.larger")
                        }

                        Button {
                            fontSize = max(fontSize - 2, minFontSize)
                        } label: {
                            Label("Decrease Font", systemImage: "textformat.size.smaller")
                        }

                        Divider()

                        Button {
                            copyToClipboard()
                        } label: {
                            Label("Copy All", systemImage: "doc.on.doc")
                        }

                        Button {
                            downloadTextFile()
                        } label: {
                            Label("Save to Files", systemImage: "folder")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.secondary)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            // Stats bar
            HStack(spacing: 16) {
                let lines = textContent.components(separatedBy: .newlines)
                let words = textContent.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).count

                Label("\(lines.count) lines", systemImage: "text.alignleft")
                Label("\(words) words", systemImage: "textformat.abc")
                Label(attachment.fileSizeFormatted, systemImage: "doc")

                Spacer()
            }
            .font(.system(size: 11))
            .foregroundColor(.secondary)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .background(Color(.systemGray6))
    }

    // MARK: - Download Text File

    private func downloadTextFile() {
        Task {
            var fileURL = localURL

            if fileURL == nil {
                if let cached = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .other) {
                    fileURL = cached
                } else if let downloaded = await AttachmentFileCache.shared.downloadAndCache(from: attachment.url, type: .other) {
                    fileURL = downloaded
                }
            }

            guard let url = fileURL else { return }

            await MainActor.run {
                let documentPicker = UIDocumentPickerViewController(forExporting: [url])
                if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                   let rootVC = windowScene.windows.first?.rootViewController {
                    rootVC.present(documentPicker, animated: true)
                }
            }
        }
    }

    // MARK: - Search Bar

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)

            TextField("Search...", text: $searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 14))

            if !searchText.isEmpty {
                let matches = countMatches()
                Text("\(matches) found")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)

                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(10)
        .background(Color(.systemGray5))
        .cornerRadius(10)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)

            Text("Loading text...")
                .font(.system(size: 14))
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Error View

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48))
                .foregroundColor(.orange)

            Text("Unable to load text")
                .font(.headline)

            Text(error)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Text Content View

    private var textContentView: some View {
        ScrollView {
            if searchText.isEmpty {
                Text(textContent)
                    .font(.system(size: fontSize))
                    .foregroundColor(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .textSelection(.enabled)
            } else {
                highlightedTextView
                    .padding(16)
            }
        }
    }

    private var highlightedTextView: some View {
        highlightedTextContent
            .frame(maxWidth: .infinity, alignment: .leading)
            .textSelection(.enabled)
    }

    private var highlightedTextContent: Text {
        let ranges = textContent.ranges(of: searchText, options: .caseInsensitive)

        var result = Text("")
        var currentIndex = textContent.startIndex

        for range in ranges {
            // Add text before the match
            if currentIndex < range.lowerBound {
                result = result + Text(String(textContent[currentIndex..<range.lowerBound]))
                    .font(.system(size: fontSize))
                    .foregroundColor(.primary)
            }

            // Add the highlighted match (use bold + color instead of background)
            result = result + Text(String(textContent[range]))
                .font(.system(size: fontSize, weight: .heavy))
                .foregroundColor(.orange)

            currentIndex = range.upperBound
        }

        // Add remaining text
        if currentIndex < textContent.endIndex {
            result = result + Text(String(textContent[currentIndex...]))
                .font(.system(size: fontSize))
                .foregroundColor(.primary)
        }

        return result
    }

    // MARK: - Helpers

    private func countMatches() -> Int {
        textContent.ranges(of: searchText, options: .caseInsensitive).count
    }

    private func loadText() {
        Task {
            var fileURL = localURL

            if fileURL == nil {
                if let cached = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .other) {
                    fileURL = cached
                } else if let downloaded = await AttachmentFileCache.shared.downloadAndCache(from: attachment.url, type: .other) {
                    fileURL = downloaded
                }
            }

            guard let url = fileURL else {
                await MainActor.run {
                    loadError = "Could not download file"
                    isLoading = false
                }
                return
            }

            do {
                let content = try String(contentsOf: url, encoding: .utf8)
                await MainActor.run {
                    self.textContent = content
                    self.isLoading = false
                }
            } catch {
                await MainActor.run {
                    loadError = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }

    private func copyToClipboard() {
        UIPasteboard.general.string = textContent
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
    }
}

// MARK: - Preview

#Preview {
    TextFullScreenView(
        attachment: Attachment(
            id: "1",
            type: .text,
            url: "https://example.com/notes.txt",
            fileName: "Meeting Notes.txt",
            fileSize: 2_500,
            mimeType: "text/plain",
            createdAt: Date()
        ),
        localURL: nil
    )
}
