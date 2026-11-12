#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK11 = MeeshyKitCatalogEntry(
        key: "K11",
        name: "MeeshyExpandingPill",
        states: [
            MeeshyKitCatalogState(id: "repos", boardView: "R2", backdrop: .media),
            MeeshyKitCatalogState(id: "formats", boardView: "R7", backdrop: .media),
            MeeshyKitCatalogState(id: "disposition", boardView: "R8", backdrop: .media),
            MeeshyKitCatalogState(id: "audience", boardView: "R9", backdrop: .media),
            MeeshyKitCatalogState(id: "fond", boardView: "S1", backdrop: .media),
            MeeshyKitCatalogState(id: "duree", boardView: "S5", backdrop: .media),
            MeeshyKitCatalogState(id: "humeur", boardView: "P5", backdrop: .media),
            MeeshyKitCatalogState(id: "outil", boardView: "O5", backdrop: .media),
            MeeshyKitCatalogState(id: "description", boardView: "O9", backdrop: .media),
            MeeshyKitCatalogState(id: "temps", boardView: "O10", backdrop: .media),
            MeeshyKitCatalogState(id: "confirmation", boardView: "R12", backdrop: .media),
            MeeshyKitCatalogState(id: "confirmation-courte", boardView: "P4", backdrop: .media),
            MeeshyKitCatalogState(id: "appel", backdrop: .dark),
            MeeshyKitCatalogState(id: "clair", backdrop: .light),
            MeeshyKitCatalogState(id: "defile", backdrop: .media),
            MeeshyKitCatalogState(id: "bascule", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK11(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyExpandingPillSample(stateID: state.id)
    }
}

/// L'échantillon d'un état : la vraie pilule, dans la place d'un téléphone de 390
/// (366 une fois les bords de 12 retirés), au corps des vues de la planche. Le
/// catalogue ne porte que des valeurs ; les actions sont vides.
private struct MeeshyExpandingPillSample: View {
    let stateID: String

    private static let phonePlace: CGFloat = 366
    private static let roomyBody: CGFloat = 420
    private static let cappedBody: CGFloat = 260

    var body: some View {
        sample
            .frame(width: Self.phonePlace)
    }

    @ViewBuilder
    private var sample: some View {
        switch stateID {
        case "repos": pill(option: nil, tools: Self.composerTools, primary: "Publier") { _ in EmptyView() }
        case "formats": list(id: "formats", title: "Publier comme", primary: "Publier la story", checked: "Story")
        case "disposition": list(id: "disposition", title: "Publier comme", primary: "Publier le post", checked: "Post")
        case "audience": audiencePill
        case "fond": backgroundPill
        case "duree": durationsPill
        case "humeur": moodPill
        case "outil": toolPill
        case "description": descriptionPill
        case "temps": timingPill
        case "confirmation": confirmation(title: "Tout effacer de la scène ?",
                                          message: "Le fond, le texte, le sticker et le son de cette scène.",
                                          cancel: "Annuler", confirm: "Tout effacer")
        case "confirmation-courte": confirmation(title: "Fermer le brouillon ?", message: nil,
                                                 cancel: "Garder le brouillon", confirm: "Abandonner")
        case "appel": callPill
        case "clair": lightPill
        case "defile": scrollingPill
        default: MeeshyExpandingPillToggleDemo()
        }
    }

    // MARK: États

    private func list(id: String, title: String, primary: String, checked: String) -> some View {
        pill(option: MeeshyExpandingPillOption(id: id, title: title), tools: Self.composerTools, primary: primary,
             maxBodyHeight: Self.roomyBody) { _ in
            VStack(spacing: 0) {
                ForEach(Self.formats, id: \.title) { format in
                    MeeshyExpandingPillSampleRow(
                        title: format.title, subtitle: format.subtitle, isOn: format.title == checked, isEnabled: format.isEnabled
                    )
                }
            }
        }
    }

    private var audiencePill: some View {
        pill(option: MeeshyExpandingPillOption(id: "audience", title: "Audience", keepsRow: false), tools: [], primary: nil,
             maxBodyHeight: Self.roomyBody) { _ in
            VStack(spacing: 0) {
                ForEach(Self.audiences, id: \.title) { audience in
                    MeeshyExpandingPillSampleRow(
                        title: audience.title, subtitle: audience.subtitle, isOn: audience.title == "Amis", isEnabled: true,
                        symbol: audience.symbol
                    )
                }
            }
        }
    }

    private var backgroundPill: some View {
        pill(option: MeeshyExpandingPillOption(id: "fond", title: "Fond"), tools: Self.composerTools, primary: "Publier") { _ in
            HStack(spacing: MeeshySpacing.md) {
                ForEach(Self.swatches.indices, id: \.self) { index in
                    Circle().fill(Self.swatches[index]).frame(width: MeeshySpacing.xxxl, height: MeeshySpacing.xxxl)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var durationsPill: some View {
        pill(option: MeeshyExpandingPillOption(id: "duree", title: "Durée de la scène"), tools: Self.composerTools,
             primary: "Publier") { _ in
            HStack {
                ForEach(["5 s", "10 s", "15 s", "30 s", "60 s"], id: \.self) { value in
                    Text(verbatim: value)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(value == "15 s" ? MeeshyColors.indigo950 : MeeshyColors.onMedia)
                        .frame(width: Self.durationDisc, height: Self.durationDisc)
                        .background(Circle().fill(MeeshyColors.onMedia.opacity(value == "15 s" ? 1 : 0.1)))
                    if value != "60 s" { Spacer(minLength: 0) }
                }
            }
        }
    }

    private static let durationDisc: CGFloat = 56

    private var moodPill: some View {
        pill(option: MeeshyExpandingPillOption(id: "humeur", title: "Humeur"), tools: Array(Self.composerTools.prefix(3)),
             primary: "Publier l'humeur") { _ in
            HStack {
                ForEach(["😀", "😍", "😎", "🥳", "😴"], id: \.self) { mood in
                    Text(verbatim: mood).font(.title).frame(maxWidth: .infinity, minHeight: Self.durationDisc)
                }
            }
        }
    }

    private var toolPill: some View {
        pill(option: MeeshyExpandingPillOption(id: "reglages", title: "Réglages", showsHeader: false),
             tools: Self.objectTools, primary: nil, maxBodyHeight: Self.roomyBody) { _ in
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                HStack {
                    Text(verbatim: "Réglages").font(.headline)
                    Spacer(minLength: 0)
                    Text(verbatim: "Réinitialiser").font(.footnote.weight(.bold)).foregroundStyle(MeeshyColors.indigo300)
                }
                .foregroundStyle(MeeshyColors.onMedia)
                ForEach(["Exposition", "Luminosité", "Contraste", "Saturation"], id: \.self) { name in
                    MeeshyLabeledSlider(name, value: .constant(55), in: 0...100, valueText: "55")
                }
            }
        }
    }

    private var descriptionPill: some View {
        MeeshyExpandingPill(
            label: "Options de la photo",
            option: MeeshyExpandingPillOption(id: "description", title: "Description", keepsRow: false),
            onBack: {},
            buttons: { _ in EmptyView() },
            headerTrailing: { Text(verbatim: "86 / 1000").font(.footnote) },
            content: { _ in
                VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                    Text(verbatim: "Décrire l'image pour les personnes qui ne la voient pas")
                        .font(.footnote).foregroundStyle(MeeshyExpandingPillRecipe.secondaryInk)
                    Text(verbatim: "Coucher de soleil sur la plage de Ngor, un palmier à gauche, la mer calme.")
                        .foregroundStyle(MeeshyColors.onMedia)
                }
                .frame(maxWidth: .infinity, minHeight: Self.fieldHeight, alignment: .topLeading)
                .padding(MeeshySpacing.md)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(MeeshyColors.onMedia.opacity(0.1)))
            }
        )
    }

    private static let fieldHeight: CGFloat = 110

    private var timingPill: some View {
        pill(option: MeeshyExpandingPillOption(id: "temps", title: "Temps", keepsRow: false), tools: [], primary: nil) { _ in
            VStack(spacing: MeeshySpacing.md) {
                MeeshyLabeledSlider("Début", value: .constant(0), in: 0...12, valueText: "0,0 s")
                MeeshyLabeledSlider("Durée", value: .constant(5), in: 0...12, valueText: "5,0 s")
            }
        }
    }

    private func confirmation(title: String, message: String?, cancel: String, confirm: String) -> some View {
        MeeshyExpandingPill(
            label: "Pilule du composer",
            option: MeeshyExpandingPillOption(id: "confirmation", title: title, showsHeader: false, keepsRow: false),
            buttons: { _ in EmptyView() },
            content: { _ in
                MeeshyPillConfirmation(
                    title: title, message: message,
                    cancel: MeeshyPillChoice(title: cancel, action: {}),
                    confirm: MeeshyPillChoice(title: confirm, role: .destructive, action: {})
                )
            }
        )
    }

    private var callPill: some View {
        MeeshyExpandingPill(
            label: "Commandes de l'appel",
            option: MeeshyExpandingPillOption(id: "reagir", title: "Réagir"),
            onBack: {}, onClose: {},
            layout: .spread(),
            showsDivider: true,
            buttons: { size in Self.row(Self.callTools, size: size) },
            content: { _ in
                HStack {
                    ForEach(["👍", "❤️", "😂", "🎉", "👏"], id: \.self) { reaction in
                        Text(verbatim: reaction).font(.title).frame(maxWidth: .infinity, minHeight: Self.durationDisc)
                    }
                }
            }
        )
    }

    private var lightPill: some View {
        MeeshyExpandingPill(
            label: "Pilule du composer",
            option: MeeshyExpandingPillOption(id: "formats", title: "Publier comme"),
            onBack: {}, onClose: {},
            tone: .onLight,
            buttons: { size in Self.row(Self.composerTools, size: size) },
            primary: { Self.primaryAction("Publier") },
            content: { _ in
                MeeshyExpandingPillSampleRow(title: "Story", subtitle: "Visible 24 h", isOn: true, isEnabled: true)
            }
        )
    }

    private var scrollingPill: some View {
        pill(option: MeeshyExpandingPillOption(id: "journal", title: "Journal"), tools: Self.composerTools, primary: nil,
             maxBodyHeight: Self.cappedBody) { _ in
            VStack(spacing: 0) {
                ForEach(0..<14, id: \.self) { index in
                    MeeshyExpandingPillSampleRow(title: "Événement \(index + 1)", subtitle: "Il y a \(index + 1) min", isOn: false, isEnabled: true)
                }
            }
        }
    }

    // MARK: Pièces

    private func pill<Body: View>(
        option: MeeshyExpandingPillOption?,
        tools: [MeeshyExpandingPillSampleTool],
        primary: String?,
        maxBodyHeight: CGFloat? = nil,
        @ViewBuilder body: @escaping (MeeshyExpandingPillOption) -> Body
    ) -> some View {
        let noop: () -> Void = {}
        return MeeshyExpandingPill(
            label: "Pilule du composer",
            option: option,
            onBack: option == nil ? nil : noop,
            onClose: option == nil ? nil : noop,
            maxBodyHeight: maxBodyHeight,
            buttons: { size in Self.row(tools, size: size) },
            primary: { if let primary { Self.primaryAction(primary) } },
            content: body
        )
    }

    @ViewBuilder
    fileprivate static func row(_ tools: [MeeshyExpandingPillSampleTool], size: MeeshyGlassButtonSize) -> some View {
        ForEach(tools, id: \.label) { tool in
            MeeshyGlassButton(
                systemImage: tool.symbol, label: tool.label, size: size, activation: tool.activation, action: {}
            )
        }
    }

    fileprivate static func primaryAction(_ title: String) -> some View {
        Text(verbatim: title)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(MeeshyColors.indigo950)
            .padding(.horizontal, MeeshySpacing.xl)
            .frame(height: CGFloat(MeeshyGlassButtonSize.s48.diameter))
            .background(Capsule().fill(MeeshyColors.onMedia))
    }

    // MARK: Données

    fileprivate static let composerTools = [
        MeeshyExpandingPillSampleTool("photo", "Ajouter une photo"),
        MeeshyExpandingPillSampleTool("textformat", "Ajouter du texte"),
        MeeshyExpandingPillSampleTool("music.note", "Ajouter un son"),
        MeeshyExpandingPillSampleTool("face.smiling", "Ajouter un sticker"),
    ]

    private static let objectTools = [
        MeeshyExpandingPillSampleTool("chevron.backward", "Retour"),
        MeeshyExpandingPillSampleTool("sliders.horizontal", "Réglages", activation: .selected(true)),
        MeeshyExpandingPillSampleTool("crop", "Recadrer"),
        MeeshyExpandingPillSampleTool("ellipsis", "Plus d'actions"),
    ]

    private static let callTools = [
        MeeshyExpandingPillSampleTool("record.circle", "Enregistrer"),
        MeeshyExpandingPillSampleTool("face.smiling", "Réagir", activation: .expanded(true)),
        MeeshyExpandingPillSampleTool("mic.fill", "Couper le micro"),
        MeeshyExpandingPillSampleTool("phone.down.fill", "Raccrocher"),
    ]

    private static let formats = [
        MeeshyExpandingPillSampleFormat(title: "Story", subtitle: "Visible 24 h", isEnabled: true),
        MeeshyExpandingPillSampleFormat(title: "Post", subtitle: "Dans votre fil", isEnabled: true),
        MeeshyExpandingPillSampleFormat(title: "Réel", subtitle: "Demande une vidéo, un son ou deux photos", isEnabled: false),
        MeeshyExpandingPillSampleFormat(title: "Mood", subtitle: "Ne porte que du texte", isEnabled: false),
    ]

    private static let audiences = [
        MeeshyExpandingPillSampleFormat(title: "Public", subtitle: "Tout le monde", isEnabled: true, symbol: "globe"),
        MeeshyExpandingPillSampleFormat(title: "Amis", subtitle: "Vos amis acceptés", isEnabled: true, symbol: "person.2"),
        MeeshyExpandingPillSampleFormat(title: "Proches", subtitle: "Vos proches", isEnabled: true, symbol: "heart"),
        MeeshyExpandingPillSampleFormat(title: "Sauf…", subtitle: "Tous, sauf des personnes", isEnabled: true, symbol: "person.fill.xmark"),
        MeeshyExpandingPillSampleFormat(title: "Seulement…", subtitle: "Des personnes choisies", isEnabled: true, symbol: "person.fill.checkmark"),
    ]

    private static let swatches = [
        MeeshyColors.brandPrimary, MeeshyColors.success, MeeshyColors.error, MeeshyColors.warning, MeeshyColors.info,
    ]
}

private struct MeeshyExpandingPillSampleTool {
    let symbol: String
    let label: String
    var activation: MeeshyGlassButtonActivation = .none

    init(_ symbol: String, _ label: String, activation: MeeshyGlassButtonActivation = .none) {
        self.symbol = symbol
        self.label = label
        self.activation = activation
    }
}

private struct MeeshyExpandingPillSampleFormat {
    let title: String
    let subtitle: String
    let isEnabled: Bool
    var symbol: String?

    init(title: String, subtitle: String, isEnabled: Bool, symbol: String? = nil) {
        self.title = title
        self.subtitle = subtitle
        self.isEnabled = isEnabled
        self.symbol = symbol
    }
}

/// Une ligne à cocher du corps : un indisponible reste visible, grisé, avec sa raison.
private struct MeeshyExpandingPillSampleRow: View {
    let title: String
    let subtitle: String
    let isOn: Bool
    let isEnabled: Bool
    var symbol: String?

    init(title: String, subtitle: String, isOn: Bool, isEnabled: Bool, symbol: String? = nil) {
        self.title = title
        self.subtitle = subtitle
        self.isOn = isOn
        self.isEnabled = isEnabled
        self.symbol = symbol
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            if let symbol {
                Image(systemName: symbol).frame(width: MeeshySpacing.xxl)
            }
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(verbatim: title).font(.subheadline)
                Text(verbatim: subtitle).font(.footnote).foregroundStyle(MeeshyExpandingPillRecipe.secondaryInk)
            }
            Spacer(minLength: 0)
            Image(systemName: isOn ? "checkmark" : "circle")
                .opacity(symbol == nil || isOn ? 1 : 0)
        }
        .foregroundStyle(MeeshyColors.onMedia)
        .frame(minHeight: CGFloat(MeeshyControlSize.tapTarget))
        .opacity(isEnabled ? 1 : 0.62)
    }
}

/// La bascule « ouvrir, changer d'option, fermer » : le verre seul change de
/// taille, le contenu entre et sort en fondu.
private struct MeeshyExpandingPillToggleDemo: View {
    @State private var step = 0

    private static let options = [
        MeeshyExpandingPillOption(id: "formats", title: "Publier comme"),
        MeeshyExpandingPillOption(id: "audience", title: "Audience", keepsRow: false),
    ]

    private var option: MeeshyExpandingPillOption? {
        step == 0 ? nil : Self.options[(step - 1) % Self.options.count]
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            MeeshyExpandingPill(
                label: "Pilule du composer",
                option: option,
                onBack: { step = 0 },
                onClose: { step = 0 },
                buttons: { size in MeeshyExpandingPillSample.row(MeeshyExpandingPillSample.composerTools.prefix(2).map { $0 }, size: size) },
                content: { shown in
                    MeeshyExpandingPillSampleRow(title: shown.title, subtitle: "Un réglage s'applique en direct", isOn: true, isEnabled: true)
                }
            )
            Button {
                step = (step + 1) % (Self.options.count + 2)
            } label: {
                Text(verbatim: step == 0 ? "Ouvrir" : "Suivant").foregroundStyle(MeeshyColors.onMedia)
            }
        }
    }
}
#endif
