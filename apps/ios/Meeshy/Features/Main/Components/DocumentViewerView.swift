import SwiftUI
import WebKit
import MeeshySDK

// ============================================================================
// MARK: - Document Type
// ============================================================================

enum DocumentMediaType {
    case pdf, pptx, spreadsheet, generic

    var icon: String {
        switch self {
        case .pdf: return "doc.richtext"
        case .pptx: return "rectangle.on.rectangle.angled"
        case .spreadsheet: return "tablecells"
        case .generic: return "doc.fill"
        }
    }

    var label: String {
        switch self {
        case .pdf: return "PDF"
        case .pptx: return "Présentation"
        case .spreadsheet: return "Tableur"
        case .generic: return "Document"
        }
    }

    var color: String {
        switch self {
        case .pdf: return "EF4444"
        case .pptx: return "F59E0B"
        case .spreadsheet: return "22C55E"
        case .generic: return "3B82F6"
        }
    }

    static func detect(from attachment: MessageAttachment) -> DocumentMediaType {
        let mime = attachment.mimeType.lowercased()
        let name = attachment.originalName.lowercased()
        if mime.contains("pdf") || name.hasSuffix(".pdf") { return .pdf }
        if mime.contains("presentation") || mime.contains("pptx") ||
            name.hasSuffix(".pptx") || name.hasSuffix(".ppt") { return .pptx }
        if mime.contains("spreadsheet") || mime.contains("excel") || mime.contains("csv") ||
            name.hasSuffix(".xlsx") || name.hasSuffix(".xls") || name.hasSuffix(".csv") { return .spreadsheet }
        return .generic
    }
}

// ============================================================================
// MARK: - Document Viewer View
// ============================================================================
///
/// Reusable document viewer that adapts to context:
///  - `.messageBubble` — Compact card with icon + name
///  - `.composerAttachment` — Delete-able card
///  - `.feedPost` — Rich card with page count
///  - `.fullscreen` — WKWebView / QuickLook
///
struct DocumentViewerView: View {
    let attachment: MessageAttachment
    let context: MediaPlayerContext
    var accentColor: String = "08D9D6"
    var onDelete: (() -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    @State private var showFullViewer = false

    private var isDark: Bool { theme.mode.isDark || context.isImmersive }
    private var accent: Color { Color(hex: accentColor) }
    private var docType: DocumentMediaType { DocumentMediaType.detect(from: attachment) }

    // MARK: - Body
    var body: some View {
        Button { showFullViewer = true; HapticFeedback.light() } label: {
            if context == .composerAttachment {
                compactCard
            } else {
                richCard
            }
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showFullViewer) {
            DocumentFullSheet(
                attachment: attachment,
                docType: docType,
                accentColor: accentColor
            )
        }
    }

    // MARK: - Compact Card (composer attachment)
    private var compactCard: some View {
        VStack(spacing: 4) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: docType.color), Color(hex: docType.color).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 52, height: 52)

                Image(systemName: docType.icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(.white)
            }
            .overlay(alignment: .topTrailing) {
                if let onDelete = onDelete {
                    Button { onDelete(); HapticFeedback.light() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundColor(Color(hex: "FF6B6B"))
                            .background(Circle().fill(isDark ? Color.black : Color.white).frame(width: 12, height: 12))
                    }
                    .offset(x: 6, y: -6)
                }
            }

            Text(attachment.originalName.isEmpty ? docType.label : attachment.originalName)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.6))
                .lineLimit(1)
                .frame(width: 60)
        }
    }

    // MARK: - Rich Card (message, feed)
    private var richCard: some View {
        HStack(spacing: 12) {
            // Type icon
            ZStack {
                RoundedRectangle(cornerRadius: context.isCompact ? 10 : 12)
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: docType.color), Color(hex: docType.color).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(
                        width: context.isCompact ? 42 : 50,
                        height: context.isCompact ? 42 : 50
                    )
                    .shadow(color: Color(hex: docType.color).opacity(0.3), radius: 4, y: 2)

                Image(systemName: docType.icon)
                    .font(.system(size: context.isCompact ? 17 : 20, weight: .semibold))
                    .foregroundColor(.white)
            }

            // File info
            VStack(alignment: .leading, spacing: 3) {
                Text(attachment.originalName.isEmpty ? docType.label : attachment.originalName)
                    .font(.system(size: context.isCompact ? 12 : 13, weight: .semibold))
                    .foregroundColor(isDark ? .white : .black)
                    .lineLimit(1)

                HStack(spacing: 5) {
                    Text(docType.label)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Color(hex: docType.color))

                    if attachment.fileSize > 0 {
                        Circle().fill(isDark ? Color.white.opacity(0.2) : Color.black.opacity(0.15)).frame(width: 3, height: 3)
                        Text(attachment.fileSizeFormatted)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                    }

                    if let pages = attachment.pageCount {
                        Circle().fill(isDark ? Color.white.opacity(0.2) : Color.black.opacity(0.15)).frame(width: 3, height: 3)
                        Text("\(pages) pages")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(isDark ? .white.opacity(0.45) : .black.opacity(0.35))
                    }
                }
            }

            Spacer(minLength: 0)

            Image(systemName: "arrow.up.right.square")
                .font(.system(size: 13))
                .foregroundColor(isDark ? .white.opacity(0.25) : .black.opacity(0.18))

            // Delete (in attachment mode)
            if context.showsDeleteButton, let onDelete = onDelete {
                Button { onDelete(); HapticFeedback.light() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 15))
                        .foregroundColor(Color(hex: "FF6B6B"))
                }
            }
        }
        .padding(.horizontal, context.isCompact ? 10 : 14)
        .padding(.vertical, context.isCompact ? 8 : 12)
        .background(
            RoundedRectangle(cornerRadius: context.cornerRadius)
                .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: context.cornerRadius)
                        .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05), lineWidth: 0.5)
                )
        )
    }
}

// ============================================================================
// MARK: - Document Full Sheet (WebView + QuickLook)
// ============================================================================

struct DocumentFullSheet: View {
    let attachment: MessageAttachment
    let docType: DocumentMediaType
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        NavigationView {
            Group {
                if let urlStr = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl,
                   let url = MeeshyConfig.resolveMediaURL(urlStr) {
                    DocumentWebView(url: url)
                } else {
                    noPreviewView
                }
            }
            .navigationTitle(attachment.originalName.isEmpty ? docType.label : attachment.originalName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(Color(hex: accentColor))
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    if let urlStr = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl,
                       let url = MeeshyConfig.resolveMediaURL(urlStr) {
                        ShareLink(item: url) {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundColor(Color(hex: accentColor))
                        }
                    }
                }
            }
        }
    }

    private var noPreviewView: some View {
        VStack(spacing: 16) {
            Image(systemName: docType.icon)
                .font(.system(size: 48))
                .foregroundColor(Color(hex: docType.color))

            Text(attachment.originalName.isEmpty ? "Document" : attachment.originalName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text("Aperçu non disponible")
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)

            if attachment.fileSize > 0 {
                Text(attachment.fileSizeFormatted)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
    }
}

// ============================================================================
// MARK: - Document Web View (WKWebView wrapper)
// ============================================================================

struct DocumentWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
