// MARK: - BubbleStandardLayout — visual media grid, carousel + satellites
//
// Companion file to `BubbleStandardLayout.swift`. Holds the visual-media
// concerns that crowd the orchestrator body :
//
//   1. `extension BubbleStandardLayout` :
//      - `visualMediaGrid` : 1/2/3/4+ grid layout dispatcher
//      - `makeGridCell(_:overflowCount:solo:)` : cell factory
//      - `carouselView` : façade instantiating `BubbleCarouselView`
//      - `downloadBadge(_:)` : per-attachment download chip
//      - `mediaWithReplyContainer(reply:)` : visual + quoted reply combo
//
//   2. Satellite structs (fileprivate / standalone) :
//      - `BubbleGridCell` : 1 grid slot (image or video)
//      - `BubbleGridImageView` / `BubbleGridVideoThumbnailView`
//      - `AttachmentBlurOverlayView`
//      - `BubbleCarouselView` : standalone pager, swipe between slides
//
// History : was originally `ThemedMessageBubble+Media.swift` (extension on
// `ThemedMessageBubble`). Task-14 pivot of the bubble-decompose refactor
// moved rendering into `BubbleStandardLayout` ; this file was renamed
// alongside that pivot to match what it actually extends.

import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Visual Media Grid (extension on BubbleStandardLayout)
extension BubbleStandardLayout {

    @ViewBuilder
    var visualMediaGrid: some View {
        let items = visualAttachments

        // Largeur en points d'une cellule moitié (cases 2 & 4) — sert à choisir
        // la variante d'image adaptée (5.2).
        let halfW = (gridMaxWidth - gridSpacing) / 2

        switch items.count {
        case 1:
            let item = items[0]
            if item.type == .video {
                // Video : the cell fills the bubble width, and the renderer's
                // own `.aspectRatio(videoAspectRatio, .fit)` drives the height
                // intrinsically from the source ratio — no cap. Portrait 9:16
                // becomes tall (≈ width × 1.78), landscape 16:9 becomes short
                // (≈ width × 0.56). Replaces the legacy hardcoded `height: 200`
                // that squashed portrait sources.
                makeGridCell(item, cellPointWidth: gridMaxWidth, solo: true)
                    .frame(width: gridMaxWidth)
            } else {
                makeGridCell(item, cellPointWidth: gridMaxWidth, solo: true)
                    .frame(width: gridMaxWidth, height: 240)
            }

        case 2:
            HStack(spacing: gridSpacing) {
                makeGridCell(items[0], cellPointWidth: halfW)
                makeGridCell(items[1], cellPointWidth: halfW)
            }
            .frame(width: gridMaxWidth, height: 180)

        case 3:
            let leftW = (gridMaxWidth - gridSpacing) * 0.6
            let rightW = (gridMaxWidth - gridSpacing) * 0.4
            HStack(spacing: gridSpacing) {
                makeGridCell(items[0], cellPointWidth: leftW)
                    .frame(width: leftW)
                VStack(spacing: gridSpacing) {
                    makeGridCell(items[1], cellPointWidth: rightW)
                    makeGridCell(items[2], cellPointWidth: rightW)
                }
                .frame(width: rightW)
            }
            .frame(width: gridMaxWidth, height: 240)

        default:
            let overflow = items.count - 4
            VStack(spacing: gridSpacing) {
                HStack(spacing: gridSpacing) {
                    makeGridCell(items[0], cellPointWidth: halfW)
                    makeGridCell(items[1], cellPointWidth: halfW)
                }
                HStack(spacing: gridSpacing) {
                    makeGridCell(items[2], cellPointWidth: halfW)
                    makeGridCell(items[3], cellPointWidth: halfW, overflowCount: max(0, overflow))
                }
            }
            .frame(width: gridMaxWidth, height: 240)
        }
    }

    /// Builds a `BubbleGridCell` for the given attachment.
    ///
    /// Why this exists: The previous in-extension `@ViewBuilder gridCell(...)
    /// -> some View` produced a deeply nested
    /// `_ConditionalContent<TupleView<...>, _ConditionalContent<...>>` chain
    /// (4+ branches: image vs video, overflow overlay, view-once badge,
    /// blur overlay, download badge overlay). Combined with the 4-branch
    /// `switch items.count` in `visualMediaGrid` calling `gridCell` 1-4
    /// times each, the resulting opaque `some View` type was so large that
    /// the runtime type-demangler hit its recursion limit and crashed in
    /// `swift_getTypeByMangledNameInContextImpl` -> `decodeMangledType` ->
    /// `decodeGenericArgs` (~30 levels deep) the moment a message with
    /// 2+ visual attachments rendered.
    ///
    /// Extracting the cell into a concrete `BubbleGridCell` struct collapses
    /// every call site to a single nominal type. Demangling a named struct
    /// is bounded; demangling a 4-deep `_ConditionalContent` tree per call
    /// site is not. This also lets SwiftUI cache the cell's structural
    /// identity across body re-evaluations.
    fileprivate func makeGridCell(_ attachment: MessageAttachment, cellPointWidth: CGFloat, overflowCount: Int = 0, solo: Bool = false) -> BubbleGridCell {
        BubbleGridCell(
            attachment: attachment,
            overflowCount: overflowCount,
            solo: solo,
            contactColor: contactColor,
            allVisualAttachments: visualAttachments,
            messageId: message.id,
            messageDeliveryStatus: message.deliveryStatus,
            cellPointWidth: cellPointWidth,
            revealedAttachmentIds: $revealedAttachmentIds,
            carouselIndex: $carouselIndex,
            showCarousel: $showCarousel,
            fullscreenAttachment: $fullscreenAttachment,
            shareURL: $shareURL,
            showShareSheet: $showShareSheet,
            onConsumeViewOnce: onConsumeViewOnce
        )
    }

    // MARK: - Carousel View (inline within message, for browsing this message's media)

    @ViewBuilder
    var carouselView: some View {
        BubbleCarouselView(
            items: visualAttachments,
            carouselIndex: $carouselIndex,
            showCarousel: $showCarousel,
            fullscreenAttachment: $fullscreenAttachment,
            contactColor: contactColor,
            messageDeliveryStatus: message.deliveryStatus,
            footer: resolvedFooter().0,
            isDark: isDark,
            containerWidth: gridMaxWidth,
            hasPlayingInlineVideo: hasPlayingInlineVideo
        )
    }

    // MARK: - Download Badge (still used by extension callers — kept for backward compat)

    func downloadBadge(_ attachment: MessageAttachment) -> some View {
        DownloadBadgeView(
            attachment: attachment,
            accentColor: contactColor,
            messageDeliveryStatus: message.deliveryStatus,
            onShareFile: { url in
                shareURL = url
                showShareSheet = true
            }
        )
    }

    // MARK: - Media + Reply unified container (visual-only reply)

    /// Conteneur unifié pour un message reply visual-only : citation (inline)
    /// au-dessus + grille visuelle, partageant une bordure RR16 et un fond
    /// neutre. Aucune chat bubble parasite. Footer style `.overlay` épinglé
    /// bottom-trailing sur la grille, identique au visual standalone.
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.5
    @ViewBuilder
    func mediaWithReplyContainer(reply: BubbleContent.Reply) -> some View {
        let neutralBg = isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)
        let strokeColor = isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.05)
        let dividerColor = isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.06)

        VStack(spacing: 0) {
            BubbleQuotedReply(
                style: .inline,
                reply: reply.reference,
                parentIsMe: false,
                accentHex: contactColor,
                isDark: isDark,
                mentionDisplayNames: mentionDisplayNames
            )
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(neutralBg)
            .contentShape(Rectangle())
            .onTapGesture {
                guard !reply.reference.messageId.isEmpty else { return }
                HapticFeedback.light()
                if reply.isStory {
                    onStoryReplyTap?(reply.reference.messageId)
                } else {
                    onReplyTap?(reply.reference.messageId)
                }
            }

            Divider().background(dividerColor)

            visualMediaGrid
                .background(Color.black)
                .overlay(alignment: .bottomTrailing) {
                    // Footer caché pendant la lecture d'une vidéo inline —
                    // évite la collision avec les contrôles overlay au
                    // bottom de la vidéo.
                    if !hasPlayingInlineVideo {
                        BubbleFooter(
                            model: resolvedFooter().0,
                            actions: .none,
                            style: .overlay,
                            isDark: isDark
                        )
                        .equatable()
                        .padding(8)
                        .transition(.opacity)
                    }
                }
        }
        .compositingGroup()
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(strokeColor, lineWidth: 0.5)
        )
        .transition(.opacity.combined(with: .scale(scale: 0.98)))
    }
}

// MARK: - BubbleGridCell (concrete struct, replaces former @ViewBuilder gridCell)

/// Renders one cell of the message-bubble visual media grid.
///
/// This struct exists to break the runtime type-demangling crash that hit
/// `swift_getTypeByMangledNameInContextImpl` once a message contained two or
/// more visual attachments. The previous `@ViewBuilder gridCell(...) -> some
/// View` returned an opaque type whose mangled signature (4-branch switch
/// + 3 conditional overlays + per-call-site re-instantiation in
/// `visualMediaGrid`) overflowed the demangler's recursion limit.
///
/// A nominal struct collapses each call site to a single bounded type, which
/// the runtime can resolve in O(1) recursion depth. This also lets SwiftUI
/// preserve the cell's structural identity across `ThemedMessageBubble.body`
/// re-evaluations and skip rebuild when the bindings haven't actually changed.
fileprivate struct BubbleGridCell: View {
    let attachment: MessageAttachment
    let overflowCount: Int
    let solo: Bool
    let contactColor: String
    let allVisualAttachments: [MessageAttachment]
    let messageId: String
    let messageDeliveryStatus: Message.DeliveryStatus
    /// Largeur en points de cette cellule (par branche de `visualMediaGrid`),
    /// threadée jusqu'à `BubbleGridImageView` pour la sélection de variante (5.2).
    let cellPointWidth: CGFloat

    @Binding var revealedAttachmentIds: Set<String>
    @Binding var carouselIndex: Int
    @Binding var showCarousel: Bool
    @Binding var fullscreenAttachment: MessageAttachment?
    @Binding var shareURL: URL?
    @Binding var showShareSheet: Bool

    /// Forwarded from ThemedMessageBubble — fired when the user reveals a
    /// view-once attachment. The closure consumes the view-once entitlement
    /// on the gateway and then calls back with the success flag.
    let onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?

    private var attachmentIsProtected: Bool {
        attachment.isViewOnce || attachment.isBlurred
    }

    private var isRevealed: Bool {
        revealedAttachmentIds.contains(attachment.id)
    }

    var body: some View {
        if attachment.type == .video, !attachmentIsProtected || isRevealed {
            videoBody
        } else {
            standardBody
        }
    }

    /// Standard layout — image cells, protected/blurred video, or any future
    /// media kind. Tap = fullscreen, DownloadBadge centred (no competing
    /// play affordance underneath).
    private var standardBody: some View {
        ZStack {
            Color.black
            mediaLayer
            overflowOverlay
            blurOverlay
            viewCountBadge
        }
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture(perform: handleTap)
        .overlay { downloadBadgeOverlay }
    }

    /// Inline video player path. `VideoAvailabilityResolver` resolves download
    /// policy and passes `VideoAvailability` to `MeeshyVideoPlayer`, which owns
    /// the play affordance, download badge, and fullscreen expand button.
    ///
    /// PAS de `.frame(maxWidth: .infinity, maxHeight: .infinity)` sur le
    /// `VideoAvailabilityResolver` : ça écraserait la contrainte d'`.aspectRatio`
    /// posée par le `_InlineRenderer` interne, et la bulle s'aplatirait en
    /// paysage au moment du tap-play. Le ratio est piloté EXCLUSIVEMENT par
    /// le renderer du SDK qui reporte sa frame naturelle (`width × W/ratio`)
    /// à ce ZStack, lequel se sizes dessus.
    private var videoBody: some View {
        ZStack {
            Color.black
            VideoAvailabilityResolver(attachment: attachment) { availability, onDownload in
                MeeshyVideoPlayer(
                    attachment: attachment,
                    style: .inline,
                    controls: .inlineDefault,
                    accentColor: contactColor,
                    frame: .bubble,
                    availability: availability,
                    performance: .inline,
                    onDownload: onDownload,
                    onExpand: { fullscreenAttachment = attachment }
                )
            }
            overflowOverlay
            viewCountBadge
        }
        .clipped()
    }

    // MARK: - Sub-Views (each returns `some View` but at one bounded depth)

    @ViewBuilder
    private var mediaLayer: some View {
        switch attachment.type {
        case .image:
            BubbleGridImageView(attachment: attachment, cellPointWidth: cellPointWidth)
        case .video:
            BubbleGridVideoThumbnailView(attachment: attachment, contactColor: contactColor, solo: solo)
        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private var overflowOverlay: some View {
        if overflowCount > 0 {
            Color.black.opacity(0.5)
            Text("+\(overflowCount)")
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.white)
        }
    }

    @ViewBuilder
    private var blurOverlay: some View {
        if attachmentIsProtected && !isRevealed {
            AttachmentBlurOverlayView(
                isViewOnce: attachment.isViewOnce,
                onReveal: handleReveal
            )
        }
    }

    @ViewBuilder
    private var viewCountBadge: some View {
        if attachment.isViewOnce && attachment.viewOnceCount > 0 {
            VStack {
                HStack {
                    Spacer()
                    Text("\(attachment.viewOnceCount)")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .frame(width: 18, height: 18)
                        .background(
                            Circle()
                                .fill(MeeshyColors.error.opacity(0.85))
                        )
                }
                .padding(6)
                Spacer()
            }
            .accessibilityLabel(Text(String(localized: "bubble.media.a11y.viewCount", defaultValue: "\(attachment.viewOnceCount) vue\(attachment.viewOnceCount > 1 ? "s" : "")", bundle: .main)))
        }
    }

    @ViewBuilder
    private var downloadBadgeOverlay: some View {
        if !attachmentIsProtected || isRevealed {
            DownloadBadgeView(
                attachment: attachment,
                accentColor: contactColor,
                messageDeliveryStatus: messageDeliveryStatus,
                compact: attachment.type == .video,
                onShareFile: { url in
                    shareURL = url
                    showShareSheet = true
                }
            )
        }
    }

    // MARK: - Actions

    private func handleTap() {
        guard !attachmentIsProtected || isRevealed else { return }
        if overflowCount > 0 {
            carouselIndex = allVisualAttachments.firstIndex(where: { $0.id == attachment.id }) ?? 0
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                showCarousel = true
            }
        } else {
            fullscreenAttachment = attachment
        }
        HapticFeedback.light()
    }

    private func handleReveal() {
        HapticFeedback.medium()
        if attachment.isViewOnce {
            onConsumeViewOnce?(messageId) { success in
                guard success else { return }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    _ = revealedAttachmentIds.insert(attachment.id)
                }
                let attachmentId = attachment.id
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                    withAnimation(.easeOut(duration: 0.5)) {
                        _ = revealedAttachmentIds.remove(attachmentId)
                    }
                }
            }
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                _ = revealedAttachmentIds.insert(attachment.id)
            }
        }
    }
}

// MARK: - BubbleGridImageView (extracted so its `some View` is bounded)

fileprivate struct BubbleGridImageView: View {
    let attachment: MessageAttachment
    /// Largeur en points de la cellule (décidée par `visualMediaGrid`). Sert à
    /// choisir la variante d'image la plus légère suffisante (bande passante 5.2).
    let cellPointWidth: CGFloat

    var body: some View {
        let originalFull = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
        let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil

        // 5.2 — choisir la plus petite variante `>= largeur d'affichage en px`
        // (atome pur SDK). Sans variante (image chiffrée) → `originalFull`.
        let targetWidthPx = Int((cellPointWidth * UIScreen.main.scale).rounded())
        let selectedFull: String? = originalFull.map { orig in
            ImageVariantSelector.bestImageURL(
                variants: attachment.imageVariants ?? [],
                originalURL: orig,
                originalWidth: attachment.width,
                targetWidthPx: targetWidthPx
            )
        }
        // N6 — quand une variante allégée est choisie (≠ original), le thumbHash
        // couvre déjà le remplissage instantané : on saute le tier thumbnail pour
        // ne pas télécharger thumbnail + variante.
        let pickedLighterVariant = selectedFull != nil && selectedFull != originalFull
        let effectiveThumb = pickedLighterVariant ? nil : thumbUrl
        let urlStr = selectedFull ?? thumbUrl ?? ""

        if !urlStr.isEmpty {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: effectiveThumb,
                fullUrl: selectedFull,
                targetSize: CGSize(width: cellPointWidth, height: cellPointWidth)
            ) {
                Color(hex: attachment.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()
        } else {
            Color(hex: attachment.thumbnailColor)
                .overlay(Image(systemName: "photo").foregroundColor(.white.opacity(0.5)))
        }
    }
}

// MARK: - BubbleGridVideoThumbnailView (extracted so its `some View` is bounded)

fileprivate struct BubbleGridVideoThumbnailView: View {
    let attachment: MessageAttachment
    let contactColor: String
    let solo: Bool

    var body: some View {
        ZStack {
            thumbnailLayer
            playIconOverlay
            durationBadge
        }
    }

    @ViewBuilder
    private var thumbnailLayer: some View {
        let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
        if thumbUrl != nil || attachment.thumbHash != nil {
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: thumbUrl,
                fullUrl: thumbUrl
            ) {
                Color(hex: attachment.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()
        } else {
            Color(hex: attachment.thumbnailColor)
        }
    }

    private var playIconOverlay: some View {
        ZStack {
            Circle()
                .fill(.ultraThinMaterial)
                .frame(width: solo ? 48 : 36, height: solo ? 48 : 36)
            Circle()
                .fill(Color(hex: contactColor).opacity(0.85))
                .frame(width: solo ? 42 : 30, height: solo ? 42 : 30)
            Image(systemName: "play.fill")
                .font(.system(size: solo ? 18 : 12, weight: .bold))
                .foregroundColor(.white)
                .offset(x: solo ? 2 : 1)
        }
        .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
    }

    @ViewBuilder
    private var durationBadge: some View {
        if let formatted = attachment.durationFormatted {
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    Text(formatted)
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.black.opacity(0.6)))
                }
                .padding(.trailing, 4)
                .padding(.bottom, 4)
            }
        }
    }
}

// MARK: - Attachment Blur Overlay (standalone struct to avoid type-checker ambiguity)

private struct AttachmentBlurOverlayView: View {
    let isViewOnce: Bool
    let onReveal: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.5)
                .background(.ultraThinMaterial)

            VStack(spacing: 5) {
                Image(systemName: "eye.slash.fill")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(.white)

                Text(isViewOnce ? String(localized: "bubble.media.viewOnce", defaultValue: "Voir une fois", bundle: .main) : String(localized: "bubble.media.masked", defaultValue: "Contenu masque", bundle: .main))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.white)

                Text(String(localized: "bubble.media.holdToView", defaultValue: "Maintenir pour voir", bundle: .main))
                    .font(.system(size: 9))
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(isViewOnce ? String(localized: "bubble.media.a11y.viewOnce", defaultValue: "Media a voir une fois", bundle: .main) : String(localized: "bubble.media.a11y.masked", defaultValue: "Media masque", bundle: .main))
        .accessibilityHint(String(localized: "bubble.media.a11y.holdToReveal", defaultValue: "Maintenir pour reveler le contenu", bundle: .main))
        .onLongPressGesture(minimumDuration: 0.3) {
            onReveal()
        }
    }
}

// MARK: - Bubble Carousel View (Native Paging + Elegant Transitions)

struct BubbleCarouselView: View {
    let items: [MessageAttachment]
    @Binding var carouselIndex: Int
    @Binding var showCarousel: Bool
    @Binding var fullscreenAttachment: MessageAttachment?
    let contactColor: String
    let messageDeliveryStatus: Message.DeliveryStatus
    var footer: BubbleFooterModel = .empty
    var isDark: Bool = false
    var containerWidth: CGFloat = 260
    /// Mirror of `BubbleStandardLayout.hasPlayingInlineVideo` — passed in
    /// by `carouselView` so the carousel hides its `BubbleFooter` overlay
    /// (timestamp + delivery state) while one of its video slides is the
    /// active inline player. Avoids collision with the overlay controls
    /// drawn over the video. Defaults to `false` for non-bubble callers.
    var hasPlayingInlineVideo: Bool = false

    @State private var currentPageID: String?

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
        return heights.max() ?? width * 9 / 16
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
        // Timestamp + delivery state — overlay footer, masqué pendant la
        // lecture d'une vidéo inline pour libérer le bottom-trailing.
        .overlay(alignment: .bottomTrailing) {
            if !hasPlayingInlineVideo {
                BubbleFooter(model: footer, actions: .none, style: .overlay, isDark: isDark)
                    .equatable()
                    .padding(8)
            }
        }
        .onAppear {
            let startIndex = max(0, min(carouselIndex, items.count - 1))
            currentPageID = items[startIndex].id
        }
        .adaptiveOnChange(of: currentPageID) { _, newID in
            guard let newID,
                  let newIndex = items.firstIndex(where: { $0.id == newID })
            else { return }

            let oldIndex = carouselIndex
            carouselIndex = newIndex

            if oldIndex != newIndex {
                let oldAttachment = items[oldIndex]
                if oldAttachment.type == .video {
                    // BUG E fix : release (URL-gated) plutôt que pause sur
                    // swipe-away — vide `activeURL` pour que la bulle réaffiche
                    // son footer et que le player ne traîne pas en mémoire.
                    SharedAVPlayerManager.shared.release(urlString: oldAttachment.fileUrl)
                }
                HapticFeedback.light()
            }

            prefetchAdjacentPages(around: newIndex)
        }
    }

    // MARK: - Top Bar

    private var carouselTopBar: some View {
        HStack(spacing: 0) {
            Button {
                // BUG E fix : libère le player de la slide active (URL-gated)
                // pour vider `activeURL`, sinon `hasPlayingInlineVideo` reste
                // vrai et le footer de la bulle reste masqué après fermeture.
                let current = items[max(0, min(carouselIndex, items.count - 1))]
                if current.type == .video {
                    SharedAVPlayerManager.shared.release(urlString: current.fileUrl)
                }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showCarousel = false
                }
                HapticFeedback.light()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(.ultraThinMaterial.opacity(0.8)))
                    .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 0.5))
            }

            Spacer()

            if items.count > 1 {
                pageIndicator
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 10)
    }

    // MARK: - Page Indicator

    @ViewBuilder
    private var pageIndicator: some View {
        let accent = Color(hex: contactColor)

        if items.count <= 7 {
            HStack(spacing: 5) {
                ForEach(0..<items.count, id: \.self) { i in
                    Circle()
                        .fill(i == carouselIndex ? accent : Color.white.opacity(0.45))
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
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(.ultraThinMaterial.opacity(0.7))
                    .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.5))
            )
        } else {
            Text("\(carouselIndex + 1) / \(items.count)")
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(.ultraThinMaterial.opacity(0.7))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.5))
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
                onShareFile: { _ in }
            )
            .padding(.bottom, 8)
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
                fullUrl: fullUrl ?? thumbUrl
            ) {
                Color(hex: attachment.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fit)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
        } else {
            Color(hex: attachment.thumbnailColor)
                .overlay(
                    Image(systemName: "photo")
                        .font(.system(size: 28))
                        .foregroundColor(.white.opacity(0.4))
                )
        }
    }

    // MARK: - Video Cell

    @ViewBuilder
    private func carouselVideoCell(_ attachment: MessageAttachment) -> some View {
        VideoAvailabilityResolver(attachment: attachment) { availability, onDownload in
            MeeshyVideoPlayer(
                attachment: attachment,
                style: .inline,
                controls: .inlineDefault,
                accentColor: contactColor,
                frame: .bubble,
                availability: availability,
                performance: .carousel,
                onDownload: onDownload,
                onExpand: { fullscreenAttachment = attachment }
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Prefetch

    private func prefetchAdjacentPages(around index: Int) {
        let prefetchRange = max(0, index - 1)...min(items.count - 1, index + 1)
        for i in prefetchRange {
            let attachment = items[i]
            // BUG C fix : pour une vidéo, NE JAMAIS prefetch le body MP4 dans
            // le cache image (téléchargement complet + échec de décodage
            // UIImage). On prefetch le thumbnail uniquement ; si absent, skip.
            let urlStr: String = attachment.type == .video
                ? (attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl! : "")
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
