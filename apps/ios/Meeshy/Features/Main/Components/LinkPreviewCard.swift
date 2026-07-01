import SwiftUI
import SafariServices
import MeeshySDK
import MeeshyUI

/// Compact OpenGraph preview rendered below a message bubble when the text
/// contains a URL. Loads its own metadata through `LinkPreviewStore`
/// (no ViewModel coupling) so we can reuse the component in reply previews,
/// starred-message rows, etc. without threading data through ten layers.
struct LinkPreviewCard: View {
    let urlString: String
    let accentColor: String
    let isDark: Bool

    // NOT an `@ObservedObject`: observing the store's global `@Published cache`
    // made EVERY link card in the conversation re-evaluate its body whenever
    // ANY URL's metadata landed. The card now drives its own LOCAL state from
    // an awaitable per-URL resolve, so it re-renders only when ITS url resolves.
    private let store = LinkPreviewStore.shared
    @State private var metadata: LinkMetadata?
    @State private var didResolve = false
    @State private var showSafari = false

    private var accent: Color { Color(hex: accentColor) }
    private var fallbackHost: String { URL(string: urlString)?.host ?? urlString }

    var body: some View {
        Button {
            HapticFeedback.light()
            showSafari = true
        } label: {
            content
        }
        .buttonStyle(.plain)
        // Resolve OG metadata into LOCAL state, keyed by url so it runs once per
        // URL (and re-runs only if this recycled cell rebinds to a different
        // message). The store returns cached/known-failed data instantly; a real
        // network fetch happens at most once per URL across the conversation.
        .task(id: urlString) {
            metadata = await store.resolvedMetadata(for: urlString)
            didResolve = true
        }
        .sheet(isPresented: $showSafari) {
            if let url = URL(string: urlString) {
                SafariView(url: url)
                    .ignoresSafeArea()
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if let meta = metadata, meta.hasAnyVisibleField {
            populatedCard(meta)
        } else if didResolve {
            // Resolved with no usable metadata (404, non-HTML, empty OG): a
            // STATIC terminal card — never an endless spinner. The old skeleton
            // span forever for permanently-failing URLs.
            failedCard
        } else {
            skeletonCard
        }
    }

    private func populatedCard(_ meta: LinkMetadata) -> some View {
        HStack(alignment: .top, spacing: 0) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(accent)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 4) {
                if let siteName = meta.siteName?.nilIfBlank ?? meta.host {
                    Text(siteName)
                        .font(MeeshyFont.relative(10, weight: .semibold))
                        .foregroundStyle(accent)
                        .textCase(.uppercase)
                        .tracking(0.3)
                        .lineLimit(1)
                }
                if let title = meta.title?.nilIfBlank {
                    Text(title)
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                        .lineLimit(2)
                }
                if let description = meta.description?.nilIfBlank {
                    Text(description)
                        .font(MeeshyFont.relative(11))
                        .foregroundStyle(isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo700.opacity(0.7))
                        .lineLimit(2)
                }
            }
            .padding(.leading, 10)
            .padding(.vertical, 8)
            .padding(.trailing, 10)

            Spacer(minLength: 0)

            if let imageURL = meta.imageURL, !imageURL.isEmpty {
                thumbnail(imageURL)
            }
        }
        .frame(minHeight: 64)
        .background(cardBackground)
        .overlay(cardBorder)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var skeletonCard: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(accent)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 6) {
                Text(fallbackHost)
                    .font(MeeshyFont.relative(10, weight: .semibold))
                    .foregroundStyle(accent)
                    .lineLimit(1)
                Text(urlString)
                    .font(MeeshyFont.relative(11))
                    .foregroundStyle(isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo700.opacity(0.6))
                    .lineLimit(1)
            }
            .padding(.vertical, 8)
            Spacer(minLength: 0)
            ProgressView()
                .scaleEffect(0.6)
                .padding(.trailing, 10)
        }
        // Match `populatedCard`'s floor so the skeleton → populated transition
        // doesn't change the card's height and shift the bubble on load.
        .frame(minHeight: 64)
        .background(cardBackground)
        .overlay(cardBorder)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    /// Terminal state when the URL has no usable OG metadata: same shell as the
    /// skeleton (host + url, stable 64-pt floor) but a static link glyph instead
    /// of a spinner — the card stops "loading forever".
    private var failedCard: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(accent)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 6) {
                Text(fallbackHost)
                    .font(MeeshyFont.relative(10, weight: .semibold))
                    .foregroundStyle(accent)
                    .lineLimit(1)
                Text(urlString)
                    .font(MeeshyFont.relative(11))
                    .foregroundStyle(isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo700.opacity(0.6))
                    .lineLimit(1)
            }
            .padding(.vertical, 8)
            Spacer(minLength: 0)
            Image(systemName: "link")
                .font(MeeshyFont.relative(14, weight: .semibold))
                .foregroundStyle(accent.opacity(0.6))
                .padding(.trailing, 12)
        }
        .frame(minHeight: 64)
        .background(cardBackground)
        .overlay(cardBorder)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func thumbnail(_ urlString: String) -> some View {
        // CachedAsyncImage (vs raw AsyncImage) caches the fetch and decodes the
        // og:image at the displayed size instead of full resolution — a 1200×630
        // preview image rendered into a 72-pt tile was decoding a multi-MB bitmap
        // and re-downloading on every scroll-in. targetSize keeps the smaller
        // dimension crisp for the .fill while capping the decode well under the
        // pipeline's 1200 px default.
        CachedAsyncImage(
            url: urlString,
            targetSize: CGSize(width: 150, height: 150)
        ) {
            Rectangle()
                .fill(accent.opacity(0.1))
                .overlay(
                    Image(systemName: "link")
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundStyle(accent.opacity(0.6))
                )
        }
        .aspectRatio(contentMode: .fill)
        .frame(width: 72, height: 72)
        .clipped()
    }

    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(isDark ? MeeshyColors.indigo950.opacity(0.45) : MeeshyColors.indigo50)
    }

    private var cardBorder: some View {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
            .stroke(accent.opacity(0.18), lineWidth: 0.5)
    }
}

private struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.preferredBarTintColor = .clear
        controller.dismissButtonStyle = .close
        return controller
    }

    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}

private extension String {
    var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
