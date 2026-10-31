import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le chrome du repos, posé SUR la scène** (#13839).
///
/// ✕ en haut à gauche, la rangée des diapos au centre dès deux diapos, ↶ ↷ en
/// haut à droite seulement avec un historique, puis la colonne des six boutons
/// ronds sous ↶ ↷. Ce chrome est de l'éditeur : il n'entre ni dans l'export,
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
    /// La barre d'un élément sélectionné (#13839, L5), en bas de la scène,
    /// juste au-dessus de Public et Publier.
    var selectionBar: ComposerSelectionBar?

    @State private var press = ComposerRailDoorPress()

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            if ComposerRestChrome.topRowIsShown(state) { topRow.transition(.opacity) }
            if ComposerRestChrome.toolColumnIsShown(state) {
                toolColumn
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .transition(.opacity)
            }
            Spacer(minLength: 0)
            if ComposerRestChrome.selectionBarIsShown(state), let selectionBar {
                selectionBar
                    .padding(.bottom, MeeshySpacing.sm)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.18), value: ComposerRestChrome.selectionBarIsShown(state))
        .padding(.horizontal, MeeshySpacing.smPlus)
        .padding(.top, MeeshySpacing.xs)
    }

    private var topRow: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.sm) {
            roundButton(symbol: "xmark", label: ComposerDocumentCopy.close, id: "composer.close", action: onClose)
            if ComposerRestChrome.showsSlideRow(slideCount: slideCount), let slideRow {
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

    private var toolColumn: some View {
        VStack(spacing: MeeshySpacing.sm) {
            ForEach(tools, id: \.self) { outil in toolButton(outil) }
            if let pasteEntry { pasteEntry }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerRestChromeCopy.column))
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
        default:
            roundButton(symbol: outil.symbol, label: ComposerRestChromeCopy.label(outil),
                        id: "composer.rest.\(outil.rawValue)", action: { tap(outil) })
        }
    }

    private var soundButton: some View {
        roundButton(symbol: ComposerRestTool.sound.symbol, label: ComposerRestChromeCopy.label(.sound),
                    id: "composer.rest.sound", action: soundTap)
            .overlay(alignment: .topTrailing) {
                if sound.trace != nil {
                    Circle().fill(MeeshyColors.brandPrimary)
                        .frame(width: 8, height: 8)
                        .offset(x: -6, y: 6)
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

    static let size: CGFloat = 44
    static let veil: Double = 0.38

    var body: some View {
        Image(systemName: symbol)
            .font(.body.weight(.semibold))
            .foregroundStyle(.white)
            .frame(width: Self.size, height: Self.size)
            .adaptiveGlass(in: Circle(), tint: Color.black.opacity(Self.veil), interactive: true)
            .contentShape(Circle())
    }
}
