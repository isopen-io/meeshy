import SwiftUI
import MeeshySDK

/// **La bande d'outils du dessin — couleurs, épaisseur, gomme** (#4092, vue
/// `3b`).
///
/// ## Pourquoi elle vit dans le SDK, avec la surface
///
/// Elle pourrait être écrite côté app, dans la bande de la scène. Elle ne l'est
/// pas, et pour une raison mesurable : ses six entrées — couleur, épaisseur,
/// outil actif — sont des `@Published` INTERNES au SDK. Les rendre publiques
/// pour qu'une vue de l'app les lise ouvrirait six accès pour un seul écran, et
/// chaque `public` posé sur un réglage est une promesse de stabilité que ce
/// réglage n'a pas.
///
/// Loger la vue là où vit son état ne coûte rien à la pureté du SDK : cette
/// bande ne décide de RIEN — ni quand paraître, ni ce que la scène fait
/// pendant. Elle rend des réglages et les repose. C'est exactement le grain
/// d'un atome (`packages/MeeshySDK/CLAUDE.md` § SDK Purity).
///
/// ## La disposition vient de la maquette, pas d'un goût
///
/// La vue `3b` pose, sous la rangée d'outils : **cinq pastilles de couleur, une
/// glissière d'épaisseur, GOMME**. L'ordre suit le geste — on choisit avec quoi
/// on écrit avant de choisir combien c'est épais, et la gomme est à l'opposé
/// des couleurs parce qu'elle est leur contraire.
///
/// ## La gomme est un OUTIL, pas un mode à part
///
/// Elle bascule `activeBrushTool` entre `.eraser` et `.pen` — donc un seul
/// état gouverne « avec quoi le doigt écrit », et il n'existe aucune
/// combinaison où l'auteur croirait effacer en dessinant. Un booléen `isErasing`
/// à côté de l'outil aurait rendu ces deux états contradictoires possibles.
public struct MeeshyDrawingToolBand: View {

    @ObservedObject private var viewModel: StoryComposerViewModel

    public init(viewModel: StoryComposerViewModel) {
        self.viewModel = viewModel
    }

    private var isErasing: Bool { viewModel.activeBrushTool == .eraser }

    public var body: some View {
        HStack(spacing: 12) {
            colors
            thickness
            eraser
        }
        .padding(.horizontal, 4)
        .accessibilityElement(children: .contain)
    }

    /// Les couleurs viennent de `StoryDrawingColors.palette` — la palette
    /// PARTAGÉE, jamais une liste recopiée : deux listes auraient divergé au
    /// premier ajout, et le trait posé ici n'aurait plus la teinte que
    /// l'atelier propose pour le même dessin.
    private var colors: some View {
        HStack(spacing: 8) {
            ForEach(StoryDrawingColors.palette, id: \.self) { hex in
                let color = Color(hex: hex)
                Button {
                    viewModel.drawingColor = color
                    // Choisir une couleur, c'est vouloir ÉCRIRE : rester sur la
                    // gomme rendrait le choix sans effet visible, ce qui se lit
                    // comme un bouton cassé.
                    if isErasing { viewModel.activeBrushTool = .pen }
                    HapticFeedback.light()
                } label: {
                    Circle()
                        .fill(color)
                        .frame(width: 24, height: 24)
                        .overlay(
                            Circle().strokeBorder(
                                Color.white.opacity(
                                    !isErasing && DrawingEditToolOptions.hex(of: viewModel.drawingColor) == hex
                                        ? 0.95 : 0.25),
                                lineWidth: 2)
                        )
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(Text(MeeshyDrawingBandCopy.color))
            }
        }
    }

    private var thickness: some View {
        Slider(value: Binding(get: { Double(viewModel.drawingWidth) },
                              set: { viewModel.drawingWidth = CGFloat($0) }),
               in: 2...24)
            .frame(minWidth: 80)
            .tint(MeeshyColors.brandPrimary)
            .accessibilityLabel(Text(MeeshyDrawingBandCopy.thickness))
            .accessibilityValue(Text("\(Int(viewModel.drawingWidth))"))
    }

    private var eraser: some View {
        Button {
            viewModel.activeBrushTool = isErasing ? .pen : .eraser
            HapticFeedback.light()
        } label: {
            Text(MeeshyDrawingBandCopy.eraser)
                .font(.caption.weight(.semibold))
                .foregroundColor(isErasing ? .white : MeeshyColors.textSecondary(isDark: true))
                .padding(.horizontal, 10)
                .frame(height: 32)
                .background(
                    Capsule().fill(isErasing
                                   ? MeeshyColors.brandPrimary.opacity(0.85)
                                   : Color.white.opacity(0.10))
                )
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(MeeshyDrawingBandCopy.eraser))
        .accessibilityAddTraits(isErasing ? .isSelected : [])
    }
}

/// Les libellés de la bande. `bundle: .module` — ce sont des mots du SDK, servis
/// depuis son catalogue, comme les autres commandes de dessin
/// (`story.drawEdit.tool.*`).
/// **Pas `nonisolated`, à la différence de ses voisins de l'app.** Ceux-là
/// lisent `bundle: .main` ; celui-ci lit `.module`, dont l'accesseur généré par
/// SwiftPM est isolé `MainActor`. Le marquer `nonisolated` ne compile pas — et
/// c'est juste : ces libellés ne sont lus que depuis un corps de vue.
enum MeeshyDrawingBandCopy {

    static var color: String {
        String(localized: "story.drawEdit.tool.color",
               defaultValue: "Couleur du trait", bundle: .module)
    }

    static var thickness: String {
        String(localized: "story.drawEdit.tool.thickness",
               defaultValue: "Épaisseur du trait", bundle: .module)
    }

    static var eraser: String {
        String(localized: "story.draw.eraser",
               defaultValue: "Gomme", bundle: .module)
    }
}
