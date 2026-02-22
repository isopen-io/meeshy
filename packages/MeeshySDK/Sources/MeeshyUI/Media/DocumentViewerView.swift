import SwiftUI
import WebKit
import MeeshySDK

// MARK: - Document Viewer View

public struct DocumentViewerView: View {
    public let attachment: MeeshyMessageAttachment
    public let context: MediaPlayerContext
    public var accentColor: String = "08D9D6"
    public var onDelete: (() -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    @State private var showFullViewer = false

    private var isDark: Bool { theme.mode.isDark || context.isImmersive }
    private var accent: Color { Color(hex: accentColor) }
    private var docType: DocumentMediaType { DocumentMediaType.detect(from: attachment) }

    public init(attachment: MeeshyMessageAttachment, context: MediaPlayerContext,
                accentColor: String = "08D9D6", onDelete: (() -> Void)? = nil) {
        self.attachment = attachment; self.context = context
        self.accentColor = accentColor; self.onDelete = onDelete
    }

    // MARK: - Body
    public var body: some View {
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

// MARK: - Document Full Sheet (WebView + QuickLook)

public struct DocumentFullSheet: View {
    public let attachment: MeeshyMessageAttachment
    public let docType: DocumentMediaType
    public let accentColor: String

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    public init(attachment: MeeshyMessageAttachment, docType: DocumentMediaType, accentColor: String) {
        self.attachment = attachment; self.docType = docType; self.accentColor = accentColor
    }

    public var body: some View {
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

            Text("Aper\u{00E7}u non disponible")
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

// MARK: - Document Web View (WKWebView wrapper)

public struct DocumentWebView: UIViewRepresentable {
    public let url: URL

    public init(url: URL) {
        self.url = url
    }

    public func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.load(URLRequest(url: url))
        return webView
    }

    public func updateUIView(_ uiView: WKWebView, context: Context) {}
}
