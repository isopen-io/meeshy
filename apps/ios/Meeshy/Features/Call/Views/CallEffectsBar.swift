import SwiftUI
import MeeshySDK
import MeeshyUI

/// #16979 — Effets, filtres et cadres : UNE famille d'outils. L'hôte se pose au-dessus des deux
/// modes et garde son identité quand on passe de l'un à l'autre : il dit à chacun la rangée de
/// genres de la loi pure, et retient le genre d'Effets demandé depuis le Montage (« Couleur »
/// touché au Montage ouvre Effets sur Couleur, pas sur Visage).
struct CallEffectsFamilyHost<Effects: View, Montage: View>: View {
    let mode: CallScreenMode
    let offersEffects: Bool
    let offersFrames: Bool
    @ViewBuilder let effects: (CallEffectsFamily) -> Effects
    @ViewBuilder let montage: (CallEffectsFamily) -> Montage

    @State private var entry: CallEffectsCategory = .face

    var body: some View {
        let family = CallEffectsFamily(
            genres: CallEffectsGenreRule.row(offersEffects: offersEffects || mode == .effects, offersFrames: offersFrames || mode == .montage),
            entry: entry,
            request: { entry = $0 }
        )
        switch mode {
        case .effects: effects(family)
        case .montage: montage(family)
        }
    }
}

/// Ce que l'hôte de la famille dit à un mode : la rangée de genres, le genre d'Effets où entrer,
/// et de quoi demander un genre d'Effets avant d'y passer.
struct CallEffectsFamily {
    let genres: [CallEffectKind]
    let entry: CallEffectsCategory
    let request: (CallEffectsCategory) -> Void
}

/// #16979 · P8 · C1 — LA rangée de genres de la barre, la même en Effets et en Montage : Visage ·
/// Couleur · Cadres. Le genre affiché est pressé ; toucher un autre genre le montre, dans le mode
/// qui le porte. En grand texte, la rangée défile, effacée en fondu à ses deux bords.
struct CallEffectsGenreChips: View {
    let genres: [CallEffectKind]
    let selected: CallEffectKind
    let onSelect: (CallEffectKind) -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            row
            ScrollView(.horizontal, showsIndicators: false) { row }
                .mask { ScrollEdgeFadeMask(axis: .horizontal, start: true, end: true) }
        }
        .shadow(color: .black.opacity(MeeshyOpacity.strong), radius: 3)
        .accessibilityElement(children: .contain)
    }

    /// Candidat de `ViewThatFits`, mesuré sur le rendu asynchrone d'iOS 26 : les entrées se
    /// construisent ici, dans le `body`, et le `ForEach` ne fait que les relire (#9135, #9456).
    private var row: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            ForEach(genres.map { AsyncRenderRow(id: $0, content: entry($0)) }, content: asyncRenderRowContent)
        }
        .fixedSize(horizontal: true, vertical: false)
    }

    private func entry(_ genre: CallEffectKind) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            if genre != genres.first {
                Text(verbatim: "·")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(.white.opacity(MeeshyOpacity.strong))
                    .accessibilityHidden(true)
            }
            chip(genre)
        }
    }

    private func chip(_ genre: CallEffectKind) -> some View {
        let isSelected = genre == selected
        return Button {
            guard !isSelected else { return }
            onSelect(genre)
        } label: {
            Text(CallModeCopy.genreName(genre))
                .font(.footnote.weight(.semibold))
                .foregroundColor(.white.opacity(isSelected ? 1 : 0.55))
                .lineLimit(1)
                .padding(.horizontal, MeeshySpacing.sm)
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])
    }
}

/// P8 · P8b · C1 — la barre d'Effets, LA barre de la famille d'outils (Effets, filtres, cadres :
/// Effets et Montage la partagent, #16979) : UN verre d'une pièce (l'atome partagé de la pilule),
/// qui parle la langue du composer. En haut, la rangée de puces des looks et son filet ; en bas, la
/// rangée de base ‹ · Réglages · (+). Réglages (ou la liste des effets appliqués) ouvert, la MÊME
/// barre perd sa rangée de puces, en fondu, et se resserre par morphisme sur ‹ · Réglages · (+) ;
/// le panneau vit au-dessus d'elle, dans son propre verre. Retoucher Réglages (disque blanc) rend
/// les puces par le chemin inverse.
struct CallEffectsBar<Looks: View>: View {
    let mode: CallEffectsBarMode
    let layers: CallEffectLayers
    /// Ce que Réglages ouvre : la luminosité et le flou en Effets, « Chaque visage » au Montage.
    var settingsHint: String = CallModeCopy.settingsHint
    let onBack: () -> Void
    let onSettings: () -> Void
    let onAddLook: () -> Void
    let onShowApplied: () -> Void
    @ViewBuilder let looks: () -> Looks

    private static var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous)
    }

    var body: some View {
        AdaptiveGlassContainer(spacing: CallControlGlassMetrics.containerSpacing) {
            VStack(spacing: MeeshySpacing.sm) {
                if CallEffectsBarRule.showsLooks(mode) {
                    lookChips
                        .transition(.opacity)
                }
                baseRow
            }
            .padding(MeeshySpacing.sm)
        }
        .clipShape(Self.shape)
        .callControlsGlass(in: Self.shape)
        .accessibilityElement(children: .contain)
    }

    private var lookChips: some View {
        VStack(spacing: MeeshySpacing.sm) {
            looks()
            Rectangle()
                .fill(Color.white.opacity(MeeshyOpacity.light))
                .frame(height: 1)
                .accessibilityHidden(true)
        }
    }

    private var baseRow: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            CallPillButton(
                symbol: "chevron.backward",
                kind: .normal,
                label: CallModeCopy.backToCall,
                hint: CallModeCopy.backToCallHint,
                diameter: Self.diameter,
                action: onBack
            )
            Spacer(minLength: 0)
            CallPillButton(
                symbol: "gearshape",
                kind: mode == .settings ? .active : .normal,
                label: CallModeCopy.settings,
                caption: CallModeCopy.settings,
                hint: settingsHint,
                toggleState: mode == .settings,
                diameter: Self.diameter,
                action: onSettings
            )
            Spacer(minLength: 0)
            CallEffectsAddButton(
                isFull: layers.isFull,
                hasLayers: !layers.isEmpty,
                onAdd: onAddLook,
                onShowApplied: onShowApplied
            )
        }
        .padding(.horizontal, MeeshySpacing.xs)
    }

    private static var diameter: CGFloat { 44 }
}

/// (+) · #16979 — un toucher ajoute un look d'un autre genre ; un APPUI LONG liste les effets
/// appliqués pour en annuler un. VoiceOver, qui ne voit pas l'appui long, a la même liste par une
/// action nommée. Pile pleine, (+) n'ajoute plus — il le dit à son étiquette, s'atténue — et garde
/// son appui long.
struct CallEffectsAddButton: View {
    let isFull: Bool
    let hasLayers: Bool
    let onAdd: () -> Void
    let onShowApplied: () -> Void

    @State private var isPressed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.callChromeInteraction) private var reportInteraction

    private static let fullOpacity = 0.5

    var body: some View {
        CallPillButtonLabel(symbol: "plus", kind: .normal, caption: nil, diameter: MeeshyControlSize.tapTarget)
            .opacity(isFull ? Self.fullOpacity : 1)
            .scaleEffect(CallPressFeedback.scale(isPressed: isPressed, reduceMotion: reduceMotion))
            .animation(CallPressFeedback.animation(isPressed: isPressed, reduceMotion: reduceMotion), value: isPressed)
            .onTapGesture(perform: onAdd)
            .onLongPressGesture(minimumDuration: CallModeGestureRule.longPressDuration, maximumDistance: 24, perform: showApplied, onPressingChanged: pressing)
            .onDisappear {
                guard isPressed else { return }
                reportInteraction?(.touchEnded)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(isFull ? CallModeCopy.addLookFull : CallModeCopy.addLook)
            .accessibilityHint(isFull ? CallModeCopy.addLookFullHint : CallModeCopy.addLookHint)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(.default, onAdd)
            .accessibilityActions {
                if hasLayers {
                    Button(CallEffectsCopy.appliedTitle, action: onShowApplied)
                }
            }
    }

    private func showApplied() {
        guard hasLayers else { return }
        HapticFeedback.medium()
        onShowApplied()
    }

    private func pressing(_ pressed: Bool) {
        isPressed = pressed
        reportInteraction?(pressed ? .touchBegan : .touchEnded)
    }
}

/// P8b · C1 — le verre SÉPARÉ posé au-dessus de la barre, à la place de la bande de looks : celui
/// des réglages, celui de la liste des effets appliqués.
struct CallEffectsPanel<Content: View>: View {
    @ViewBuilder let content: () -> Content

    private static var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.mdPlus) {
            content()
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .callChromeGlass(in: Self.shape)
        .accessibilityElement(children: .contain)
        .padding(.horizontal, MeeshySpacing.lg)
    }
}

/// Appui long sur (+) · #16979 — les effets appliqués, de la couche du dessus à celle du dessous.
/// En annuler un retire cette couche seule ; l'hôte referme la liste et rend le menu de base.
struct CallEffectsAppliedPanel: View {
    let layers: CallEffectLayers
    let onRemove: (CallEffectKind) -> Void

    var body: some View {
        CallEffectsPanel {
            Text(CallEffectsCopy.appliedTitle)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.white)
                .accessibilityAddTraits(.isHeader)
            ForEach(layers.listed, id: \.kind) { layer in
                CallEffectsAppliedRow(layer: layer) { onRemove(layer.kind) }
            }
        }
    }
}

private struct CallEffectsAppliedRow: View {
    let layer: CallEffectLayer
    let onCancel: () -> Void

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: CallEffectsCopy.layerSymbol(layer.kind))
                .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(width: MeeshyControlSize.tapTarget)
                .accessibilityHidden(true)
            Text(CallEffectsCopy.layerTitle(layer))
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.white)
                .lineLimit(1)
            Spacer(minLength: 0)
            Button(action: onCancel) {
                Image(systemName: "xmark.circle.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.xl, weight: .semibold))
                    .foregroundStyle(Color.white.opacity(MeeshyOpacity.intense))
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(CallPressButtonStyle())
            .accessibilityLabel(CallEffectsCopy.cancelLayer(CallEffectsCopy.layerTitle(layer)))
        }
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .accessibilityElement(children: .contain)
    }
}
