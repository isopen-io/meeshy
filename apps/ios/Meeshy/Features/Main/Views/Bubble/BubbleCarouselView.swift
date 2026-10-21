// MARK: - BubbleCarouselView — inline paging carousel for a message's media
// Extracted from BubbleStandardLayout+Media.swift (no behaviour change).

import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Bubble Carousel View (Native Paging + Elegant Transitions)

struct BubbleCarouselView: View {
    let items: [MessageAttachment]

    /// La page `index` bornée aux pages existantes ; `nil` quand le message n'a
    /// plus aucun visuel (le carrousel peut rester monté un instant de plus).
    nonisolated static func currentAttachment(at index: Int, in items: [MessageAttachment]) -> MessageAttachment? {
        guard !items.isEmpty else { return nil }
        return items[max(0, min(index, items.count - 1))]
    }

    /// La page à montrer quand la liste a bougé sous le carrousel (une pièce
    /// retirée, ajoutée, réordonnée) : la pièce MONTRÉE si elle y est encore,
    /// à son nouveau rang — sinon la page voisine, bornée. L'indice seul
    /// désignait une autre pièce et l'indicateur disait « 3 / 2 ».
    nonisolated static func reanchoredPage(
        shownId: String?, index: Int, in items: [MessageAttachment]
    ) -> (id: String, index: Int)? {
        if let shownId, let kept = items.firstIndex(where: { $0.id == shownId }) {
            return (shownId, kept)
        }
        guard let fallback = currentAttachment(at: index, in: items),
              let at = items.firstIndex(where: { $0.id == fallback.id }) else { return nil }
        return (fallback.id, at)
    }
    @Binding var carouselIndex: Int
    @Binding var showCarousel: Bool
    @Binding var fullscreenAttachment: MessageAttachment?
    let contactColor: String
    let messageDeliveryStatus: Message.DeliveryStatus
    var footer: BubbleFooterModel = .empty
    var isDark: Bool = false
    var containerWidth: CGFloat = 260

    @State private var currentPageID: String?
    /// L'URL de la vidéo de la page montrée : c'est ELLE qu'on libère en la
    /// quittant, même si la pièce a quitté la liste entre-temps.
    @State private var shownVideoURL: String?
    /// Les images du carrousel arrivées sur l'appareil : leur badge
    /// « télécharger » se tait (#10370).
    @State private var landedImageIds: Set<String> = []

    private func carouselHeight(width: CGFloat) -> CGFloat {
        // Pager height = max(width / ratio) — pure aspect ratio respect, no
        // cap. A portrait 9:16 slide in the mix dictates the pager height
        // (≈ width × 1.78); landscape slides are letterboxed inside that
        // height with their natural aspect. Voulu pour respecter le format
        // de chaque vidéo.
        let heights = items.map { att -> CGFloat in
            let r = att.videoAspectRatio ?? (16.0 / 9.0)
            return width / r
        }
        // Repli 9:16 — `SceneShape.aspect` (#6896/#6904), site unique du rapport.
        return heights.max() ?? width * SceneShape.aspect
    }

    var body: some View {
        ZStack(alignment: .top) {
            AdaptiveHorizontalPager(
                items: items,
                currentPageID: $currentPageID,
                fillVertical: false,
                carouselTransition: true
            ) { _, attachment in
                carouselPage(attachment)
            }
            .frame(height: carouselHeight(width: containerWidth))

            carouselTopBar
        }
        // Timestamp + delivery state — overlay footer. Aucune vidéo ne joue
        // dans le carrousel (#8231) : il n'a plus de raison de s'effacer.
        .overlay(alignment: .bottomTrailing) {
            BubbleFooter(model: footer, actions: .none, style: .overlay, isDark: isDark)
                .equatable()
                .padding(MeeshySpacing.sm)
        }
        .onAppear {
            guard let start = Self.currentAttachment(at: carouselIndex, in: items) else { return }
            currentPageID = start.id
            shownVideoURL = start.type == .video ? start.fileUrl : nil
        }
        .adaptiveOnChange(of: currentPageID) { oldID, newID in
            guard let newID,
                  let newIndex = items.firstIndex(where: { $0.id == newID })
            else { return }

            carouselIndex = newIndex
            let shown = items[newIndex]

            if oldID != newID {
                // BUG E fix : release (URL-gated) plutôt que pause sur
                // swipe-away — le player ne traîne pas en mémoire. La vidéo
                // QUITTÉE, par son URL : son ancien rang peut désigner une
                // autre pièce si la liste a bougé.
                if let leaving = shownVideoURL, leaving != shown.fileUrl {
                    SharedAVPlayerManager.shared.release(urlString: leaving)
                }
                HapticFeedback.light()
            }
            shownVideoURL = shown.type == .video ? shown.fileUrl : nil

            prefetchAdjacentPages(around: newIndex)
        }
        .adaptiveOnChange(of: items.map(\.id)) { _, _ in
            guard let landing = Self.reanchoredPage(shownId: currentPageID, index: carouselIndex, in: items) else { return }
            carouselIndex = landing.index
            if currentPageID != landing.id { currentPageID = landing.id }
        }
    }

    // MARK: - Top Bar

    private var carouselTopBar: some View {
        HStack(spacing: 0) {
            Button {
                // BUG E fix : libère le player de la slide active (URL-gated).
                if let current = Self.currentAttachment(at: carouselIndex, in: items),
                   current.type == .video {
                    SharedAVPlayerManager.shared.release(urlString: current.fileUrl)
                }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showCarousel = false
                }
                HapticFeedback.light()
            } label: {
                Image(systemName: "xmark")
                    // Doctrine 82i : glyphe de chrome dans un cadre tap fixe 26×26 → figé.
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold))
                    .foregroundStyle(Color.white)
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(.ultraThinMaterial.opacity(MeeshyOpacity.intense)))
                    .overlay(Circle().stroke(Color.white.opacity(MeeshyOpacity.light), lineWidth: MeeshyBorder.hairline))
                    .meeshyTapTarget()
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))

            Spacer()

            if items.count > 1 {
                pageIndicator
            }
        }
        .padding(EdgeInsets(
            top: MeeshySpacing.smPlus - MeeshyTapTarget.inset(forVisualSide: 26),
            leading: MeeshySpacing.smPlus - MeeshyTapTarget.inset(forVisualSide: 26),
            bottom: 0,
            trailing: MeeshySpacing.smPlus
        ))
    }

    // MARK: - Page Indicator

    @ViewBuilder
    private var pageIndicator: some View {
        let accent = Color(hex: contactColor)

        if items.count <= 7 {
            HStack(spacing: MeeshySpacing.xs) {
                ForEach(0..<items.count, id: \.self) { i in
                    Circle()
                        .fill(i == carouselIndex ? accent : Color.white.opacity(MeeshyOpacity.strong))
                        .frame(
                            width: i == carouselIndex ? 7 : 5,
                            height: i == carouselIndex ? 7 : 5
                        )
                        .shadow(
                            color: i == carouselIndex ? accent.opacity(0.6) : .clear,
                            radius: 4
                        )
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: carouselIndex)
                }
            }
            .padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xs)
            .background(
                Capsule()
                    .fill(.ultraThinMaterial.opacity(MeeshyOpacity.heavy))
                    .overlay(Capsule().stroke(Color.white.opacity(MeeshyOpacity.subtle), lineWidth: MeeshyBorder.hairline))
            )
        } else {
            Text("\(carouselIndex + 1) / \(items.count)")
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold, design: .monospaced))
                .foregroundStyle(Color.white)
                .padding(.horizontal, MeeshySpacing.smPlus)
                .padding(.vertical, MeeshySpacing.xs)
                .background(
                    Capsule()
                        .fill(.ultraThinMaterial.opacity(MeeshyOpacity.heavy))
                        .overlay(Capsule().stroke(Color.white.opacity(MeeshyOpacity.subtle), lineWidth: MeeshyBorder.hairline))
                )
                .contentTransition(.numericText())
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: carouselIndex)
        }
    }

    // MARK: - Carousel Page

    @ViewBuilder
    private func carouselPage(_ attachment: MessageAttachment) -> some View {
        ZStack {
            Color.black

            switch attachment.type {
            case .image:
                carouselImageCell(attachment)
            case .video:
                carouselVideoCell(attachment)
            default:
                EmptyView()
            }
        }
        .frame(height: carouselHeight(width: containerWidth))
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture {
            fullscreenAttachment = attachment
            HapticFeedback.light()
        }
        .overlay(alignment: .bottom) {
            DownloadBadgeView(
                attachment: attachment,
                accentColor: contactColor,
                messageDeliveryStatus: messageDeliveryStatus,
                onShareFile: { _ in },
                displayedImageLanded: landedImageIds.contains(attachment.id)
            )
            .padding(.bottom, MeeshySpacing.sm)
        }
    }

    // MARK: - Image Cell

    @ViewBuilder
    private func carouselImageCell(_ attachment: MessageAttachment) -> some View {
        let fullUrl = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
        let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
        if fullUrl != nil || thumbUrl != nil || attachment.thumbHash != nil {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: thumbUrl,
                fullUrl: fullUrl ?? thumbUrl,
                onFullImageLoaded: { _ = landedImageIds.insert(attachment.id) }
            ) {
                Color(hex: attachment.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fit)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
        } else {
            Color(hex: attachment.thumbnailColor)
                .overlay(
                    Image(systemName: "photo")
                        .font(MeeshyFont.relative(MeeshyIconSize.xxxl))
                        .foregroundStyle(Color.white.opacity(0.4))
                        .accessibilityHidden(true)
                )
        }
    }

    // MARK: - Video Cell

    /// Même lecteur que la tuile (#8231) : trois contrôles, et le toucher de
    /// la vidéo hors contrôles ouvre le plein écran.
    private func carouselVideoCell(_ attachment: MessageAttachment) -> some View {
        VideoAvailabilityResolver(attachment: attachment) { availability, onDownload in
            MeeshyVideoPlayer(
                attachment: attachment,
                style: .inline,
                controls: .inlineMinimal,
                accentColor: contactColor,
                frame: .bubble,
                availability: availability,
                performance: .carousel,
                surfaceTapExpands: true,
                onDownload: onDownload,
                onExpand: { fullscreenAttachment = attachment }
            )
        }
            .overlay(alignment: .bottom) {
                MediaConsumptionProgressBar(
                    attachmentId: attachment.id,
                    accentHex: contactColor,
                    servedConsumption: attachment.currentUserConsumption,
                    totalDuration: Double(attachment.duration ?? 0) / 1000.0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Prefetch

    /// Pure gate: should this attachment kind be prefetched given the
    /// resolved auto-download policy? Extracted so the wiring in
    /// `prefetchAdjacentPages` (2026-07-21 fix — the ±1 carousel neighbor
    /// prefetch previously ignored `MediaDownloadPolicyEngine` entirely,
    /// burning cellular data against 'Never'/'Wi-Fi only') is testable
    /// without spinning up the full carousel view.
    nonisolated static func shouldPrefetchAttachment(
        kind: MessageAttachment.AttachmentType,
        allowImage: Bool,
        allowVideo: Bool
    ) -> Bool {
        kind == .video ? allowVideo : allowImage
    }

    private func prefetchAdjacentPages(around index: Int) {
        let prefetchRange = max(0, index - 1)...min(items.count - 1, index + 1)
        // Respect the user's auto-download policy — mirrors
        // ConversationMediaHandler.prefetchRecentMedia. Without this gate the
        // ±1 neighbor prefetch pulled full-size media over cellular
        // regardless of the 'Never'/'Wi-Fi only' preference.
        let condition = NetworkConditionMonitor.shared.condition
        let prefs = MediaDownloadPreferencesStore.shared.preferences
        let allowImage = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: condition, prefs: prefs)
        let allowVideo = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: condition, prefs: prefs)
        for i in prefetchRange {
            let attachment = items[i]
            guard Self.shouldPrefetchAttachment(kind: attachment.type, allowImage: allowImage, allowVideo: allowVideo) else { continue }
            // BUG C fix : pour une vidéo, NE JAMAIS prefetch le body MP4 dans
            // le cache image (téléchargement complet + échec de décodage
            // UIImage). On prefetch le thumbnail uniquement ; si absent, skip.
            let urlStr: String = attachment.type == .video
                ? (attachment.thumbnailUrl ?? "")
                : (attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl)
            guard !urlStr.isEmpty else { continue }
            Task {
                _ = await CacheCoordinator.shared.images.image(
                    for: MeeshyConfig.resolveMediaURL(urlStr)?.absoluteString ?? urlStr
                )
            }
        }
    }
}
