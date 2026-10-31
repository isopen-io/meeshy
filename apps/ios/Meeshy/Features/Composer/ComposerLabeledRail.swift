import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une rangée du rail gauche du grand écran** (#13839, L6).
nonisolated enum ComposerLabeledRailEntry: Hashable, Sendable {
    case close
    case tool(ComposerRestTool)
    case more(ComposerMoreMenuEntry)
    case plus
}

/// **Le rail gauche, ce qu'on AJOUTE à la scène** (#13839, L6, maquette validée, spec iOS § 2.5).
///
/// Fermer · Texte · Média · Sticker · Son · Dessin · Fond, puis les entrées de ⋯ qui tiennent dans la hauteur, dans
/// leur ordre du menu, puis « ⋯ Plus » pour le reste. Aucune entrée n'est perdue : ce que le rail ne pose pas, Plus
/// le sert. Animation (un sous-menu) et Tout effacer (une confirmation) restent toujours derrière Plus.
nonisolated enum ComposerLabeledRailLayout {

    struct Layout: Equatable, Sendable {
        let rows: [ComposerLabeledRailEntry]
        let plus: [ComposerMoreMenuEntry]
    }

    private static let keptBehindPlus: Set<ComposerMoreMenuEntry> = [.animation, .clearAll]

    static func resolve(tools: [ComposerRestTool], moreEntries: [ComposerMoreMenuEntry],
                        availableHeight: CGFloat, rowHeight: CGFloat, spacing: CGFloat) -> Layout {
        let fond: [ComposerLabeledRailEntry] = moreEntries.contains(.background) ? [.more(.background)] : []
        let fixes = [ComposerLabeledRailEntry.close] + tools.filter { $0 != .more }.map { .tool($0) } + fond
        let restantes = moreEntries.filter { $0 != .background }
        let candidates = restantes.filter { !keptBehindPlus.contains($0) }
        let posees = Array(candidates.prefix(max(0, capacity(availableHeight, rowHeight, spacing) - fixes.count - 1)))
        let plus = restantes.filter { !posees.contains($0) }
        return Layout(rows: fixes + posees.map { .more($0) } + (plus.isEmpty ? [] : [.plus]), plus: plus)
    }

    private static func capacity(_ height: CGFloat, _ row: CGFloat, _ spacing: CGFloat) -> Int {
        guard height.isFinite, height > 0, row > 0 else { return height.isInfinite ? .max / 2 : 0 }
        return Int(((height + spacing) / (row + spacing)).rounded(.down))
    }

    /// **L'outil dont le geste est en cours, surligné** — seul annoncé « sélectionné » par VoiceOver.
    static func openEntry(drawing: Bool, typing: Bool, portal: ComposerPortal?,
                          band: ComposerSceneBand?, effect: ComposerSceneEffect?) -> ComposerLabeledRailEntry? {
        if drawing { return .tool(.drawing) }
        if typing { return .tool(.text) }
        if let portal, let entree = entry(portal) { return entree }
        if let band { return band == .frame ? .more(.backgroundFraming) : .more(.background) }
        if let effect { return effect == .opening ? .more(.transitions) : .more(.visualEffect) }
        return nil
    }

    private static func entry(_ portal: ComposerPortal) -> ComposerLabeledRailEntry? {
        switch portal {
        case .sticker: return .tool(.sticker)
        case .sound, .soundLibrary: return .tool(.sound)
        case .background: return .more(.background)
        case .slideDuration: return .more(.slideDuration)
        case .location: return .more(.place)
        case .hashtag: return .more(.hashtags)
        case .reference: return .more(.mention)
        default: return nil
        }
    }

    /// **Les rails se taisent sans libérer leur place** pendant la frappe (la barre collée au clavier porte les
    /// réglages) et au viseur : la scène ne grandit pas sous le doigt. Une feuille, posée sous la scène dans sa
    /// colonne, les laisse parler : l'outil qui l'a ouverte reste surligné, un autre se touche directement.
    static func railsAreServed(writesText: Bool, cameraIsArmed: Bool) -> Bool {
        !writesText && !cameraIsArmed
    }
}

nonisolated enum ComposerLabeledRailCopy {

    static var plus: String {
        String(localized: "composer.rail.plus", defaultValue: "Plus", bundle: .main)
    }

    static var selection: String {
        String(localized: "composer.rail.selection", defaultValue: "SÉLECTION", bundle: .main)
    }

    static var addRail: String {
        String(localized: "composer.rail.add", defaultValue: "Ajouter à la scène", bundle: .main)
    }

    static func label(_ entry: ComposerLabeledRailEntry) -> String {
        switch entry {
        case .close: return ComposerDocumentCopy.close
        case .tool(let outil): return ComposerRestChromeCopy.label(outil)
        case .more(let entree): return ComposerMoreMenuCopy.label(entree)
        case .plus: return plus
        }
    }

    /// **Le mot affiché**, court comme la maquette (« Texte », « Média ») ; VoiceOver garde la phrase (`label`).
    static func title(_ entry: ComposerLabeledRailEntry) -> String {
        if case .more(let entree) = entry, let mot = moreTitle(entree) { return mot }
        switch entry {
        case .tool(.text): return String(localized: "composer.rail.title.text", defaultValue: "Texte", bundle: .main)
        case .tool(.media): return String(localized: "composer.rail.title.media", defaultValue: "Média", bundle: .main)
        case .tool(.sticker):
            return String(localized: "composer.rail.title.sticker", defaultValue: "Sticker", bundle: .main)
        case .tool(.sound): return String(localized: "composer.rail.title.sound", defaultValue: "Son", bundle: .main)
        case .tool(.drawing):
            return String(localized: "composer.rail.title.drawing", defaultValue: "Dessin", bundle: .main)
        case .more(.mention):
            return String(localized: "composer.rail.title.mention", defaultValue: "Mention", bundle: .main)
        case .more(.hashtags):
            return String(localized: "composer.rail.title.hashtags", defaultValue: "Hashtags", bundle: .main)
        case .more(.place): return String(localized: "composer.rail.title.place", defaultValue: "Lieu", bundle: .main)
        case .more(.addSlide):
            return String(localized: "composer.rail.title.addSlide", defaultValue: "Diapo", bundle: .main)
        case .more(.saveToPhotos):
            return String(localized: "composer.rail.title.saveToPhotos", defaultValue: "Photos", bundle: .main)
        case .more(.share): return String(localized: "composer.rail.title.share", defaultValue: "Partager", bundle: .main)
        default: return label(entry)
        }
    }

    /// Les entrées de ⋯ que le rail peut poser, au mot court : leur libellé de menu ne tient pas dans 112 pt.
    private static func moreTitle(_ entree: ComposerMoreMenuEntry) -> String? {
        switch entree {
        case .background:
            return String(localized: "composer.rail.title.background", defaultValue: "Fond", bundle: .main)
        case .transitions:
            return String(localized: "composer.rail.title.transitions", defaultValue: "Transitions", bundle: .main)
        case .visualEffect:
            return String(localized: "composer.rail.title.visualEffect", defaultValue: "Effet", bundle: .main)
        case .backgroundFraming:
            return String(localized: "composer.rail.title.backgroundFraming", defaultValue: "Cadrage", bundle: .main)
        case .slideDuration:
            return String(localized: "composer.rail.title.slideDuration", defaultValue: "Durée", bundle: .main)
        case .legend:
            return String(localized: "composer.rail.title.legend", defaultValue: "Légende", bundle: .main)
        case .preview:
            return String(localized: "composer.rail.title.preview", defaultValue: "Aperçu", bundle: .main)
        case .pickBackground:
            return String(localized: "composer.rail.title.pickBackground", defaultValue: "Autre fond", bundle: .main)
        case .removeBackground:
            return String(localized: "composer.rail.title.removeBackground", defaultValue: "Sans fond", bundle: .main)
        default:
            return nil
        }
    }

    static func symbol(_ entry: ComposerLabeledRailEntry) -> String {
        switch entry {
        case .close: return "xmark"
        case .tool(let outil): return outil.symbol
        case .more(let entree): return ComposerMoreMenuCopy.icon(entree)
        case .plus: return ComposerRestTool.more.symbol
        }
    }
}

/// **Ce que « ⋯ Plus » sert, outre ses entrées** : le sous-menu Animation et la confirmation de « Tout effacer »,
/// les mêmes que le ⋯ du petit écran.
struct ComposerRailPlusActions {
    let isAnimated: Bool
    let clearAllAsked: Binding<Bool>
    let onClearAll: () -> Void
    let onAnimation: () -> Void
    let onTimeline: () -> Void
}

/// **La rangée libellée** : glyphe et mot, 44 pt au moins, surlignée quand son outil est ouvert.
struct ComposerLabeledRailRow: View {
    let symbol: String
    let label: String
    var isOn: Bool = false
    var tint: Color = ComposerFloatingRailInk.rest

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: symbol)
                .font(.body.weight(.semibold))
                .frame(width: 22)
                .accessibilityHidden(true)
            Text(label)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .truncationMode(.tail)
            Spacer(minLength: 0)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, MeeshySpacing.sm)
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
            .fill(isOn ? MeeshyColors.brandPrimary : Color.clear))
        .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
    }
}

/// **Le rail gauche du grand écran.** Il mesure sa hauteur, demande à la loi ce qui tient, et ouvre ce que la
/// colonne du petit écran ouvrait, par les MÊMES rappels : seule la géographie change.
struct ComposerLabeledRail: View {
    let tools: [ComposerRestTool]
    let moreEntries: [ComposerMoreMenuEntry]
    let openEntry: ComposerLabeledRailEntry?
    let onClose: () -> Void
    let onTool: (ComposerRestTool) -> Void
    let onMore: (ComposerMoreMenuEntry) -> Void
    let plus: ComposerRailPlusActions?
    var mediaLongPress: ComposerRailDoorLongPressHandler?
    var sound = ComposerSceneOverlayChrome.Sound()
    var pasteEntry: AnyView?

    @ScaledMetric(relativeTo: .caption) private var rowHeight: CGFloat = 44
    @State private var press = ComposerRailDoorPress()

    private static let spacing: CGFloat = MeeshySpacing.xs
    private static let inset: CGFloat = MeeshySpacing.xsPlus

    var body: some View {
        GeometryReader { geo in
            let place = ComposerLabeledRailLayout.resolve(
                tools: tools, moreEntries: moreEntries,
                availableHeight: geo.size.height - 2 * Self.inset - (pasteEntry == nil ? 0 : rowHeight + Self.spacing),
                rowHeight: rowHeight, spacing: Self.spacing)
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: Self.spacing) {
                    ForEach(place.rows, id: \.self) { entree in row(entree, plus: place.plus) }
                    if let pasteEntry { pasteEntry.frame(maxWidth: .infinity, alignment: .leading) }
                }
                .padding(Self.inset)
            }
        }
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous),
                       tint: Color.black.opacity(ComposerSceneRoundGlyph.veil))
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerLabeledRailCopy.addRail))
    }

    @ViewBuilder
    private func row(_ entree: ComposerLabeledRailEntry, plus: [ComposerMoreMenuEntry]) -> some View {
        switch entree {
        case .plus:
            if let actions = self.plus { plusMenu(plus, actions: actions) }
        case .tool(.sound):
            soundRow
        case .tool(.media):
            button(entree, id: "composer.rail.media") { tap(.media) }
                .simultaneousGesture(mediaLongPressGesture, including: mediaLongPress == nil ? .subviews : .all)
                .accessibilityActions { mediaSourceActions }
        case .tool(let outil):
            button(entree, id: "composer.rail.\(outil.rawValue)") { tap(outil) }
        case .close:
            button(entree, id: "composer.close", action: onClose)
        case .more(let menu):
            button(entree, id: "composer.rail.more.\(menu.rawValue)") { onMore(menu) }
        }
    }

    private func plusMenu(_ entries: [ComposerMoreMenuEntry], actions: ComposerRailPlusActions) -> some View {
        ComposerSceneMoreMenu(label: ComposerOverflowCopy.menu, clearAllAsked: actions.clearAllAsked,
                              onClearAll: actions.onClearAll, railLabel: ComposerLabeledRailCopy.plus) {
            ComposerSceneMoreMenuItems(entries: entries, isAnimated: actions.isAnimated, onEntry: onMore,
                                       onAnimation: actions.onAnimation, onTimeline: actions.onTimeline)
        }
    }

    private func button(_ entree: ComposerLabeledRailEntry, id: String, action: @escaping () -> Void) -> some View {
        let ouverte = entree == openEntry
        return Button {
            action()
            HapticFeedback.light()
        } label: {
            ComposerLabeledRailRow(symbol: ComposerLabeledRailCopy.symbol(entree),
                                   label: ComposerLabeledRailCopy.title(entree),
                                   isOn: ouverte)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerLabeledRailCopy.label(entree)))
        .accessibilityAddTraits(ouverte ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier(id)
    }

    private var soundRow: some View {
        button(.tool(.sound), id: "composer.rail.sound", action: soundTap)
            .overlay(alignment: .leading) {
                if sound.trace != nil {
                    Circle().fill(MeeshyColors.brandPrimary)
                        .frame(width: 8, height: 8)
                        .offset(x: 26, y: -10)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            .modifier(ComposerSoundActionsMenu(supprimer: sound.trace == nil ? nil : sound.onDelete,
                                               promouvoir: sound.trace == nil ? nil : sound.onPromote))
            .accessibilityValue(sound.trace.map { Text(ComposerAvatarSoundBadge.spokenLabel($0)) } ?? Text(""))
    }

    private func soundTap() {
        switch ComposerRestChrome.soundAction(hasBackgroundSound: sound.trace != nil,
                                              canEditBackgroundSound: sound.onEdit != nil) {
        case .editBackground: sound.onEdit?()
        case .openDoor: onTool(.sound)
        }
    }

    private func tap(_ outil: ComposerRestTool) {
        guard press.longPressedId == nil || press.admitsTap(id: outil.rawValue, at: Date()) else { return }
        onTool(outil)
    }

    private var mediaLongPressGesture: some Gesture {
        LongPressGesture(minimumDuration: ComposerRailDoorPress.minimumDuration).onEnded { _ in
            guard let mediaLongPress else { return }
            press.noteLongPress(id: ComposerRestTool.media.rawValue, at: Date())
            HapticFeedback.medium()
            mediaLongPress.offer(.media)
        }
    }

    @ViewBuilder
    private var mediaSourceActions: some View {
        if let mediaLongPress {
            ForEach(mediaLongPress.sources.map { source in
                        AsyncRenderRow(id: "\(source)",
                                       content: Button(ComposerMediaSourcePolicy.longPressLabel(source)) {
                                           mediaLongPress.choose(source)
                                       })
                    },
                    content: asyncRenderRowContent)
        }
    }
}
