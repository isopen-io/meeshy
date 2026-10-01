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
    @State var sharePayload: MessageCardSharePayload?
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
    /// Où commence le passage exporté d'un son ou d'une vidéo, en secondes (#8979) — propre à ce message.
    @State var clipStart: Double = 0
    /// Le pincement en cours sur une partie de l'aperçu (#8979).
    @State var pinch: MessageCardPinch?

    struct Rendered {
        let key: String
        let image: UIImage
        let png: Data
        let truncated: Bool
        let size: CGSize
        let regions: [MessageCardRegion]
        /// La coupe vient des médias — l'avis le dit (revue #8979).
        var crowdedByMedia = false
        /// L'échelle la plus grande que la carte laisse aux médias — le pincement s'y arrête.
        var mediaScaleLimit = MessageCardScales.range.upperBound
    }

    private static let popularCount = 8

    var accent: Color { Color(hex: request.accentColor) }

    var subject: MessageCardSubject {
        exportLanguage.flatMap(request.subjectIn) ?? request.subject
    }

    /// Les médias tels qu'on les peint — chaque son avec l'onde et la durée de
    /// SA piste (celle que sert la langue d'export) dès qu'elle est lue.
    var currentMedia: [MessageCardMedia] {
        loadedMedia.media(of: subject.media)
    }

    /// Le plan d'une carte animée : la durée choisie, à partir du passage choisi (#8979).
    var motionPlan: MessageCardMotionPlan? {
        MessageCardMotionPlan.of(output, media: currentMedia, length: format.disposition.clipLength, start: clipStart)
    }

    /// L'extrait que l'aperçu montre — celui que la vidéo emportera.
    private var clipKey: String {
        motionPlan.map { "\($0.start)+\($0.duration)" } ?? ""
    }

    /// Les pistes à lire — une langue d'export qui sert une autre piste en fait charger une autre.
    private var soundsKey: String {
        subject.media.filter { $0.media.kind == .audio }.map(\.fileURL).joined(separator: "|")
    }

    private var title: String? {
        guard let trimmed = request.conversationTitle?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    var renderKey: String { "\(format.serialized)|\(exportLanguage ?? "")|\(mediaVersion)|\(clipKey)" }
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
        .task(id: "\(loaded)|\(mediaAttempt)|\(soundsKey)") { await loadMedia() }
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
        .sheet(item: $sharePayload) { payload in
            ShareSheet(activityItems: payload.activityItems) { completed in
                sharePayload = nil
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

    @ViewBuilder
    private var hint: some View {
        if !touched && rendered != nil {
            Label(MessageCardExportText.text("export.card.hint.pinch", "Touchez pour régler, pincez pour redimensionner"), systemImage: "hand.tap")
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
        } else if let failure = MessageCardExportText.mediaFailure(count: loadedMedia.failures(of: subject.media, output: output).count) {
            mediaFailure(failure)
        } else if ready, let rendered, rendered.truncated {
            Text(rendered.crowdedByMedia
                 ? MessageCardExportText.text("export.card.truncated.media", "Les médias prennent la place : la fin du texte est coupée.")
                 : MessageCardExportText.text("export.card.truncated", "Message long : la fin est coupée sur l’image."))
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
            media: currentMedia,
            output: output,
            plan: motionPlan,
            languages: request.languages,
            exportLanguage: $exportLanguage,
            thumbs: thumbSource,
            onTab: openTab,
            onGallery: { galleryOpen = true },
            onExcerptStart: { clipStart = $0 }
        )
    }

    /// Toucher une partie de la carte ouvre l'onglet qui la règle.
    func pick(_ part: MessageCardPartID) {
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
            case .media: focus = painted.contains(.media) ? .media : (painted.contains(.transcript) ? .transcript : nil)
            case .styles, .format, .details, .language: focus = nil
            }
        }
    }

    // MARK: - Vignettes

    var thumbSource: MessageCardThumbSource {
        var neutral = format
        neutral.template = MessageCardTemplates.defaultID
        let state = "\(neutral.serialized)|\(exportLanguage ?? "")|\(mediaVersion)|\(clipKey)"
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

    /// La carte telle qu'elle partira — animée, sur l'extrait que la vidéo emportera (#8979).
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
        ).clipped(to: motionPlan?.clip)
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
    /// « Réessayer » (`mediaAttempt`), et par une langue d'export qui sert une
    /// autre piste : seul ce qui manque se charge.
    private func loadMedia() async {
        let items = subject.media
        let wanted = loadedMedia.missing(items)
        guard loaded, !wanted.isEmpty else { return }
        let result = await Task.detached(priority: .userInitiated) {
            await MessageCardMediaLoader.load(wanted)
        }.value
        guard !Task.isCancelled else { return }
        loadedMedia = loadedMedia.merging(result, for: items)
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
            regions: card.regions,
            crowdedByMedia: card.crowdedByMedia,
            mediaScaleLimit: card.mediaScaleLimit
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
