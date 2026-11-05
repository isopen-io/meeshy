import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le chrome du repos, posé SUR la scène** (#13839).
///
/// ✕ en haut à gauche, la rangée des diapos au centre dès deux diapos, ↶ ↷ en
/// haut à droite seulement avec un historique, puis la colonne des boutons
/// ronds sous ↶ ↷ — ses outils défilent quand elle dépasse la hauteur (#14050),
/// son pied jamais (#14622). Ce chrome est de l'éditeur : il n'entre ni dans l'export,
/// ni dans la capture du player, ni dans la vignette, et un toucher qui le vise
/// n'atteint jamais le canvas. Hors de ses boutons, la scène garde ses gestes.
struct ComposerSceneOverlayChrome: View {

    struct Sound {
        var trace: StoryAudioPlayerObject?
        var onEdit: (() -> Void)?
        var onDelete: (() -> Void)?
        var onPromote: (() -> Void)?
    }

    let state: ComposerRestChrome.State
    var slideRow: AnyView?
    var slideCount: Int = 1
    let onClose: () -> Void
    var onUndo: (() -> Void)?
    var onRedo: (() -> Void)?
    var tools: [ComposerRestTool] = []
    var onTool: ((ComposerRestTool) -> Void)?
    var mediaLongPress: ComposerRailDoorLongPressHandler?
    var moreMenu: AnyView?
    var sound = Sound()
    var pasteEntry: AnyView?
    var backgroundIsMedia = false
    /// Le texte du post déjà écrit (#14457) : l'option le dit par un point.
    var postText = ""
    /// Le niveau du haut du rail d'édition (#13957, #13974, R6) : il prend la
    /// place de la colonne des outils, jamais une barre en plus.
    var selection: ComposerSelectionColumn?
    /// L'écart entre le bord de l'écran et celui de la scène, quand elle prend
    /// toute la HAUTEUR et laisse une marge de chaque côté (iPhone SE).
    var sceneSideInset: CGFloat = 0
    /// L'écart entre le haut du chrome et celui de la scène, quand elle
    /// commence plus bas que lui (iPhone SE, 12 pt d'air au-dessus d'elle).
    var sceneTopInset: CGFloat = 0

    @State private var press = ComposerRailDoorPress()
    /// La bande haute que la fenêtre réserve (Dynamic Island, barre d'état),
    /// quand l'hôte pose ce chrome dessous (#16246).
    @State private var unsafeTop: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            if ComposerRestChrome.topRowIsShown(state) { topRow.transition(.opacity) }
            ZStack(alignment: .topTrailing) {
                if ComposerRestChrome.toolColumnIsShown(state) {
                    toolColumn.transition(.opacity)
                }
                if ComposerRestChrome.selectionColumnIsShown(state), let selection {
                    // Un niveau posé par-dessus remplace celui du dessous : même
                    // place, un seul mouvement.
                    selection
                        .id(ComposerEditRailStack.levelKey(selection.level))
                        .transition(ComposerSelectionChrome.levelTransition(reduceMotion: reduceMotion))
                }
            }
            .animation(ComposerSelectionChrome.transition(reduceMotion: reduceMotion),
                       value: selection.map { ComposerEditRailStack.levelKey($0.level) })
            .padding(.trailing, ComposerRestChrome.toolColumnInnerMargin)
            .frame(maxWidth: .infinity, alignment: .trailing)
            Spacer(minLength: 0)
        }
        .animation(ComposerSelectionChrome.transition(reduceMotion: reduceMotion),
                   value: ComposerRestChrome.selectionColumnIsShown(state))
        .padding(.horizontal, MeeshySpacing.smPlus)
        .padding(.horizontal, max(0, sceneSideInset))
        // Rien ne se pose dans la bande haute de la fenêtre (#16246) : une
        // colonne qui défile et dont le haut y tombe l'annexe jusqu'au bord de
        // l'écran — cadre et toucher — et passe sous ↶ ↷.
        .padding(.top, MeeshySpacing.xs + max(0, sceneTopInset, unsafeTop))
        .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top } action: { unsafeTop = max(0, $0) }
    }

    private var topRow: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.sm) {
            roundButton(symbol: "xmark", label: ComposerDocumentCopy.close, id: "composer.close", action: onClose)
                .opacity(ComposerRestChrome.closeIsShown(state) ? 1 : 0)
                .allowsHitTesting(ComposerRestChrome.closeIsShown(state))
                .accessibilityHidden(!ComposerRestChrome.closeIsShown(state))
            if ComposerRestChrome.slideRowIsShown(state, slideCount: slideCount), let slideRow {
                slideRow.frame(maxWidth: .infinity)
            } else {
                Spacer(minLength: 0)
            }
            if ComposerRestChrome.historyIsShown(state) { history }
        }
    }

    @ViewBuilder
    private var history: some View {
        if let onUndo {
            roundButton(symbol: "arrow.uturn.backward", label: ComposerHistoryCopy.undo,
                        id: "composer.history.undo", action: onUndo)
        }
        if let onRedo {
            roundButton(symbol: "arrow.uturn.forward", label: ComposerHistoryCopy.redo,
                        id: "composer.history.redo", action: onRedo)
        }
    }

    /// Le pied — « Texte du post », ⋯, puis Coller quand le presse-papiers
    /// porte quelque chose — ne défile jamais (#14622) : ce sont les outils
    /// au-dessus de lui qui défilent, et leur bord le dit par un fondu.
    private var toolColumn: some View {
        VStack(spacing: MeeshySpacing.sm) {
            ViewThatFits(in: .vertical) {
                bodyButtons
                bodyButtons.modifier(ComposerScrollEdgeCue())
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("composer.rest.column.body")
            footButtons
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerRestChromeCopy.column))
    }

    private var bodyButtons: some View {
        VStack(spacing: MeeshySpacing.sm) {
            ForEach(ComposerRestChrome.columnBody(tools).map { AsyncRenderRow(id: $0, content: toolButton($0)) },
                    content: asyncRenderRowContent)
        }
    }

    private var footButtons: some View {
        VStack(spacing: MeeshySpacing.sm) {
            ForEach(ComposerRestChrome.columnFoot(tools).map { AsyncRenderRow(id: $0, content: toolButton($0)) },
                    content: asyncRenderRowContent)
            if let pasteEntry { pasteEntry }
        }
    }

    @ViewBuilder
    private func toolButton(_ outil: ComposerRestTool) -> some View {
        switch outil {
        case .more:
            if let moreMenu { moreMenu } else { EmptyView() }
        case .media:
            roundButton(symbol: outil.symbol, label: ComposerRestChromeCopy.label(outil),
                        id: "composer.rest.media", action: { tap(outil) })
                .simultaneousGesture(mediaLongPressGesture,
                                     including: mediaLongPress == nil ? .subviews : .all)
                .accessibilityActions { mediaSourceActions }
        case .sound:
            soundButton
        case .postText:
            roundButton(symbol: outil.symbol, label: ComposerRestChromeCopy.label(outil),
                        id: "composer.rest.postText", action: { tap(outil) })
                .overlay(alignment: .topTrailing) {
                    if ComposerPostTextPill.isWritten(postText) { ComposerCarriedDot().offset(x: -6, y: 6) }
                }
                .accessibilityValue(Text(ComposerPostTextPill.spokenValue(postText)))
        default:
            roundButton(symbol: outil.symbol,
                        label: ComposerRestChromeCopy.label(outil, backgroundIsMedia: backgroundIsMedia),
                        id: "composer.rest.\(outil.rawValue)", action: { tap(outil) })
        }
    }

    private var soundButton: some View {
        roundButton(symbol: ComposerRestTool.sound.symbol, label: ComposerRestChromeCopy.label(.sound),
                    id: "composer.rest.sound", action: soundTap)
            .overlay(alignment: .topTrailing) {
                if sound.trace != nil { ComposerCarriedDot().offset(x: -6, y: 6) }
            }
            .modifier(ComposerSoundActionsMenu(supprimer: sound.trace == nil ? nil : sound.onDelete,
                                               promouvoir: sound.trace == nil ? nil : sound.onPromote))
            .accessibilityValue(sound.trace.map { Text(ComposerAvatarSoundBadge.spokenLabel($0)) } ?? Text(""))
    }

    private func soundTap() {
        switch ComposerRestChrome.soundAction(hasBackgroundSound: sound.trace != nil,
                                              canEditBackgroundSound: sound.onEdit != nil) {
        case .editBackground: sound.onEdit?()
        case .openDoor: onTool?(.sound)
        }
    }

    private func tap(_ outil: ComposerRestTool) {
        guard press.longPressedId == nil || press.admitsTap(id: outil.rawValue, at: Date()) else { return }
        onTool?(outil)
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

    private func roundButton(symbol: String, label: String, id: String,
                             action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            ComposerSceneRoundGlyph(symbol: symbol)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
        .accessibilityIdentifier(id)
    }
}

/// Le bouton rond de 44 pt posé sur la scène : verre sous iOS 26, matière
/// translucide et voile de 38 % avant.
struct ComposerSceneRoundGlyph: View {
    let symbol: String
    var tint: Color = .white
    /// L'option dont les propriétés sont ouvertes : le verre prend la couleur
    /// de la marque, comme la rangée surlignée du rail libellé.
    var isOn: Bool = false

    static let size: CGFloat = 44
    static let veil: Double = 0.38

    var body: some View {
        Image(systemName: symbol)
            .font(.body.weight(.semibold))
            .foregroundStyle(isOn ? .white : tint)
            .frame(width: Self.size, height: Self.size)
            .adaptiveGlass(in: Circle(),
                           tint: isOn ? MeeshyColors.brandPrimary : Color.black.opacity(Self.veil),
                           interactive: true)
            .contentShape(Circle())
    }
}

/// **Le point discret d'une option qui porte déjà quelque chose** — le son de
/// fond, le texte du post (#14457) : 8 pt de la couleur de la marque, muet pour
/// VoiceOver, qui lit la valeur de l'option.
struct ComposerCarriedDot: View {
    var body: some View {
        Circle().fill(MeeshyColors.brandPrimary)
            .frame(width: 8, height: 8)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
