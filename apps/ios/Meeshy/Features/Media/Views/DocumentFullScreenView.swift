//
//  DocumentFullScreenView.swift
//  Meeshy
//
//  Full screen document viewer with PDF rendering and QuickLook support
//  iOS 16+
//

import SwiftUI
import PDFKit
import QuickLook

// MARK: - Document Full Screen View

struct DocumentFullScreenView: View {
    @Environment(\.dismiss) private var dismiss

    let attachment: Attachment
    let localURL: URL?

    @State private var pdfDocument: PDFDocument?
    @State private var currentPage: Int = 1
    @State private var totalPages: Int = 1
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var showShareSheet = false
    @State private var showQuickLook = false

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()

            VStack(spacing: 0) {
                // Navigation bar
                navigationBar

                // Content
                if isLoading {
                    loadingView
                } else if let error = loadError {
                    errorView(error)
                } else if attachment.isPDF, let document = pdfDocument {
                    pdfContentView(document)
                } else {
                    quickLookFallback
                }
            }
        }
        .onAppear {
            loadDocument()
        }
        .sheet(isPresented: $showShareSheet) {
            if let url = localURL {
                ShareSheet(items: [url])
            }
        }
        .fullScreenCover(isPresented: $showQuickLook) {
            if let url = localURL {
                QuickLookPreview(url: url)
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

                    if attachment.isPDF && totalPages > 1 {
                        Text("Page \(currentPage) of \(totalPages)")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                // Action buttons
                HStack(spacing: 12) {
                    // Download button
                    Button {
                        downloadDocument()
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
                        if !attachment.isPDF {
                            Button {
                                showQuickLook = true
                            } label: {
                                Label("Open in Quick Look", systemImage: "eye")
                            }
                        }

                        Button {
                            downloadDocument()
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

            // File info bar
            HStack(spacing: 16) {
                Label(attachment.fileExtension.uppercased(), systemImage: attachment.isPDF ? "doc.text.fill" : "doc.fill")
                    .foregroundColor(attachment.isPDF ? .red : .blue)

                Label(attachment.fileSizeFormatted, systemImage: "internaldrive")

                Spacer()
            }
            .font(.system(size: 11, weight: .medium))
            .foregroundColor(.secondary)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
        .background(Color(.systemGray6))
    }

    // MARK: - Download Document

    private func downloadDocument() {
        guard let url = localURL else {
            // Try to download first
            Task {
                if let downloaded = await AttachmentFileCache.shared.downloadAndCache(from: attachment.url, type: .document) {
                    await saveToFiles(url: downloaded)
                }
            }
            return
        }
        Task {
            await saveToFiles(url: url)
        }
    }

    private func saveToFiles(url: URL) async {
        await MainActor.run {
            let documentPicker = UIDocumentPickerViewController(forExporting: [url])
            if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
               let rootVC = windowScene.windows.first?.rootViewController {
                rootVC.present(documentPicker, animated: true)
            }
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)

            Text("Loading document...")
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

            Text("Unable to load document")
                .font(.headline)

            Text(error)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            if localURL != nil {
                Button {
                    showQuickLook = true
                } label: {
                    Text("Try Quick Look")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(Color.meeshyPrimary)
                        .cornerRadius(20)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - PDF Content View

    private func pdfContentView(_ document: PDFDocument) -> some View {
        PDFKitView(document: document, currentPage: $currentPage)
            .ignoresSafeArea(edges: .bottom)
    }

    // MARK: - Quick Look Fallback

    private var quickLookFallback: some View {
        VStack(spacing: 20) {
            // Document icon
            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemGray5))
                    .frame(width: 120, height: 150)

                Image(systemName: attachment.icon)
                    .font(.system(size: 48))
                    .foregroundColor(.secondary)
            }

            Text(attachment.fileName)
                .font(.headline)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Text(attachment.fileSizeFormatted)
                .font(.subheadline)
                .foregroundColor(.secondary)

            Button {
                showQuickLook = true
            } label: {
                HStack {
                    Image(systemName: "eye")
                    Text("Preview Document")
                }
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .background(Color.meeshyPrimary)
                .cornerRadius(25)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Load Document

    private func loadDocument() {
        Task {
            // Get local URL
            var fileURL = localURL

            if fileURL == nil {
                if let cached = await AttachmentFileCache.shared.getFile(for: attachment.url, type: .document) {
                    fileURL = cached
                } else if let downloaded = await AttachmentFileCache.shared.downloadAndCache(from: attachment.url, type: .document) {
                    fileURL = downloaded
                }
            }

            guard let url = fileURL else {
                await MainActor.run {
                    loadError = "Could not download document"
                    isLoading = false
                }
                return
            }

            // Load PDF
            if attachment.isPDF {
                if let document = PDFDocument(url: url) {
                    await MainActor.run {
                        self.pdfDocument = document
                        self.totalPages = document.pageCount
                        self.isLoading = false
                    }
                } else {
                    await MainActor.run {
                        loadError = "Could not parse PDF"
                        isLoading = false
                    }
                }
            } else {
                // For non-PDF documents, just show the fallback
                await MainActor.run {
                    isLoading = false
                }
            }
        }
    }
}

// MARK: - PDFKit SwiftUI Wrapper

struct PDFKitView: UIViewRepresentable {
    let document: PDFDocument
    @Binding var currentPage: Int

    func makeUIView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.document = document
        pdfView.autoScales = true
        pdfView.displayMode = .singlePageContinuous
        pdfView.displayDirection = .vertical
        pdfView.backgroundColor = .systemBackground

        // Add page change notification
        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.pageChanged(_:)),
            name: .PDFViewPageChanged,
            object: pdfView
        )

        return pdfView
    }

    func updateUIView(_ uiView: PDFView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, @unchecked Sendable {
        var parent: PDFKitView

        init(_ parent: PDFKitView) {
            self.parent = parent
        }

        @objc func pageChanged(_ notification: Notification) {
            guard let pdfView = notification.object as? PDFView,
                  let currentPage = pdfView.currentPage,
                  let pageIndex = pdfView.document?.index(for: currentPage) else {
                return
            }
            let newPageNumber = pageIndex + 1
            DispatchQueue.main.async { [weak self] in
                self?.parent.currentPage = newPageNumber
            }
        }
    }
}

// MARK: - QuickLook Preview

struct QuickLookPreview: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ uiViewController: QLPreviewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, QLPreviewControllerDataSource {
        let parent: QuickLookPreview

        init(_ parent: QuickLookPreview) {
            self.parent = parent
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
            return 1
        }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
            return parent.url as NSURL
        }
    }
}

// MARK: - Preview

#Preview {
    DocumentFullScreenView(
        attachment: Attachment(
            id: "1",
            type: .document,
            url: "https://example.com/sample.pdf",
            fileName: "Sample Document.pdf",
            fileSize: 2_500_000,
            mimeType: "application/pdf",
            createdAt: Date()
        ),
        localURL: nil
    )
}
