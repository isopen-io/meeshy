import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les mots du sélecteur d'effets — ceux de l'appel et de la prise.
enum ComposerLiveLookCopy {
    static var toggle: String {
        String(localized: "composer.capture.looks", defaultValue: "Filtres et cadres", bundle: .main)
    }
}

/// **Le sélecteur d'effets du viseur** (#9329) : les teintes de l'appel et ses
/// cadres en direct, choisis AVANT et PENDANT le cadrage — l'aperçu les montre
/// aussitôt, et la prise les emporte.
///
/// Chaque pièce est celle de l'appel (`CallModeCarousel`, `CallModeGlyph`,
/// `CallFrameMoodChips`) et de la prise (`ComposerPhotoLookCopy`,
/// `ComposerPhotoLookTab`) : rien n'est redessiné.
struct ComposerLiveLookPanel: View {
    @ObservedObject var session: ComposerCaptureSession

    @State private var tab: ComposerPhotoLookTab = .filters
    @State private var chip: CallMontageMoodChip?

    private static let glyphSize = CGSize(width: 52, height: 52)

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Picker(ComposerPhotoLookCopy.filters, selection: $tab) {
                ForEach(ComposerPhotoLookTab.allCases, id: \.self) { famille in
                    Text(ComposerPhotoLookCopy.tabName(famille)).tag(famille)
                }
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 260)
            switch tab {
            case .filters:
                filterCarousel
            case .frames:
                frameChoice
            }
        }
        .padding(.vertical, MeeshySpacing.md)
        .adaptiveLiquidGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
        .environment(\.colorScheme, .dark)
        .disabled(session.lookIsLocked)
        .opacity(session.lookIsLocked ? 0.5 : 1)
        .onAppear { chip = chip ?? ComposerLiveLookRule.chip(for: session.look) }
    }

    private var filterCarousel: some View {
        CallModeCarousel(
            items: ComposerPhotoLookRule.filters,
            selection: $session.look.filter,
            title: ComposerPhotoLookCopy.filters,
            name: CallEffectsCopy.presetName,
            itemSize: Self.glyphSize,
            spacing: 12
        ) { preset, isSelected in
            CallModeGlyph(art: .symbol(CallEffectsCopy.presetSymbol(preset)), isSelected: isSelected)
        }
    }

    @ViewBuilder
    private var frameChoice: some View {
        if let chip {
            VStack(spacing: MeeshySpacing.sm) {
                CallFrameMoodChips(chips: ComposerLiveLookRule.chips(), selected: chip) { tapped in
                    self.chip = tapped
                    session.look.frame = ComposerLiveLookRule.entering(tapped)
                }
                CallModeCarousel(
                    items: ComposerLiveLookRule.frames(for: chip),
                    selection: $session.look.frame,
                    title: ComposerPhotoLookCopy.frames,
                    name: ComposerPhotoLookCopy.frameName,
                    itemSize: Self.glyphSize,
                    spacing: 12
                ) { frame, isSelected in
                    CallModeGlyph(art: .symbol(ComposerPhotoLookCopy.frameSymbol(frame)), isSelected: isSelected)
                }
                // Une autre ambiance, c'est une autre piste, posée d'emblée sur son choix.
                .id(chip)
            }
        }
    }
}
