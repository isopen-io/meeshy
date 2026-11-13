import SwiftUI
import MeeshySDK
import MeeshyUI

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
                hint: CallModeCopy.settingsHint,
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
            .onLongPressGesture(
                minimumDuration: CallModeGestureRule.longPressDuration,
                maximumDistance: 24,
                perform: showApplied,
                onPressingChanged: pressing
            )
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
