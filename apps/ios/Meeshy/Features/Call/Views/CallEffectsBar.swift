import SwiftUI
import MeeshyUI

/// P8 · P8b — la barre du mode Effets : UN verre d'une pièce (l'atome partagé de la pilule),
/// qui parle la langue du composer. En haut, les looks (puces et filet) OU le panneau de
/// Réglages ; en bas, la rangée de base ‹ · Réglages · (+). Réglages ouvert, la MÊME barre
/// s'ajuste et le panneau prend la place des looks, les contenus se croisant en fondu ;
/// retoucher Réglages (disque blanc) rend les looks par le chemin inverse.
struct CallEffectsBar<Looks: View, Settings: View>: View {
    let showsSettings: Bool
    let onBack: () -> Void
    let onSettings: () -> Void
    let onAddLook: () -> Void
    @ViewBuilder let looks: () -> Looks
    @ViewBuilder let settings: () -> Settings

    private static var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous)
    }

    var body: some View {
        AdaptiveGlassContainer(spacing: CallControlGlassMetrics.containerSpacing) {
            VStack(spacing: MeeshySpacing.sm) {
                topZone
                baseRow
            }
            .padding(MeeshySpacing.sm)
        }
        .clipShape(Self.shape)
        .callControlsGlass(in: Self.shape)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var topZone: some View {
        ZStack {
            if showsSettings {
                settings()
                    .transition(.opacity)
            } else {
                VStack(spacing: MeeshySpacing.sm) {
                    looks()
                    Rectangle()
                        .fill(Color.white.opacity(MeeshyOpacity.light))
                        .frame(height: 1)
                        .accessibilityHidden(true)
                }
                .transition(.opacity)
            }
        }
    }

    private var baseRow: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            CallPillButton(
                symbol: "chevron.left",
                kind: .normal,
                label: CallModeCopy.backToCall,
                hint: CallModeCopy.backToCallHint,
                diameter: Self.diameter,
                action: onBack
            )
            Spacer(minLength: 0)
            CallPillButton(
                symbol: "gearshape",
                kind: showsSettings ? .active : .normal,
                label: CallModeCopy.settings,
                caption: CallModeCopy.settings,
                hint: CallModeCopy.settingsHint,
                toggleState: showsSettings,
                diameter: Self.diameter,
                action: onSettings
            )
            Spacer(minLength: 0)
            CallPillButton(
                symbol: "plus",
                kind: .normal,
                label: CallModeCopy.addLook,
                hint: CallModeCopy.addLookHint,
                diameter: Self.diameter,
                action: onAddLook
            )
        }
        .padding(.horizontal, MeeshySpacing.xs)
    }

    private static var diameter: CGFloat { 44 }
}
