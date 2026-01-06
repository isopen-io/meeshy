//
//  CodeFullScreenView.swift
//  Meeshy
//
//  Full screen code viewer with syntax highlighting and line numbers
//  iOS 16+
//

import SwiftUI

// MARK: - Code Full Screen View

struct CodeFullScreenView: View {
    @Environment(\.dismiss) private var dismiss

    let attachment: Attachment
    let localURL: URL?

    @State private var codeContent: String = ""
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var showShareSheet = false
    @State private var searchText: String = ""
    @State private var showSearch = false
    @State private var fontSize: CGFloat = 12

    private let minFontSize: CGFloat = 10
    private let maxFontSize: CGFloat = 18

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 0) {
                // Navigation bar
                navigationBar

                // Search bar (optional)
                if showSearch {
                    searchBar
                }

                // Content
                if isLoading {
                    loadingView
                } else if let error = loadError {
                    errorView(error)
                } else {
                    codeContentView
                }
            }
        }
        .onAppear {
            loadCode()
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

                VStack(spacing: 2) {
                    Text(attachment.fileName)
                        .font(.system(size: 15, weight: .semibold))
                        .lineLimit(1)

                    if let lang = CodeLanguage.from(extension: attachment.fileExtension) {
                        Text(lang.displayName)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                // Action buttons
                HStack(spacing: 12) {
                    // Download button
                    Button {
                        downloadCodeFile()
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
                            fontSize = min(fontSize + 1, maxFontSize)
                        } label: {
                            Label("Increase Font", systemImage: "textformat.size.larger")
                        }

                        Button {
                            fontSize = max(fontSize - 1, minFontSize)
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
                            downloadCodeFile()
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
                let lines = codeContent.components(separatedBy: .newlines)

                Label("\(lines.count) lines", systemImage: "text.alignleft")

                Label(attachment.fileSizeFormatted, systemImage: "doc")

                Spacer()

                Text("Font: \(Int(fontSize))pt")
                    .foregroundColor(.secondary)
            }
            .font(.system(size: 11))
            .foregroundColor(.secondary)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .background(Color(.systemGray6))
    }

    // MARK: - Download Code File

    private func downloadCodeFile() {
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

            TextField("Search in code...", text: $searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 14))

            if !searchText.isEmpty {
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

            Text("Loading code...")
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

            Text("Unable to load code")
                .font(.headline)

            Text(error)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Code Content View

    private var codeContentView: some View {
        ScrollView([.horizontal, .vertical], showsIndicators: true) {
            VStack(alignment: .leading, spacing: 0) {
                let lines = codeContent.components(separatedBy: .newlines)

                ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                    codeLineView(index: index + 1, line: line)
                }
            }
            .padding(.vertical, 8)
        }
        .background(codeBackgroundColor)
    }

    private func codeLineView(index: Int, line: String) -> some View {
        let isHighlighted = !searchText.isEmpty && line.localizedCaseInsensitiveContains(searchText)

        return HStack(alignment: .top, spacing: 0) {
            // Line number
            Text("\(index)")
                .font(.system(size: fontSize, design: .monospaced))
                .foregroundColor(.secondary)
                .frame(width: lineNumberWidth, alignment: .trailing)
                .padding(.trailing, 12)

            // Separator
            Rectangle()
                .fill(Color(.systemGray4))
                .frame(width: 1)
                .padding(.trailing, 12)

            // Code line with optional highlighting
            if isHighlighted {
                highlightedText(line, searchText: searchText)
            } else {
                Text(line.isEmpty ? " " : line)
                    .font(.system(size: fontSize, design: .monospaced))
                    .foregroundColor(codeTextColor)
            }

            Spacer(minLength: 20)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 2)
        .background(isHighlighted ? Color.yellow.opacity(0.2) : Color.clear)
    }

    private func highlightedText(_ text: String, searchText: String) -> Text {
        let ranges = text.ranges(of: searchText, options: .caseInsensitive)

        var result = Text("")
        var currentIndex = text.startIndex

        for range in ranges {
            // Add text before the match
            if currentIndex < range.lowerBound {
                result = result + Text(String(text[currentIndex..<range.lowerBound]))
                    .font(.system(size: fontSize, design: .monospaced))
                    .foregroundColor(codeTextColor)
            }

            // Add the highlighted match (use bold + different color instead of background)
            result = result + Text(String(text[range]))
                .font(.system(size: fontSize, weight: .heavy, design: .monospaced))
                .foregroundColor(.yellow)

            currentIndex = range.upperBound
        }

        // Add remaining text
        if currentIndex < text.endIndex {
            result = result + Text(String(text[currentIndex...]))
                .font(.system(size: fontSize, design: .monospaced))
                .foregroundColor(codeTextColor)
        }

        return result
    }

    // MARK: - Styling

    private var lineNumberWidth: CGFloat {
        let lines = codeContent.components(separatedBy: .newlines).count
        let digits = String(lines).count
        return CGFloat(digits) * fontSize * 0.7 + 8
    }

    private var codeBackgroundColor: Color {
        Color(.systemGray6)
    }

    private var codeTextColor: Color {
        .primary
    }

    // MARK: - Actions

    private func loadCode() {
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
                    self.codeContent = content
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
        UIPasteboard.general.string = codeContent
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
    }
}

// MARK: - String Extension for Range Finding

extension String {
    func ranges(of string: String, options: String.CompareOptions = []) -> [Range<String.Index>] {
        var ranges: [Range<String.Index>] = []
        var startIndex = self.startIndex

        while let range = self.range(of: string, options: options, range: startIndex..<self.endIndex) {
            ranges.append(range)
            startIndex = range.upperBound
        }

        return ranges
    }
}

// MARK: - Preview

#Preview {
    CodeFullScreenView(
        attachment: Attachment(
            id: "1",
            type: .code,
            url: "https://example.com/main.swift",
            fileName: "ContentView.swift",
            fileSize: 5_000,
            mimeType: "text/x-swift",
            createdAt: Date()
        ),
        localURL: nil
    )
}
