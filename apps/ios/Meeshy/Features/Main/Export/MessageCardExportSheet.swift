import SwiftUI
import UIKit
import CoreText
import MeeshySDK
import MeeshyUI

/// Ce que la feuille d'export reçoit : la carte telle que le lecteur la lit,
/// les autres langues où elle existe, et qui signe le filigrane.
struct MessageCardExportRequest {
    /// La carte telle que le lecteur la lit — ses médias compris (#8692).
    let subject: MessageCardSubject
    /// Les langues dans lesquelles la réponse existe — l'original d'abord.
    let languages: [String]
    let subjectIn: (String) -> MessageCardSubject?
    /// Le pseudo de qui exporte — il signe le filigrane, anonymat ou pas.
    let handle: String?
    /// `nil` quand la conversation n'en a pas : l'option ne s'offre alors pas.
    let conversationTitle: String?
    let accentColor: String
    /// « Export rapide » : le format par défaut, enregistré dès que la carte est peinte.
    let quick: Bool
}

/// **« IMAGINE » — UN MESSAGE OU UN COMMENTAIRE DEVIENT UNE IMAGE, UN GIF OU
/// UNE VIDÉO** (#8692, ex « Exporter en image », #8667). Miroir natif de
/// `apps/web/src/routes/thread-export-sheet.tsx` : l'atelier ne crée aucun
/// contenu, il choisit comment MONTRER ce qui existe — le template, le format
/// de l'image, la disposition (« Frame »), les médias, les noms ou leur
/// anonymat — montre la carte telle qu'elle partira, puis l'enregistre.
///
/// L'aperçu EST le contrôle : chaque partie de la carte (en-tête, citation,
/// liaison, réponse, médias, fond) se touche, et le plateau ouvre l'onglet qui
/// la règle — un seul panneau à la fois, jamais toute la liste. Les 784
/// templates se parcourent dans une galerie peinte sur le message, qui se
/// cherche. Le plateau, les gestes de fin et les étiquettes sont en Liquid
/// Glass adaptatif : sur iOS 26 ils fondent dans le style du système, et
/// gardent une matière lisible jusqu'à iOS 16.
///
/// La peinture tourne HORS du MainActor : l'aperçu précédent reste affiché
/// pendant que le suivant se peint, jamais de saut ni d'écran vide. Les médias
/// se chargent derrière : la carte se peint d'abord avec leurs couleurs
/// d'attente, puis se repeint quand les pixels arrivent.
struct MessageCardExportSheet: View {
    let request: MessageCardExportRequest
    let onClose: () -> Void

    let store: MessageCardPreferenceStore = UserDefaultsMessageCardStore()

    @State var savedDefault: MessageCardFormat?
    @State var format: MessageCardFormat = .initial
    @State var popular: [MessageCardTemplateID] = []
    @State var usage: [MessageCardTemplateID: Int] = [:]
    @State var exportLanguage: String?
    @State var rendered: Rendered?
    @State var failed = false
    @State var busy = false
    @State var notice: String?
    @State var shareFile: ShareFile?
    @State var quickSent = false
    @State var loaded = false
    @State var tab: MessageCardExportTab = .styles
    @State var focus: MessageCardPartID?
    @State var touched = false
    @State var galleryOpen = false
    @State var thumbnails = MessageCardThumbnailStore()
    @State var loadedMedia: MessageCardLoadedMedia = .empty
    @State var mediaVersion = 0
    @State var mediaAttempt = 0
    @State var output: MessageCardOutput = .image
    @State var motionTask: Task<Void, Never>?
    @StateObject var motion = MessageCardMotionProgress()

    struct Rendered {
        let key: String
        let image: UIImage
        let png: Data
        let truncated: Bool
        let size: CGSize
        let regions: [MessageCardRegion]
    }

    struct ShareFile: Identifiable {
        let url: URL
        var id: String { url.path }
    }

    private static let popularCount = 8
    /// La tolérance du doigt autour d'une zone, en points d'écran.
    private static let touchSlop: CGFloat = 8

    var accent: Color { Color(hex: request.accentColor) }

    var subject: MessageCardSubject {
        exportLanguage.flatMap(request.subjectIn) ?? request.subject
    }

    /// Les médias tels qu'on les peint — avec leur onde réelle dès qu'elle est lue.
    var currentMedia: [MessageCardMedia] {
        loadedMedia.media.isEmpty ? subject.media.map(\.media) : loadedMedia.media
    }

    private var title: String? {
        guard let trimmed = request.conversationTitle?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    var renderKey: String { "\(format.serialized)|\(exportLanguage ?? "")|\(mediaVersion)" }
    var ready: Bool { rendered?.key == renderKey }
    private var isDefault: Bool { savedDefault == format }

    private var tabs: [MessageCardExportTab] {
        MessageCardExportTab.offered(hasMedia: !request.subject.media.isEmpty, languageCount: request.languages.count)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: MeeshySpacing.md) {
                stage
                notices
                AdaptiveGlassContainer(spacing: 12) {
                    VStack(spacing: MeeshySpacing.md) {
                        tray
                        outputPicker
                        actions
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.bottom, MeeshySpacing.md)
            .background(ambient)
            .navigationTitle(MessageCardExportText.text("export.card.title", "Imagine"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
        }
        .tint(accent)
        .onAppear(perform: load)
        .onDisappear { motionTask?.cancel() }
        .task(id: "\(loaded)|\(mediaAttempt)") { await loadMedia() }
        .task(id: "\(loaded)|\(renderKey)") { await render() }
        .sheet(isPresented: $galleryOpen) {
            MessageCardExportGallery(
                usage: usage,
                selected: format.template,
                source: thumbSource,
                onPick: { id in
                    format.template = id
                    galleryOpen = false
                },
                onClose: { galleryOpen = false }
            )
        }
        .sheet(item: $shareFile) { file in
            ShareSheet(activityItems: [file.url]) { completed in
                shareFile = nil
                finish(completed ? .shared : .cancelled)
            }
        }
    }

    // MARK: - En-tête

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button(MessageCardExportText.text("common.cancel", "Annuler")) {
                motionTask?.cancel()
                onClose()
            }
        }
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                HapticFeedback.light()
                format.template = MessageCardTemplates.random()
            } label: {
                Image(systemName: "shuffle")
            }
            .accessibilityLabel(MessageCardExportText.text("export.card.random", "Au hasard"))
            Button {
                MessageCardFormat.writeDefault(format, to: store)
                savedDefault = format
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(MessageCardExportText.text("export.announce.defaultSaved", "Format par défaut enregistré"))
            } label: {
                Image(systemName: isDefault ? "bookmark.fill" : "bookmark")
            }
            .disabled(isDefault)
            .accessibilityLabel(isDefault
                ? MessageCardExportText.text("export.card.default.current", "Format par défaut")
                : MessageCardExportText.text("export.card.default.save", "Utiliser comme format par défaut"))
        }
    }

    // MARK: - Aperçu

    /// Le fond de la feuille : la carte elle-même, floutée — la scène prend la couleur du style choisi.
    private var ambient: some View {
        ZStack {
            Color(uiColor: .systemBackground)
            if let image = rendered?.image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .blur(radius: 48)
                    .opacity(0.5)
                    .animation(.easeInOut(duration: 0.35), value: rendered?.key)
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    private var stage: some View {
        GeometryReader { proxy in
            ZStack {
                if let rendered {
                    card(rendered, in: proxy.size)
                } else if failed {
                    Text(MessageCardExportText.text("export.announce.failed", "Impossible de créer l’image"))
                        .font(.footnote)
                        .foregroundStyle(MeeshyColors.error)
                } else {
                    VStack(spacing: MeeshySpacing.sm) {
                        ProgressView()
                        Text(MessageCardExportText.text("export.card.rendering", "Préparation de l’image…"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .overlay(alignment: .bottom) { hint }
    }

    private func card(_ rendered: Rendered, in space: CGSize) -> some View {
        let ratio = rendered.size.width / max(rendered.size.height, 1)
        let width = min(space.width, space.height * ratio)
        let height = width / ratio
        let scale = width / rendered.size.width
        return ZStack(alignment: .topLeading) {
            Button { pick(.background) } label: {
                Image(uiImage: rendered.image)
                    .resizable()
                    .frame(width: width, height: height)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(MessageCardExportText.partLabel(.background))
            .accessibilityHint(MessageCardExportText.text("export.card.hint", "Touchez une partie de la carte pour la régler"))
            ForEach(Array(rendered.regions.enumerated()), id: \.offset) { _, region in
                zone(region, scale: scale)
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus, style: .continuous))
        .shadow(color: .black.opacity(0.22), radius: 18, y: 8)
        .opacity(ready ? 1 : 0.7)
        .animation(.easeInOut(duration: 0.2), value: ready)
    }

    private func zone(_ region: MessageCardRegion, scale: CGFloat) -> some View {
        let slop = Self.touchSlop
        let focused = focus == region.part
        return Button { pick(region.part) } label: {
            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                .fill(Color.white.opacity(0.001))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous)
                        .strokeBorder(Color.white.opacity(focused ? 0.9 : 0), style: StrokeStyle(lineWidth: MeeshyBorder.strong, dash: [6, 4]))
                )
                .overlay(alignment: .topLeading) {
                    if focused {
                        Text(MessageCardExportText.partLabel(region.part))
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, MeeshySpacing.sm)
                            .padding(.vertical, MeeshySpacing.xs)
                            .adaptiveGlass(in: Capsule())
                            .offset(x: 6, y: -12)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(width: CGFloat(region.width) * scale + 2 * slop, height: CGFloat(region.height) * scale + 2 * slop)
        .offset(x: CGFloat(region.x) * scale - slop, y: CGFloat(region.y) * scale - slop)
        .accessibilityLabel(MessageCardExportText.partLabel(region.part))
        .accessibilityAddTraits(focused ? [.isSelected] : [])
    }

    @ViewBuilder
    private var hint: some View {
        if !touched && rendered != nil {
            Label(MessageCardExportText.text("export.card.hint", "Touchez une partie de la carte pour la régler"), systemImage: "hand.tap")
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.sm)
                .adaptiveGlass(in: Capsule())
                .padding(.bottom, MeeshySpacing.smPlus)
                .allowsHitTesting(false)
                .transition(.opacity)
        }
    }

    @ViewBuilder
    private var notices: some View {
        if let notice {
            Text(notice)
                .font(.footnote)
                .foregroundStyle(MeeshyColors.error)
        } else if let failure = MessageCardExportText.mediaFailure(count: loadedMedia.failed.count) {
            mediaFailure(failure)
        } else if ready, rendered?.truncated == true {
            Text(MessageCardExportText.text("export.card.truncated", "Message long : la fin est coupée sur l’image."))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Plateau

    private var tray: some View {
        MessageCardExportTray(
            tabs: tabs,
            tab: tab,
            focus: focus,
            format: $format,
            popular: popular,
            hasQuote: subject.quoted != nil,
            hasTitle: title != nil,
            hasHandles: subject.hasHandles,
            mediaKinds: currentMedia.map(\.kind),
            languages: request.languages,
            exportLanguage: $exportLanguage,
            thumbs: thumbSource,
            onTab: openTab,
            onGallery: { galleryOpen = true }
        )
    }

    /// Toucher une partie de la carte ouvre l'onglet qui la règle.
    private func pick(_ part: MessageCardPartID) {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            touched = true
            focus = part
            tab = MessageCardExportTab.of(part)
        }
    }

    /// Choisir un onglet à la main désigne la partie qu'il règle.
    private func openTab(_ next: MessageCardExportTab) {
        let painted = Set(rendered?.regions.map(\.part) ?? [])
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            tab = next
            switch next {
            case .palette: focus = .background
            case .link: focus = subject.quoted == nil ? nil : .link
            case .typeface: focus = focus == .quote || focus == .reply ? focus : .reply
            case .frame: focus = painted.contains(.header) ? .header : nil
            case .media: focus = painted.contains(.media) ? .media : nil
            case .styles, .format, .details, .language: focus = nil
            }
        }
    }

    // MARK: - Vignettes

    var thumbSource: MessageCardThumbSource {
        var neutral = format
        neutral.template = MessageCardTemplates.defaultID
        let state = "\(neutral.serialized)|\(exportLanguage ?? "")|\(mediaVersion)"
        let format = format
        return MessageCardThumbSource(
            store: thumbnails,
            keyOf: { "\($0.rawValue)|\(state)" },
            inputOf: { id in
                var styled = format
                styled.template = id
                return input(for: styled)
            },
            pictures: loadedMedia.pictures
        )
    }

    func input(for format: MessageCardFormat) -> MessageCardInput {
        MessageCardInput.of(
            subject: subject,
            format: format,
            handle: request.handle,
            conversationTitle: title,
            anonymousLabel: MessageCardExportText.text("export.card.anonymous", "Anonyme"),
            formatDate: { Self.dateFormatter.string(from: $0) },
            formatTime: { Self.timeFormatter.string(from: $0) },
            media: currentMedia
        )
    }

    // MARK: - Chargement et peinture

    private func load() {
        guard !loaded else { return }
        loaded = true
        let stored = MessageCardFormat.readDefault(from: store)
        savedDefault = stored
        format = stored ?? .initial
        usage = MessageCardUsage.read(from: store)
        popular = MessageCardUsage.popular(usage, count: Self.popularCount)
    }

    /// « Un média n'a pas pu se charger » + « Réessayer » (#8901) — jamais un cadre muet.
    private func mediaFailure(_ message: String) -> some View {
        HStack(spacing: 12) {
            Label(message, systemImage: "exclamationmark.triangle")
                .font(.footnote)
                .foregroundStyle(MeeshyColors.error)
            Button(MessageCardExportText.text("export.card.media.retry", "Réessayer")) {
                HapticFeedback.light()
                mediaAttempt += 1
            }
            .font(.footnote.weight(.semibold))
            .frame(minHeight: 44)
        }
        .accessibilityElement(children: .contain)
    }

    /// Les pixels et l'onde réelle des médias, chargés HORS du MainActor —
    /// la carte est déjà peinte avec leurs couleurs d'attente. Rejoué par
    /// « Réessayer » (`mediaAttempt`).
    private func loadMedia() async {
        let items = request.subject.media
        guard loaded, !items.isEmpty else { return }
        let result = await Task.detached(priority: .userInitiated) {
            await MessageCardMediaLoader.load(items)
        }.value
        guard !Task.isCancelled else { return }
        loadedMedia = result
        mediaVersion += 1
    }

    /// Les pixels des médias sont là, et aucun n'a échoué : la carte montre ce qui partira.
    private var mediaArePainted: Bool {
        request.subject.media.isEmpty || (mediaVersion > 0 && loadedMedia.failed.isEmpty)
    }

    private func render() async {
        guard loaded else { return }
        let key = renderKey
        failed = false
        let input = input(for: format)
        let pictures = loadedMedia.pictures
        let card = await Task.detached(priority: .userInitiated) { MessageCardRenderer.render(input, pictures: pictures) }.value
        guard !Task.isCancelled, key == renderKey else { return }
        guard let card, let image = UIImage(data: card.png) else {
            failed = true
            return
        }
        rendered = Rendered(
            key: key,
            image: image,
            png: card.png,
            truncated: card.truncated,
            size: CGSize(width: card.width, height: card.height),
            regions: card.regions
        )
        // L'export rapide attend les pixels des médias : il ne part jamais
        // avec leurs couleurs d'attente.
        // Un média en échec retient l'export rapide : l'atelier le dit et attend « Réessayer ».
        if request.quick && !quickSent && mediaArePainted {
            quickSent = true
            save()
        }
        #if DEBUG
        if mediaArePainted { VitrineRendu.shared.signaler(.imagine) }
        #endif
    }

    static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .none
        return formatter
    }()

    static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter
    }()
}

/// La progression d'une carte animée — écrite depuis l'encodeur, lue par le plateau.
final class MessageCardMotionProgress: ObservableObject {
    @Published var value: Double?

    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}
}
