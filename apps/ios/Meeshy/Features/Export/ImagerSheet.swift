import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **LA VUE « IMAGER » D'UNE ŒUVRE COMPOSÉE** (#14325) — story, post à scène,
/// réel, scène d'une galerie. Titrée « Imagine » comme l'atelier d'un message :
/// elle montre l'œuvre, offre au-delà d'une minute 1/4 · 2/4 · 3/4 · 4/4 depuis
/// le début (#13871, tout par défaut), puis « Sauvegarder » range la part
/// choisie dans Photos et « Partager » la remet à la feuille du système.
/// Rien ne se rend avant l'un de ces deux gestes ; « Annuler » arrête le rendu
/// en vol. Sauvegarder emprunte l'anneau d'« Enregistrer » : la feuille peut se
/// fermer, le rendu continue et son toast arrive quand même.
struct ImagerSheet: View {
    let work: ImagerWork
    @ObservedObject var service: StoryPhotoSaveService
    let onClose: () -> Void

    @State private var quarter: ImagerQuarter = .four
    @State private var saving = false
    @State private var shareTask: Task<Void, Never>?
    @State private var shareProgress: Double?
    @State private var shared: ImagerSharedFile?
    @State private var failed = false
    @State private var preview: UIImage?
    @Environment(\.displayScale) private var displayScale

    private static let previewSize = CGSize(width: 216, height: 384)
    private var accent: Color { MeeshyColors.indigo500 }

    private var chosen: ImagerQuarter? { work.choices.isEmpty ? nil : quarter }
    private var saveProgress: Double? { service.progress(for: work.id) }
    private var progress: Double? { saveProgress ?? shareProgress }
    private var busy: Bool { progress != nil }

    var body: some View {
        NavigationStack {
            VStack(spacing: MeeshySpacing.lg) {
                stage
                if !work.choices.isEmpty { lengthPicker }
                Spacer(minLength: 0)
                status
                actions
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md)
            .navigationTitle(MessageCardExportText.text("export.card.title", "Imagine"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(MessageCardExportText.text("common.cancel", "Annuler")) { cancel() }
                }
            }
        }
        .tint(accent)
        .task { await paintPreview() }
        .adaptiveOnChange(of: saveProgress == nil) { _, idle in
            guard idle, saving else { return }
            onClose()
        }
        .sheet(item: $shared) { file in
            ShareSheet(activityItems: [file.url]) { _ in
                service.discardImaged(file.url)
                shared = nil
                onClose()
            }
        }
        .onDisappear { shareTask?.cancel() }
    }

    // MARK: - Aperçu

    private var stage: some View {
        ZStack(alignment: .bottomTrailing) {
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(Color.black)
            if let preview {
                Image(uiImage: preview)
                    .resizable()
                    .scaledToFill()
            }
            if !work.isStill {
                Text(ImagerPresenter.clock(work.total))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .padding(.horizontal, MeeshySpacing.sm)
                    .padding(.vertical, MeeshySpacing.xs)
                    .background(Capsule().fill(Color.black.opacity(0.55)))
                    .padding(MeeshySpacing.sm)
            }
        }
        .frame(width: Self.previewSize.width, height: Self.previewSize.height)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MessageCardExportText.text("export.card.title", "Imagine"))
        .accessibilityValue(work.isStill ? "" : ImagerPresenter.clock(work.total))
    }

    private func paintPreview() async {
        guard let slide = work.slides.first else { return }
        let paint = { (images: [String: UIImage], background: UIImage?) in
            SceneThumbnailRenderer.thumbnail(slide: slide, bgImage: background, loadedImages: images,
                                             size: Self.previewSize, scale: displayScale)
        }
        preview = paint([:], nil)
        let sources = ImagerPreviewSources.of(slide, media: work.stickerMedia)
        guard !sources.isEmpty else { return }
        let loader = DiskCacheImageLoader()
        var images: [String: UIImage] = [:]
        for (key, url) in sources.layers {
            if let image = await loader.image(for: url) { images[key] = image }
        }
        for (key, url) in sources.videoFrames where images[key] == nil {
            guard let file = URL(string: url) else { continue }
            images[key] = await VideoThumbnailGenerator.shared.image(for: .firstFrame(of: file, maxDimension: 1080))
        }
        var background: UIImage?
        if let url = sources.background { background = await loader.image(for: url) }
        guard !Task.isCancelled else { return }
        preview = paint(images, background)
    }

    // MARK: - Longueur

    private var lengthPicker: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "export.imager.length.title", defaultValue: "Quelle durée imager ?", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                Text(String(localized: "export.imager.length.subtitle", defaultValue: "Depuis le début", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize))
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(work.choices, id: \.quarter) { choice in
                    lengthChip(choice)
                }
            }
        }
        .disabled(busy)
    }

    private func lengthChip(_ choice: ImagerLengthChoice) -> some View {
        let selected = choice.quarter == quarter
        return Button {
            HapticFeedback.light()
            quarter = choice.quarter
        } label: {
            VStack(spacing: 2) {
                Text(verbatim: "\(choice.quarter.rawValue.formatted())/\(ImagerQuarter.four.rawValue.formatted())")
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                Text(ImagerPresenter.clock(choice.duration))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize))
                    .monospacedDigit()
            }
            .foregroundStyle(selected ? Color.white : Color.primary)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(selected ? accent : Color.secondary.opacity(0.15))
            )
            .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ImagerPresenter.label(for: choice))
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    // MARK: - Gestes

    @ViewBuilder
    private var status: some View {
        if let progress {
            ProgressView(value: progress) {
                Text(String(format: String(localized: "story.export.share.exporting", defaultValue: "Export en cours… %lld%%"),
                            Int(progress * 100)))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .tint(accent)
        } else if failed {
            Text(String(localized: "story.export.share.errorTitle", defaultValue: "Export impossible"))
                .font(.footnote)
                .foregroundStyle(MeeshyColors.error)
        }
    }

    private var actions: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Button { save() } label: {
                Label(MessageCardExportText.text("export.card.save", "Sauvegarder"), systemImage: "square.and.arrow.down")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .adaptiveGlassProminent(in: Capsule(), tint: accent)
            Button { share() } label: {
                Label(MessageCardExportText.text("export.card.share", "Partager"), systemImage: "square.and.arrow.up")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .adaptiveGlass(in: Capsule(), interactive: true)
        }
        .disabled(busy)
        .opacity(busy ? 0.6 : 1)
    }

    private func save() {
        guard !busy else { return }
        HapticFeedback.medium()
        failed = false
        saving = true
        service.saveImaged(work, quarter: chosen)
    }

    private func share() {
        guard !busy else { return }
        HapticFeedback.light()
        failed = false
        shareProgress = 0
        let quarter = chosen
        shareTask = Task {
            let url = await service.renderImaged(work, quarter: quarter) { fraction in shareProgress = fraction }
            guard !Task.isCancelled else {
                if let url { service.discardImaged(url) }
                return
            }
            shareProgress = nil
            guard let url else {
                failed = true
                return
            }
            shared = ImagerSharedFile(url: url)
        }
    }

    private func cancel() {
        shareTask?.cancel()
        if saving, service.isCancellable(storyId: work.id) { service.cancel(storyId: work.id) }
        onClose()
    }
}

private struct ImagerSharedFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// **Les images que l'aperçu peint, par calque** : un fond legacy, chaque média
/// posé et chaque sticker image, depuis les médias que l'œuvre transporte. Une
/// vidéo se peint par sa vignette, sinon par sa première image (`videoFrames`).
/// Un média publié porte une CLÉ de stockage que le cache d'images ne charge
/// pas telle quelle : chaque source est rendue à son adresse (#14338).
nonisolated struct ImagerPreviewSources: Equatable {
    let background: String?
    let layers: [String: String]
    let videoFrames: [String: String]

    var isEmpty: Bool { background == nil && layers.isEmpty && videoFrames.isEmpty }

    static func of(_ slide: StorySlide, media: [FeedMedia]) -> ImagerPreviewSources {
        let byId = Dictionary(media.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let objects = slide.effects.mediaObjects ?? []
        let pictures = objects.compactMap { object -> (String, String)? in
            let item = byId[object.postMediaId]
            let raw = object.kind == .video ? item?.thumbnailUrl : (object.mediaURL ?? item?.url)
            return address(raw).map { (object.id, $0) }
        }
        let videos = objects.filter { $0.kind == .video }.compactMap { object -> (String, String)? in
            address(object.mediaURL ?? byId[object.postMediaId]?.url).map { (object.id, $0) }
        }
        let stickers = (slide.effects.stickerObjects ?? []).compactMap { sticker -> (String, String)? in
            address(byId[sticker.postMediaId]?.url).map { (sticker.id, $0) }
        }
        return ImagerPreviewSources(
            background: address(slide.mediaURL),
            layers: Dictionary(pictures + stickers, uniquingKeysWith: { first, _ in first }),
            videoFrames: Dictionary(videos, uniquingKeysWith: { first, _ in first }))
    }

    private static func address(_ raw: String?) -> String? {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        return MeeshyConfig.resolveMediaURL(raw)?.absoluteString
    }
}
