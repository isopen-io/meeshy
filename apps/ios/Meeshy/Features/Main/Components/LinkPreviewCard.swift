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

    @ObservedObject private var store = LinkPreviewStore.shared
    @State private var showSafari = false

    private var metadata: LinkMetadata? {
        store.metadata(for: urlString)
    }

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
        .onAppear { store.requestMetadata(for: urlString) }
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
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(accent)
                        .textCase(.uppercase)
                        .tracking(0.3)
                        .lineLimit(1)
                }
                if let title = meta.title?.nilIfBlank {
                    Text(title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(isDark ? MeeshyColors.indigo50 : MeeshyColors.indigo950)
                        .lineLimit(2)
                }
                if let description = meta.description?.nilIfBlank {
                    Text(description)
                        .font(.system(size: 11))
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
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(accent)
                    .lineLimit(1)
                Text(urlString)
                    .font(.system(size: 11))
                    .foregroundStyle(isDark ? MeeshyColors.indigo400 : MeeshyColors.indigo700.opacity(0.6))
                    .lineLimit(1)
            }
            .padding(.vertical, 8)
            Spacer(minLength: 0)
            ProgressView()
                .scaleEffect(0.6)
                .padding(.trailing, 10)
        }
        .background(cardBackground)
        .overlay(cardBorder)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func thumbnail(_ urlString: String) -> some View {
        AsyncImage(url: URL(string: urlString)) { phase in
            switch phase {
            case .success(let image):
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            case .empty, .failure:
                Rectangle()
                    .fill(accent.opacity(0.1))
                    .overlay(
                        Image(systemName: "link")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(accent.opacity(0.6))
                    )
            @unknown default:
                EmptyView()
            }
        }
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
