import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les mots de la prise (#9295) — ceux de l'appel, jamais une seconde traduction
/// des mêmes notions.
enum ComposerPhotoLookCopy {
    static var filters: String {
        String(localized: "call.filters", defaultValue: "Filtres", bundle: .main)
    }

    static var frames: String { CallLiveFrameCopy.caption }

    static var retake: String {
        String(localized: "composer.scene.background.menu.retakePhoto",
               defaultValue: "Reprendre une photo", bundle: .main)
    }

    static var use: String { CallModeCopy.validate }

    static func frameName(_ frame: ComposerPhotoFrame) -> String {
        switch frame {
        case .none: return CallLiveFrameCopy.none
        case .montage(let choice): return CallFrameCopy.choiceName(choice)
        }
    }

    static func frameSymbol(_ frame: ComposerPhotoFrame) -> String {
        switch frame {
        case .none: return "circle.slash"
        case .montage(let choice): return CallFrameCopy.choiceSymbol(choice)
        }
    }

    static func tabName(_ tab: ComposerPhotoLookTab) -> String {
        switch tab {
        case .filters: return filters
        case .frames: return frames
        }
    }
}

/// Les deux familles que la prise offre — une à la fois sous la photo.
nonisolated enum ComposerPhotoLookTab: String, CaseIterable, Hashable, Sendable {
    case filters
    case frames
}

/// L'auteur, tel que les cadres l'écrivent — son nom d'affichage, sinon son pseudo.
nonisolated enum ComposerPhotoLookPerson {
    static let selfId = "self"

    static func author(id: String?, displayName: String?, username: String?) -> CallFramePerson {
        let nom = [displayName, username]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty } ?? ""
        return CallFramePerson(id: id ?? selfId, name: nom, handle: username, isSelf: true)
    }
}

/// **La prise, avant de partir** (#9295, directive porteur 2026-10-04) : la photo
/// en plein écran, les FILTRES de l'appel vidéo (ses préréglages couleur) et ses
/// CADRES (les montages classiques et les cadres du catalogue, servis à une
/// personne), puis « Valider ».
///
/// Chaque pièce est celle de l'appel : le carrousel (`CallModeCarousel`), la
/// vignette (`CallModeThumbnail`), les puces d'ambiance (`CallFrameMoodChips`),
/// les noms (`CallEffectsCopy`, `CallFrameCopy`) et le peintre
/// (`ComposerPhotoLookRenderer` → `CallCaptureController.render`). Rien de
/// choisi ⇒ la prise part telle quelle, octets d'origine compris.
struct ComposerPhotoLookReview: View {
    let photo: UIImage
    let person: CallFramePerson
    /// La date de la séance de prise : le cadre écrit celle du viseur, jamais
    /// celle de l'ouverture de la revue.
    let date: Date
    let onRetake: () -> Void
    let onUse: (UIImage, ComposerPhotoLook) -> Void

    @State private var source: ComposerPhotoLookSource?
    @State private var look: ComposerPhotoLook
    @State private var tab: ComposerPhotoLookTab
    @State private var chip: CallMontageMoodChip

    /// La prise s'ouvre sur le look choisi EN DIRECT au viseur (#9329) : ce que
    /// l'auteur voyait est ce qu'il retrouve, et il peut encore l'affiner.
    init(photo: UIImage,
         person: CallFramePerson,
         date: Date,
         initialLook: ComposerPhotoLook = ComposerPhotoLook(),
         onRetake: @escaping () -> Void,
         onUse: @escaping (UIImage, ComposerPhotoLook) -> Void) {
        self.photo = photo
        self.person = person
        self.date = date
        self.onRetake = onRetake
        self.onUse = onUse
        _look = State(initialValue: initialLook)
        _tab = State(initialValue: initialLook.frame == ComposerPhotoFrame.none ? .filters : .frames)
        _chip = State(initialValue: ComposerPhotoLookRule.chip(of: initialLook.frame))
    }
    @State private var preview: CGImage?
    @State private var thumbnails = ComposerPhotoLookThumbnails.empty
    @State private var isFinishing = false

    private static let thumbnailSize = CGSize(width: 48, height: 85)

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            // La photo occupe l'espace LIBRE entre la barre et les commandes :
            // aucune commande ne recouvre ce que l'auteur juge.
            VStack(spacing: MeeshySpacing.mdPlus) {
                topBar
                photoView
                controls
                useButton
            }
            .padding(.bottom, MeeshySpacing.md)
        }
        .environment(\.colorScheme, .dark)
        .onAppear {
            guard source == nil, let upright = ComposerPhotoLookSource.upright(photo) else { return }
            source = ComposerPhotoLookSource.taken(upright, by: person, at: date)
        }
        .task(id: PreviewKey(look: look, ready: source != nil)) {
            guard let source else { return }
            guard !look.isUntouched else {
                preview = nil
                return
            }
            let rendu = await Self.paintPreview(look, source: source, date: date)
            guard !Task.isCancelled else { return }
            preview = rendu
        }
        // Les vignettes des filtres ne dépendent que de la photo : peintes une fois.
        .task(id: source != nil) {
            guard let source else { return }
            let filtres = await Self.paintFilterThumbnails(source: source)
            guard !Task.isCancelled else { return }
            thumbnails = ComposerPhotoLookThumbnails(filters: filtres.filters, frames: thumbnails.frames)
        }
        // Celles des cadres suivent l'ambiance ouverte et le filtre choisi.
        .task(id: ThumbnailsKey(chip: chip, filter: look.filter, ready: source != nil)) {
            guard let source else { return }
            let cadres = await Self.paintFrameThumbnails(source: source, filter: look.filter,
                                                         frames: ComposerPhotoLookRule.frames(for: chip))
            guard !Task.isCancelled else { return }
            thumbnails = ComposerPhotoLookThumbnails(filters: thumbnails.filters, frames: cadres.frames)
        }
    }

    // MARK: - La photo

    private var photoView: some View {
        Group {
            if let preview {
                Image(decorative: preview, scale: 1)
                    .resizable()
            } else {
                Image(uiImage: photo)
                    .resizable()
            }
        }
        .aspectRatio(contentMode: .fit)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityHidden(true)
    }

    // MARK: - Le chrome

    private var topBar: some View {
        HStack {
            Button(action: onRetake) {
                Image(systemName: "arrow.uturn.backward")
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                    .adaptiveLiquidGlass(in: Circle(), interactive: true)
            }
            .buttonStyle(.plain)
            .disabled(isFinishing)
            .accessibilityLabel(ComposerPhotoLookCopy.retake)
            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.md)
    }

    private var controls: some View {
        VStack(spacing: MeeshySpacing.md) {
            Picker(ComposerPhotoLookCopy.filters, selection: $tab) {
                ForEach(ComposerPhotoLookTab.allCases, id: \.self) { famille in
                    Text(ComposerPhotoLookCopy.tabName(famille)).tag(famille)
                }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 280)
            switch tab {
            case .filters:
                filterCarousel
            case .frames:
                frameChoice
            }
        }
        .disabled(isFinishing)
    }

    private var filterCarousel: some View {
        CallModeCarousel(
            items: ComposerPhotoLookRule.filters,
            selection: $look.filter,
            title: ComposerPhotoLookCopy.filters,
            name: CallEffectsCopy.presetName,
            itemSize: Self.thumbnailSize,
            spacing: 12
        ) { preset, isSelected in
            CallModeThumbnail(image: thumbnails.filters[preset],
                              symbol: CallEffectsCopy.presetSymbol(preset),
                              isSelected: isSelected)
        }
    }

    private var frameChoice: some View {
        VStack(spacing: MeeshySpacing.sm) {
            CallFrameMoodChips(chips: ComposerPhotoLookRule.chips(), selected: chip) { tapped in
                chip = tapped
                look.frame = ComposerPhotoLookRule.entering(tapped)
            }
            CallModeCarousel(
                items: ComposerPhotoLookRule.frames(for: chip),
                selection: $look.frame,
                title: ComposerPhotoLookCopy.frames,
                name: ComposerPhotoLookCopy.frameName,
                itemSize: Self.thumbnailSize,
                spacing: 12
            ) { frame, isSelected in
                CallModeThumbnail(image: thumbnails.frames[frame],
                                  symbol: ComposerPhotoLookCopy.frameSymbol(frame),
                                  isSelected: isSelected)
            }
            // Une autre ambiance, c'est une autre piste, posée d'emblée sur son choix.
            .id(chip)
        }
    }

    private var useButton: some View {
        HStack {
            Spacer()
            Button(action: use) {
                Label(ComposerPhotoLookCopy.use, systemImage: "checkmark")
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
                    .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.indigo500)
            }
            .buttonStyle(.plain)
            .disabled(isFinishing || (source == nil && !look.isUntouched))
            .opacity(isFinishing ? 0.6 : 1)
            .accessibilityLabel(ComposerPhotoLookCopy.use)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
    }

    // MARK: - La remise

    /// Le rendu final se peint en pleine définition, hors du fil principal ; un
    /// rendu qui échoue garde l'auteur sur la prise plutôt que d'envoyer autre
    /// chose que ce qu'il a choisi. « Valider » reste éteint jusqu'au retrait
    /// du viseur : un second toucher ne remet rien.
    private func use() {
        guard !isFinishing else { return }
        guard !look.isUntouched else {
            isFinishing = true
            onUse(photo, look)
            return
        }
        guard let source else { return }
        isFinishing = true
        let choisi = look
        Task {
            guard let rendu = await Self.paintFinal(choisi, source: source, date: date) else {
                isFinishing = false
                HapticFeedback.error()
                return
            }
            onUse(UIImage(cgImage: rendu), choisi)
        }
    }

    // MARK: - Peindre, hors du fil principal

    /// Le peintre unique sert les cadres du catalogue comme les classiques du
    /// Montage, peints en couches GPU (#9348).
    @concurrent
    nonisolated static func paintPreview(_ look: ComposerPhotoLook, source: ComposerPhotoLookSource,
                                         date: Date) async -> CGImage? {
        await ComposerLookPainter.renderPreview(source.photo, look: look, framing: .identity,
                                                       person: source.person, date: date,
                                                       scenes: ComposerLookSceneCache.shared)
    }

    @concurrent
    nonisolated static func paintFinal(_ look: ComposerPhotoLook, source: ComposerPhotoLookSource,
                                       date: Date) async -> CGImage? {
        await ComposerLookPainter.renderPhoto(source.photo, look: look, framing: .identity, person: source.person,
                                              date: date, scenes: ComposerLookSceneCache.shared)
    }

    @concurrent
    nonisolated static func paintFilterThumbnails(source: ComposerPhotoLookSource) async -> ComposerPhotoLookThumbnails {
        ComposerPhotoLookThumbnails.paintingFilters(source: source)
    }

    @concurrent
    nonisolated static func paintFrameThumbnails(source: ComposerPhotoLookSource, filter: VideoFilterPreset,
                                                 frames: [ComposerPhotoFrame]) async -> ComposerPhotoLookThumbnails {
        ComposerPhotoLookThumbnails.paintingFrames(source: source, filter: filter, frames: frames)
    }
}

private struct PreviewKey: Hashable {
    let look: ComposerPhotoLook
    let ready: Bool
}

private struct ThumbnailsKey: Hashable {
    let chip: CallMontageMoodChip
    let filter: VideoFilterPreset
    let ready: Bool
}
