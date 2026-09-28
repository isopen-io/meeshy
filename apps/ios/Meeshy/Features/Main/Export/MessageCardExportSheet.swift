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
    let accentHex: String
    /// « Export rapide » : le format par défaut, enregistré dès que la carte est peinte.
    let quick: Bool
}

/// **EXPORTER UN MESSAGE EN IMAGE — UN COMPOSER SIMPLIFIÉ.** Miroir natif de
/// `apps/web/src/routes/thread-export-sheet.tsx` : la feuille ne crée aucun
/// contenu, elle choisit comment MONTRER ce qui existe (le template, le titre
/// de la conversation, les noms des auteurs ou leur anonymat, la date), montre
/// la carte telle qu'elle partira, puis l'enregistre.
///
/// Des centaines de templates se choisissent par leurs trois dimensions —
/// couleurs, typographie, liaison — ou d'un geste : les « Populaires » (les
/// plus enregistrés sur l'appareil, puis la vitrine) et « Au hasard ». Après le
/// format, la LANGUE. Deux gestes à la fin : « Sauvegarder » (la photothèque,
/// album Meeshy) et « Partager » (la feuille du système).
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
    @State private var exportLanguage: String?
    @State private var rendered: Rendered?
    @State private var failed = false
    @State private var busy = false
    @State private var notice: String?
    @State private var shareFile: ShareFile?
    @State private var quickSent = false
    @State private var loaded = false

    @Environment(\.colorScheme) private var colorScheme

    private struct Rendered {
        let key: String
        let image: UIImage
        let png: Data
        let truncated: Bool
    }

    private struct ShareFile: Identifiable {
        let url: URL
        var id: String { url.path }
    }

    private static let popularCount = 6

    private var accent: Color { Color(hex: request.accentHex) }

    private var subject: MessageCardSubject {
        exportLanguage.flatMap(request.subjectIn) ?? request.subject
    }

    private var title: String? {
        guard let trimmed = request.conversationTitle?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    private var renderKey: String { "\(format.serialized)|\(exportLanguage ?? "")" }
    private var ready: Bool { rendered?.key == renderKey }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    preview
                    if let notice {
                        Text(notice)
                            .font(.footnote)
                            .foregroundStyle(MeeshyColors.error)
                    }
                    if ready, rendered?.truncated == true {
                        Text(Self.text("export.card.truncated", "Message long : la fin est coupée sur l’image."))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    popularRow
                    paletteRow
                    typefaceRow
                    linkRow
                    optionsRow
                    if request.languages.count > 1 { languageRow }
                    actions
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .navigationTitle(Self.text("export.card.title", "Exporter en image"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(Self.text("common.cancel", "Annuler"), action: onClose)
                }
            }
        }
        .tint(accent)
        .onAppear(perform: load)
        .task(id: "\(loaded)|\(renderKey)") { await render() }
        .sheet(item: $shareFile) { file in
            ShareSheet(activityItems: [file.url]) { completed in
                shareFile = nil
                finish(completed ? .shared : .cancelled)
            }
        }
    }

    // MARK: - Aperçu

    private var preview: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(uiColor: .secondarySystemBackground))
            if let rendered {
                Image(uiImage: rendered.image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(12)
                    .opacity(ready ? 1 : 0.55)
                    .accessibilityLabel(Self.text("export.card.preview", "Aperçu de l’image"))
            } else if failed {
                Text(Self.text("export.announce.failed", "Impossible de créer l’image"))
                    .font(.footnote)
                    .foregroundStyle(MeeshyColors.error)
                    .padding()
            }
            if !ready && !failed {
                VStack(spacing: 8) {
                    ProgressView()
                    if rendered == nil {
                        Text(Self.text("export.card.rendering", "Préparation de l’image…"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 240, maxHeight: 420)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Choix

    private var popularRow: some View {
        ChipRow(label: Self.text("export.card.popular", "Populaires")) {
            chip(Self.text("export.card.random", "Au hasard"), selected: false, systemImage: "dice") {
                format.template = MessageCardTemplates.random()
            }
            ForEach(popular, id: \.self) { id in
                chip(Self.templateLabel(id), selected: id == format.template, swatch: id.palette.palette) {
                    format.template = id
                }
            }
        }
    }

    private var paletteRow: some View {
        ChipRow(label: Self.text("export.card.palette", "Couleurs")) {
            ForEach(MessageCardPaletteID.allCases, id: \.self) { palette in
                chip(palette.palette.name, selected: palette == format.template.palette, swatch: palette.palette) {
                    format.template = format.template.with(palette: palette)
                }
            }
        }
    }

    private var typefaceRow: some View {
        ChipRow(label: Self.text("export.card.typeface", "Typographie")) {
            ForEach(MessageCardTypefaceID.allCases, id: \.self) { typeface in
                chip(Self.typefaceLabel(typeface), selected: typeface == format.template.typeface, font: typeface.typeface.replyFace) {
                    format.template = format.template.with(typeface: typeface)
                }
            }
        }
    }

    private var linkRow: some View {
        ChipRow(label: Self.text("export.card.link", "Liaison")) {
            ForEach(MessageCardLinkID.allCases, id: \.self) { link in
                chip(Self.linkLabel(link), selected: link == format.template.link) {
                    format.template = format.template.with(link: link)
                }
            }
        }
    }

    /// L'anonymat n'a de sens que pour un nom PEINT — et celui du message cité, que s'il y en a un.
    private var optionsRow: some View {
        ChipRow(label: Self.text("export.card.options", "Afficher")) {
            ForEach(format.offeredToggles(hasConversationTitle: title != nil, hasQuote: subject.quoted != nil), id: \.self) { toggle in
                chip(Self.toggleLabel(toggle), selected: format[toggle], systemImage: format[toggle] ? "checkmark" : nil) {
                    format[toggle].toggle()
                }
            }
        }
    }

    private var languageRow: some View {
        ChipRow(label: Self.text("export.card.language", "Langue du message")) {
            chip(Self.text("export.card.language.asRead", "Comme je le lis"), selected: exportLanguage == nil) {
                exportLanguage = nil
            }
            ForEach(request.languages, id: \.self) { code in
                chip(LanguageDisplay.from(code: code)?.name ?? code.uppercased(), selected: exportLanguage == code) {
                    exportLanguage = code
                }
            }
        }
    }

    // MARK: - Gestes

    private var isDefault: Bool { savedDefault == format }

    private var actions: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                Button { save() } label: {
                    Label(Self.text("export.card.save", "Sauvegarder"), systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                Button { share() } label: {
                    Label(Self.text("export.card.share", "Partager"), systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
            }
            .disabled(!ready || busy)
            Button {
                MessageCardFormat.writeDefault(format, to: store)
                savedDefault = format
                HapticFeedback.success()
            } label: {
                Label(
                    isDefault
                        ? Self.text("export.card.default.current", "Format par défaut")
                        : Self.text("export.card.default.save", "Utiliser comme format par défaut"),
                    systemImage: isDefault ? "checkmark.seal.fill" : "bookmark"
                )
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .disabled(isDefault)
        }
        .padding(.top, 6)
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        let stored = MessageCardFormat.readDefault(from: store)
        savedDefault = stored
        format = stored ?? .initial
        popular = MessageCardUsage.popular(MessageCardUsage.read(from: store), count: Self.popularCount)
    }

    private func render() async {
        guard loaded else { return }
        let key = renderKey
        failed = false
        let input = MessageCardInput.of(
            subject: subject,
            format: format,
            handle: request.handle,
            conversationTitle: title,
            anonymousLabel: Self.text("export.card.anonymous", "Anonyme"),
            formatDate: { Self.dateFormatter.string(from: $0) }
        )
        let card = await Task.detached(priority: .userInitiated) { MessageCardRenderer.render(input) }.value
        guard !Task.isCancelled, key == renderKey else { return }
        guard let card, let image = UIImage(data: card.png) else {
            failed = true
            return
        }
        rendered = Rendered(key: key, image: image, png: card.png, truncated: card.truncated)
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
            notice = Self.text("export.announce.failed", "Impossible de créer l’image")
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
                ? Self.text("export.announce.gallery", "Image enregistrée dans la galerie")
                : Self.text("export.announce.shared", "Image prête")
            FeedbackToastManager.shared.showSuccess(message)
        case .cancelled:
            notice = nil
        case .denied:
            notice = Self.text("export.announce.photosDenied", "Autorisez Meeshy à ajouter des photos pour enregistrer l’image")
        }
    }

    // MARK: - Pastilles

    private func chip(
        _ label: String,
        selected: Bool,
        swatch: MessageCardPalette? = nil,
        font: MessageCardFace? = nil,
        systemImage: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            HStack(spacing: 8) {
                if let swatch {
                    Circle()
                        .fill(LinearGradient(colors: swatch.background.map { Self.color($0.color) }, startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 16, height: 16)
                        .overlay(Circle().stroke(Color.primary.opacity(0.15), lineWidth: 1))
                }
                if let systemImage {
                    Image(systemName: systemImage).font(.footnote.weight(.semibold))
                }
                Text(label)
                    .font(font.map { Font(MessageCardRenderer.uiFont(MessageCardFont(face: $0, size: 16)) as CTFont) } ?? .subheadline.weight(.semibold))
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .foregroundStyle(selected ? Color.white : Color.primary)
            .background(
                Capsule().fill(selected ? accent : Color(uiColor: .secondarySystemBackground))
            )
            .overlay(Capsule().stroke(selected ? accent : Color.primary.opacity(0.08), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    private struct ChipRow<Content: View>: View {
        let label: String
        @ViewBuilder let content: () -> Content

        var body: some View {
            VStack(alignment: .leading, spacing: 8) {
                Text(label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) { content() }
                        .padding(.vertical, 1)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(label)
        }
    }

    // MARK: - Libellés

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .none
        return formatter
    }()

    private static func color(_ color: MessageCardColor) -> Color {
        Color(.sRGB, red: color.red, green: color.green, blue: color.blue, opacity: color.alpha)
    }

    static func text(_ key: StaticString, _ fallback: String.LocalizationValue) -> String {
        String(localized: key, defaultValue: fallback, bundle: .main)
    }

    static func templateLabel(_ id: MessageCardTemplateID) -> String {
        "\(id.palette.palette.name) · \(typefaceLabel(id.typeface)) · \(linkLabel(id.link))"
    }

    static func typefaceLabel(_ typeface: MessageCardTypefaceID) -> String {
        switch typeface {
        case .rond: return text("export.card.typeface.rond", "Ronde")
        case .didone: return text("export.card.typeface.didone", "Didone")
        case .plume: return text("export.card.typeface.plume", "Plume")
        case .affiche: return text("export.card.typeface.affiche", "Affiche")
        case .futur: return text("export.card.typeface.futur", "Futuriste")
        case .machine: return text("export.card.typeface.machine", "Machine à écrire")
        case .marqueur: return text("export.card.typeface.marqueur", "Marqueur")
        case .systeme: return text("export.card.typeface.systeme", "Système")
        }
    }

    static func linkLabel(_ link: MessageCardLinkID) -> String {
        switch link {
        case .orbite: return text("export.card.link.orbite", "Orbite")
        case .filet: return text("export.card.link.filet", "Filet")
        case .guillemets: return text("export.card.link.guillemets", "Guillemets")
        case .fleche: return text("export.card.link.fleche", "Flèche")
        case .bulles: return text("export.card.link.bulles", "Bulles")
        case .fil: return text("export.card.link.fil", "Fil")
        case .silence: return text("export.card.link.silence", "Silence")
        }
    }

    static func toggleLabel(_ toggle: MessageCardFormat.Toggle) -> String {
        switch toggle {
        case .showConversationTitle: return text("export.card.option.title", "Titre de la conversation")
        case .showAuthors: return text("export.card.option.authors", "Noms des auteurs")
        case .showDate: return text("export.card.option.date", "Date")
        case .anonymizeQuoted: return text("export.card.option.anonymizeQuoted", "Anonymiser le message cité")
        case .anonymizeReply: return text("export.card.option.anonymizeReply", "Anonymiser la réponse")
        }
    }
}
