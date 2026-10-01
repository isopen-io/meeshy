import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - Ce que « Sauvegarder » et « Partager » produisent (#8692)

extension MessageCardExportSheet {

    /// Les sorties que le contenu OFFRE : une vidéo s'anime en GIF comme en
    /// vidéo, un son en vidéo seulement, le reste en image fixe.
    var offeredOutputs: [MessageCardOutput] {
        MessageCardOutput.offered(for: currentMedia.map(\.kind))
    }

    /// Le choix se fait AVANT d'enregistrer ou de partager — il n'existe que
    /// quand le contenu a une durée.
    @ViewBuilder
    var outputPicker: some View {
        let offered = offeredOutputs
        if offered.count > 1 {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(offered, id: \.self) { item in
                    let selected = item == output
                    Button {
                        HapticFeedback.light()
                        output = item
                    } label: {
                        Label(MessageCardExportText.outputLabel(item), systemImage: MessageCardExportSymbols.output(item))
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                            .padding(.horizontal, MeeshySpacing.mdPlus)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .foregroundStyle(selected ? Color(uiColor: .systemBackground) : Color.primary)
                            .background(Capsule().fill(selected ? Color.primary : Color.primary.opacity(0.07)))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(MessageCardPressStyle())
                    .accessibilityAddTraits(selected ? [.isSelected] : [])
                }
            }
            .disabled(busy)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(MessageCardExportText.text("export.card.output.label", "Enregistrer en"))
        }
    }

    var actions: some View {
        VStack(spacing: MeeshySpacing.sm) {
            if let progress = motion.value {
                ProgressView(value: progress) {
                    Text(MessageCardExportText.text("export.card.motion.running", "Animation en cours…"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .tint(accent)
                .accessibilityValue(Text(progress, format: .percent.precision(.fractionLength(0))))
            }
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
            .disabled(!ready || busy)
            .opacity(ready && !busy ? 1 : 0.6)
        }
    }

    enum Destination { case gallery, share }

    enum Outcome { case gallery, shared, cancelled, denied, failed }

    func save() {
        guard ready, !busy, let rendered else { return }
        guard output == .image else { return animate(to: .gallery) }
        busy = true
        notice = nil
        Task {
            let saved = await PhotoLibraryManager.shared.saveImageFile(rendered.png, fileName: MessageCardSubject.fileName(at: Date()))
            busy = false
            finish(saved ? .gallery : .denied)
        }
    }

    func share() {
        guard ready, !busy, let rendered else { return }
        guard output == .image else { return animate(to: .share) }
        notice = nil
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(MessageCardSubject.fileName(at: Date()))
        do {
            try rendered.png.write(to: url, options: .atomic)
            shareFile = ShareFile(url: url)
        } catch {
            notice = MessageCardExportText.text("export.announce.failed", "Impossible de créer l’image")
        }
    }

    /// Peint la carte image par image, hors du MainActor, puis l'enregistre ou la
    /// partage — sur la durée et le passage choisis, avec la piste que sert la
    /// langue d'export (#8979).
    private func animate(to destination: Destination) {
        guard let plan = motionPlan else { return }
        busy = true
        notice = nil
        motion.value = 0
        let input = input(for: format)
        let pictures = loadedMedia.pictures
        let audioFile = loadedMedia.soundFile(of: subject.media)
        let video = subject.media.first { $0.media.kind == .video }
        let box = motion
        let progress: @Sendable (Double) -> Void = { value in
            Task { @MainActor in box.value = value }
        }
        motionTask = Task {
            do {
                var videoFile: URL?
                if let video {
                    videoFile = await Task.detached(priority: .userInitiated) {
                        await MessageCardMediaLoader.localFile(video.fileURL, kind: .video)
                    }.value
                }
                let source = MessageCardMotionSource(videoFile: videoFile, videoID: video?.media.id, audioFile: audioFile)
                let file = try await Task.detached(priority: .userInitiated) {
                    try await MessageCardMotionExporter.export(input: input, pictures: pictures, plan: plan, source: source, progress: progress)
                }.value
                try Task.checkCancellation()
                await deliver(file, output: plan.output, to: destination)
            } catch is CancellationError {
                busy = false
                motion.value = nil
            } catch {
                busy = false
                motion.value = nil
                finish(.failed)
            }
        }
    }

    private func deliver(_ file: URL, output: MessageCardOutput, to destination: Destination) async {
        let named = FileManager.default.temporaryDirectory.appendingPathComponent(MessageCardSubject.fileName(at: Date(), output: output))
        try? FileManager.default.removeItem(at: named)
        let url = (try? FileManager.default.moveItem(at: file, to: named)) != nil ? named : file
        motion.value = nil
        switch destination {
        case .share:
            busy = false
            shareFile = ShareFile(url: url)
        case .gallery:
            let saved: Bool
            if output == .gif, let data = try? Data(contentsOf: url) {
                saved = await PhotoLibraryManager.shared.saveImageFile(data, fileName: url.lastPathComponent)
            } else {
                saved = await PhotoLibraryManager.shared.saveVideo(at: url)
            }
            busy = false
            finish(saved ? .gallery : .denied)
        }
    }

    /// Chaque carte ENREGISTRÉE compte pour son template ; un refus reste dans
    /// la feuille, où l'utilisateur peut réessayer.
    func finish(_ outcome: Outcome) {
        let moving = output != .image
        switch outcome {
        case .gallery, .shared:
            MessageCardUsage.record(format.template, in: store)
            HapticFeedback.success()
            onClose()
            let message: String
            switch (outcome, moving) {
            case (.gallery, false): message = MessageCardExportText.text("export.announce.gallery", "Image enregistrée dans la galerie")
            case (.gallery, true): message = MessageCardExportText.text("export.announce.galleryMotion", "Animation enregistrée dans la galerie")
            case (_, false): message = MessageCardExportText.text("export.announce.shared", "Image prête")
            case (_, true): message = MessageCardExportText.text("export.announce.sharedMotion", "Animation prête")
            }
            FeedbackToastManager.shared.showSuccess(message)
        case .cancelled:
            notice = nil
        case .denied:
            notice = MessageCardExportText.text("export.announce.photosDenied", "Autorisez Meeshy à ajouter des photos pour enregistrer l’image")
        case .failed:
            notice = MessageCardExportText.text("export.announce.motionFailed", "Impossible de créer l’animation")
        }
    }
}
