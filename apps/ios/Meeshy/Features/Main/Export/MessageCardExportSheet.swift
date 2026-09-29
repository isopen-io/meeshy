import SwiftUI
import UIKit
import CoreText
import MeeshySDK
import MeeshyUI

/// Ce que la feuille d'export reçoit : la carte telle que le lecteur la lit,
/// les autres langues où elle existe, et qui signe le filigrane.
struct MessageCardExportRequest {
    /// La carte telle que le lecteur la lit.
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

/// **EXPORTER UN MESSAGE EN IMAGE — UN COMPOSER QUI SE RÈGLE AU TOUCHER.**
/// Miroir natif de `apps/web/src/routes/thread-export-sheet.tsx` : la feuille ne
/// crée aucun contenu, elle choisit comment MONTRER ce qui existe (le template,
/// le titre de la conversation, les noms des auteurs ou leur anonymat, la date),
/// montre la carte telle qu'elle partira, puis l'enregistre.
///
/// L'aperçu EST le contrôle : chaque partie de la carte (en-tête, citation,
/// liaison, réponse, fond) se touche, et le plateau ouvre l'onglet qui la règle
/// — un seul panneau à la fois, jamais toute la liste. Les 784 templates se
/// parcourent dans une galerie peinte sur le message, qui se cherche. Le
/// plateau, les deux gestes de fin (« Sauvegarder », « Partager ») et les
/// étiquettes sont en Liquid Glass adaptatif : sur iOS 26 ils fondent dans le
/// style du système, et gardent une matière lisible jusqu'à iOS 16.
///
/// La peinture tourne HORS du MainActor : l'aperçu précédent reste affiché
/// pendant que le suivant se peint, jamais de saut ni d'écran vide.
struct MessageCardExportSheet: View {
    let request: MessageCardExportRequest
    let onClose: () -> Void

    private let store: MessageCardPreferenceStore = UserDefaultsMessageCardStore()

    @State private var savedDefault: MessageCardFormat?
    @State private var format: MessageCardFormat = .initial
    @State private var popular: [MessageCardTemplateID] = []
    @State private var usage: [MessageCardTemplateID: Int] = [:]
    @State private var exportLanguage: String?
    @State private var rendered: Rendered?
    @State private var failed = false
    @State private var busy = false
    @State private var notice: String?
    @State private var shareFile: ShareFile?
    @State private var quickSent = false
    @State private var loaded = false
    @State private var tab: MessageCardExportTab = .styles
    @State private var focus: MessageCardPartID?
    @State private var touched = false
    @State private var galleryOpen = false
    @State private var thumbnails = MessageCardThumbnailStore()

    private struct Rendered {
        let key: String
        let image: UIImage
        let png: Data
        let truncated: Bool
        let size: CGSize
        let regions: [MessageCardRegion]
    }

    private struct ShareFile: Identifiable {
        let url: URL
        var id: String { url.path }
    }

    private static let popularCount = 8
    /// La tolérance du doigt autour d'une zone, en points d'écran.
    private static let touchSlop: CGFloat = 8

    private var accent: Color { Color(hex: request.accentColor) }

    private var subject: MessageCardSubject {
        exportLanguage.flatMap(request.subjectIn) ?? request.subject
    }

    private var title: String? {
        guard let trimmed = request.conversationTitle?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    private var renderKey: String { "\(format.serialized)|\(exportLanguage ?? "")" }
    private var ready: Bool { rendered?.key == renderKey }
    private var isDefault: Bool { savedDefault == format }

    private var tabs: [MessageCardExportTab] {
        MessageCardExportTab.allCases.filter { $0 != .language || request.languages.count > 1 }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                stage
                notices
                AdaptiveGlassContainer(spacing: 12) {
                    VStack(spacing: 12) {
                        tray
                        actions
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 12)
            .background(ambient)
            .navigationTitle(MessageCardExportText.text("export.card.title", "Exporter en image"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
        }
        .tint(accent)
        .onAppear(perform: load)
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
            Button(MessageCardExportText.text("common.cancel", "Annuler"), action: onClose)
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
                    VStack(spacing: 8) {
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
            ForEach(rendered.regions, id: \.part) { region in
                zone(region, scale: scale)
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.22), radius: 18, y: 8)
        .opacity(ready ? 1 : 0.7)
        .animation(.easeInOut(duration: 0.2), value: ready)
    }

    private func zone(_ region: MessageCardRegion, scale: CGFloat) -> some View {
        let slop = Self.touchSlop
        let focused = focus == region.part
        return Button { pick(region.part) } label: {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.001))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(Color.white.opacity(focused ? 0.9 : 0), style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                )
                .overlay(alignment: .topLeading) {
                    if focused {
                        Text(MessageCardExportText.partLabel(region.part))
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
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
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .adaptiveGlass(in: Capsule())
                .padding(.bottom, 10)
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
        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
            tab = next
            switch next {
            case .palette: focus = .background
            case .link: focus = subject.quoted == nil ? nil : .link
            case .typeface: focus = focus == .quote || focus == .reply ? focus : .reply
            case .styles, .details, .language: focus = nil
            }
        }
    }

    // MARK: - Vignettes

    private var thumbSource: MessageCardThumbSource {
        var neutral = format
        neutral.template = MessageCardTemplates.defaultID
        let state = "\(neutral.serialized)|\(exportLanguage ?? "")"
        let format = format
        return MessageCardThumbSource(
            store: thumbnails,
            keyOf: { "\($0.rawValue)|\(state)" },
            inputOf: { id in
                var styled = format
                styled.template = id
                return input(for: styled)
            }
        )
    }

    private func input(for format: MessageCardFormat) -> MessageCardInput {
        MessageCardInput.of(
            subject: subject,
            format: format,
            handle: request.handle,
            conversationTitle: title,
            anonymousLabel: MessageCardExportText.text("export.card.anonymous", "Anonyme"),
            formatDate: { Self.dateFormatter.string(from: $0) }
        )
    }

    // MARK: - Gestes

    private var actions: some View {
        HStack(spacing: 10) {
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

    private func load() {
        guard !loaded else { return }
        loaded = true
        let stored = MessageCardFormat.readDefault(from: store)
        savedDefault = stored
        format = stored ?? .initial
        usage = MessageCardUsage.read(from: store)
        popular = MessageCardUsage.popular(usage, count: Self.popularCount)
    }

    private func render() async {
        guard loaded else { return }
        let key = renderKey
        failed = false
        let input = input(for: format)
        let card = await Task.detached(priority: .userInitiated) { MessageCardRenderer.render(input) }.value
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
        if request.quick && !quickSent {
            quickSent = true
            save()
        }
    }

    private enum Outcome { case gallery, shared, cancelled, denied }

    private func save() {
        guard ready, !busy, let rendered else { return }
        busy = true
        notice = nil
        Task {
            let saved = await PhotoLibraryManager.shared.saveImageFile(rendered.png, fileName: MessageCardSubject.fileName(at: Date()))
            busy = false
            finish(saved ? .gallery : .denied)
        }
    }

    private func share() {
        guard ready, !busy, let rendered else { return }
        notice = nil
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(MessageCardSubject.fileName(at: Date()))
        do {
            try rendered.png.write(to: url, options: .atomic)
            shareFile = ShareFile(url: url)
        } catch {
            notice = MessageCardExportText.text("export.announce.failed", "Impossible de créer l’image")
        }
    }

    /// Chaque carte ENREGISTRÉE compte pour son template ; un refus reste dans
    /// la feuille, où l'utilisateur peut réessayer.
    private func finish(_ outcome: Outcome) {
        switch outcome {
        case .gallery, .shared:
            MessageCardUsage.record(format.template, in: store)
            HapticFeedback.success()
            onClose()
            let message = outcome == .gallery
                ? MessageCardExportText.text("export.announce.gallery", "Image enregistrée dans la galerie")
                : MessageCardExportText.text("export.announce.shared", "Image prête")
            FeedbackToastManager.shared.showSuccess(message)
        case .cancelled:
            notice = nil
        case .denied:
            notice = MessageCardExportText.text("export.announce.photosDenied", "Autorisez Meeshy à ajouter des photos pour enregistrer l’image")
        }
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .none
        return formatter
    }()
}
