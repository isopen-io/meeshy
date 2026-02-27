import SwiftUI
import MeeshySDK

// MARK: - Code Viewer View (inline card + full-screen sheet)

public struct CodeViewerView: View {
    public let attachment: MeeshyMessageAttachment
    public let language: CodeLanguage
    public let context: MediaPlayerContext
    public var accentColor: String = "08D9D6"
    public var onDelete: (() -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared
    @State private var showFullViewer = false
    @State private var codeContent: String?
    @State private var isLoading = true

    private var isDark: Bool { theme.mode.isDark || context.isImmersive }
    private var accent: Color { Color(hex: accentColor) }
    private var langColor: Color { Color(hex: language.color) }
    private var syntaxTheme: SyntaxTheme { .github(isDark: isDark) }

    public init(attachment: MeeshyMessageAttachment, language: CodeLanguage,
                context: MediaPlayerContext, accentColor: String = "08D9D6",
                onDelete: (() -> Void)? = nil) {
        self.attachment = attachment
        self.language = language
        self.context = context
        self.accentColor = accentColor
        self.onDelete = onDelete
    }

    public var body: some View {
        Button { showFullViewer = true; HapticFeedback.light() } label: {
            if context == .composerAttachment {
                compactCard
            } else {
                codePreviewCard
            }
        }
        .buttonStyle(.plain)
        .task { await loadCode() }
        .sheet(isPresented: $showFullViewer) {
            CodeFullSheet(
                attachment: attachment,
                language: language,
                codeContent: codeContent,
                accentColor: accentColor
            )
        }
    }

    // MARK: - Compact Card (composer)

    private var compactCard: some View {
        VStack(spacing: 4) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(
                        LinearGradient(
                            colors: [langColor, langColor.opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 52, height: 52)

                Image(systemName: "chevron.left.forwardslash.chevron.right")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
            }
            .overlay(alignment: .topTrailing) {
                if let onDelete {
                    Button { onDelete(); HapticFeedback.light() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 15))
                            .foregroundColor(Color(hex: "FF6B6B"))
                            .background(Circle().fill(isDark ? Color.black : Color.white).frame(width: 12, height: 12))
                    }
                    .offset(x: 6, y: -6)
                }
            }

            Text(attachment.originalName.isEmpty ? language.displayName : attachment.originalName)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(isDark ? .white.opacity(0.7) : .black.opacity(0.6))
                .lineLimit(1)
                .frame(width: 60)
        }
    }

    // MARK: - Code Preview Card (message bubble)

    private var codePreviewCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "chevron.left.forwardslash.chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .padding(4)
                    .background(
                        RoundedRectangle(cornerRadius: 5)
                            .fill(langColor)
                    )

                Text(attachment.originalName.isEmpty ? language.displayName : attachment.originalName)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(isDark ? .white : .black)
                    .lineLimit(1)

                Spacer(minLength: 0)

                Text(language.displayName)
                    .font(.system(size: 9, weight: .heavy))
                    .foregroundColor(langColor)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(langColor.opacity(0.15))
                    )

                if attachment.fileSize > 0 {
                    Text(attachment.fileSizeFormatted)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(isDark ? .white.opacity(0.35) : .black.opacity(0.3))
                }
            }
            .padding(.horizontal, 10)
            .padding(.top, 8)
            .padding(.bottom, 6)

            Divider()
                .background(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06))

            if isLoading {
                HStack(spacing: 6) {
                    ProgressView().scaleEffect(0.6)
                    Text("Chargement...")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(isDark ? .white.opacity(0.4) : .black.opacity(0.3))
                }
                .frame(maxWidth: .infinity, minHeight: 60)
            } else if let code = codeContent {
                codePreview(code)
            } else {
                Text("Impossible de charger le fichier")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(isDark ? .white.opacity(0.4) : .black.opacity(0.3))
                    .frame(maxWidth: .infinity, minHeight: 40)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: context.cornerRadius)
                .fill(syntaxTheme.background)
                .overlay(
                    RoundedRectangle(cornerRadius: context.cornerRadius)
                        .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.08), lineWidth: 0.5)
                )
        )
    }

    @ViewBuilder
    private func codePreview(_ code: String) -> some View {
        let lines = SyntaxHighlighter.highlight(code, language: language, theme: syntaxTheme, fontSize: 10)
        let previewLines = Array(lines.prefix(10))
        let totalLines = lines.count

        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(previewLines.enumerated()), id: \.offset) { index, attributed in
                HStack(alignment: .top, spacing: 0) {
                    Text("\(index + 1)")
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .foregroundColor(syntaxTheme.lineNumber)
                        .frame(width: 24, alignment: .trailing)
                        .padding(.trailing, 8)

                    Text(attributed)
                        .lineLimit(1)
                }
                .padding(.vertical, 0.5)
            }

            if totalLines > 10 {
                HStack(spacing: 4) {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 8))
                    Text("\(totalLines - 10) lignes de plus")
                        .font(.system(size: 9, weight: .medium))
                }
                .foregroundColor(langColor.opacity(0.7))
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    // MARK: - Load Code

    private func loadCode() async {
        guard let urlStr = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl,
              let url = MeeshyConfig.resolveMediaURL(urlStr) else {
            isLoading = false
            return
        }

        do {
            let data = try await MediaCacheManager.shared.data(for: url.absoluteString)
            codeContent = String(data: data, encoding: .utf8)
        } catch {
            codeContent = nil
        }
        isLoading = false
    }
}

// MARK: - Code Full Sheet (native SwiftUI syntax highlighting)

public struct CodeFullSheet: View {
    public let attachment: MeeshyMessageAttachment
    public let language: CodeLanguage
    public let codeContent: String?
    public let accentColor: String

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    private var langColor: Color { Color(hex: language.color) }
    private var isDark: Bool { theme.mode.isDark }
    private var syntaxTheme: SyntaxTheme { .github(isDark: isDark) }

    public init(attachment: MeeshyMessageAttachment, language: CodeLanguage,
                codeContent: String?, accentColor: String) {
        self.attachment = attachment
        self.language = language
        self.codeContent = codeContent
        self.accentColor = accentColor
    }

    public var body: some View {
        NavigationView {
            Group {
                if let code = codeContent {
                    fullCodeView(code)
                } else {
                    loadingOrErrorView
                }
            }
            .background(syntaxTheme.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(Color(hex: accentColor))
                    }
                }

                ToolbarItem(placement: .principal) {
                    HStack(spacing: 6) {
                        Text(attachment.originalName.isEmpty ? language.displayName : attachment.originalName)
                            .font(.system(size: 14, weight: .semibold))
                            .lineLimit(1)

                        Text(language.displayName)
                            .font(.system(size: 10, weight: .heavy))
                            .foregroundColor(langColor)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(langColor.opacity(0.15)))
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    if let code = codeContent {
                        Button {
                            UIPasteboard.general.string = code
                            HapticFeedback.success()
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .foregroundColor(Color(hex: accentColor))
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func fullCodeView(_ code: String) -> some View {
        let highlightedLines = SyntaxHighlighter.highlight(code, language: language, theme: syntaxTheme, fontSize: 13)
        let lineNumWidth: CGFloat = max(30, CGFloat(String(highlightedLines.count).count) * 9 + 16)

        ScrollView([.horizontal, .vertical], showsIndicators: true) {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(highlightedLines.enumerated()), id: \.offset) { index, attributed in
                    HStack(alignment: .top, spacing: 0) {
                        Text("\(index + 1)")
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundColor(syntaxTheme.lineNumber)
                            .frame(width: lineNumWidth, alignment: .trailing)
                            .padding(.trailing, 10)

                        Rectangle()
                            .fill(syntaxTheme.lineNumberBorder)
                            .frame(width: 1)
                            .padding(.trailing, 12)

                        Text(attributed)
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)
                    }
                    .padding(.vertical, 1)
                    .padding(.horizontal, 8)
                }
            }
            .padding(.vertical, 12)
        }
        .background(syntaxTheme.background)
    }

    private var loadingOrErrorView: some View {
        VStack(spacing: 16) {
            Image(systemName: "chevron.left.forwardslash.chevron.right")
                .font(.system(size: 48))
                .foregroundColor(langColor)

            Text(attachment.originalName.isEmpty ? language.displayName : attachment.originalName)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text("Chargement du fichier...")
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)
        }
    }
}
