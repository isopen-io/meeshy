import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le tracé d'un crochet : deux bras et l'arrondi de l'angle de la scène.
nonisolated struct ComposerCropBracketShape: Shape {
    let corner: ComposerCropCorner
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let retrait: CGFloat = 2
        let bout: CGFloat = 4
        var trace = Path()
        trace.move(to: CGPoint(x: retrait, y: rect.height - bout))
        trace.addLine(to: CGPoint(x: retrait, y: radius))
        trace.addArc(tangent1End: CGPoint(x: retrait, y: retrait), tangent2End: CGPoint(x: radius, y: retrait),
                     radius: radius - retrait)
        trace.addLine(to: CGPoint(x: rect.width - bout, y: retrait))
        let miroir = CGAffineTransform(translationX: corner.isLeading ? 0 : rect.width, y: corner.isTop ? 0 : rect.height)
            .scaledBy(x: corner.isLeading ? 1 : -1, y: corner.isTop ? 1 : -1)
        return trace.applying(miroir)
    }
}

/// **Les quatre crochets de recadrage** (#9567) : arrondis, posés aux angles de
/// la scène de retouche. Tirer un crochet règle librement la taille de
/// l'image ; pendant le geste seul le tracé bouge, et à la levée — ou quand le
/// système annule le geste — la scène prend ces proportions. VoiceOver règle
/// les proportions par les presets : les crochets lui sont cachés.
struct ComposerCropBrackets: View {
    let scene: CGRect
    let area: CGRect
    let onCommit: (CGRect) -> Void

    @State private var dragged: CGRect?
    /// Retombe d'elle-même quand le système annule le geste sans `onEnded`.
    @GestureState private var held: ComposerCropCorner?

    var body: some View {
        let cadre = dragged ?? scene
        let cote = MeeshyControlSize.tapTarget
        ZStack(alignment: .topLeading) {
            if dragged != nil {
                RoundedRectangle(cornerRadius: ComposerSceneCameraFrame.cardRadius, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.9), lineWidth: 1.5)
                    .background(RoundedRectangle(cornerRadius: ComposerSceneCameraFrame.cardRadius, style: .continuous)
                        .fill(Color.white.opacity(0.08)))
                    .frame(width: cadre.width, height: cadre.height)
                    .position(x: cadre.midX, y: cadre.midY)
                    .allowsHitTesting(false)
            }
            ForEach(ComposerCropCorner.allCases, id: \.self) { angle in
                ComposerCropBracketShape(corner: angle, radius: ComposerSceneCameraFrame.cardRadius)
                    .stroke(Color.white, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                    .shadow(color: .black.opacity(0.45), radius: 3, y: 1)
                    .frame(width: cote, height: cote)
                    .contentShape(Rectangle())
                    .position(x: angle.isLeading ? cadre.minX + cote / 2 : cadre.maxX - cote / 2,
                              y: angle.isTop ? cadre.minY + cote / 2 : cadre.maxY - cote / 2)
                    .gesture(drag(angle))
            }
        }
        .adaptiveOnChange(of: held) { _, tenu in
            guard tenu == nil, let choisi = dragged else { return }
            dragged = nil
            onCommit(choisi)
        }
        .accessibilityHidden(true)
    }

    /// La course se mesure dans le repère GLOBAL : le crochet bouge sous le
    /// doigt, et son propre repère avec lui.
    private func drag(_ angle: ComposerCropCorner) -> some Gesture {
        DragGesture(minimumDistance: 1, coordinateSpace: .global)
            .updating($held) { _, tenu, _ in tenu = angle }
            .onChanged { valeur in
                if dragged == nil { HapticFeedback.light() }
                dragged = ComposerEditScene.cropped(scene, corner: angle, translation: valeur.translation, within: area)
            }
    }
}

/// **Les proportions par presets**, sous la scène : le preset que la scène
/// réalise est allumé ; un recadrage libre n'en allume aucun. Aucun libellé
/// ne rétrécit : la bande défile jusqu'aux bords de l'écran.
struct ComposerCropPresetBar: View {
    let selected: ComposerCropPreset?
    let onSelect: (ComposerCropPreset) -> Void

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(ComposerCropPreset.allCases, id: \.self) { preset in
                Button {
                    HapticFeedback.light()
                    onSelect(preset)
                } label: {
                    Text(preset.label)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold, design: .rounded))
                        .foregroundStyle(selected == preset ? Color.yellow : .white)
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.horizontal, MeeshySpacing.md)
                        .frame(minHeight: MeeshyControlSize.tapTarget)
                        .adaptiveLiquidGlass(in: Capsule(), interactive: true)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(preset.label)
                .accessibilityAddTraits(selected == preset ? .isSelected : [])
            }
        }
        .padding(.horizontal, ComposerEditPresetsLayout.leadingInset)
        .frame(height: ComposerEditScene.presetsHeight)
    }
}

/// **« Annuler » du recadrage** (#15355), en tête des formats : il rend le
/// cadre d'avant l'entrée dans Recadrer en un geste. Une flèche de retour, pas
/// la croix : la croix abandonne toute la retouche.
struct ComposerCropCancelButton: View {
    static let minSide: CGFloat = MeeshyControlSize.tapTarget

    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: "arrow.uturn.backward")
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                Text(ComposerCaptureCopy.cancelEdit)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold, design: .rounded))
                    .lineLimit(1)
                    .fixedSize()
            }
            .foregroundStyle(.white)
            .padding(.horizontal, MeeshySpacing.md)
            .frame(minWidth: Self.minSide, minHeight: Self.minSide)
            .adaptiveLiquidGlass(in: Capsule(), interactive: true)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ComposerCaptureCopy.cancelCrop)
    }
}

/// **La prise hors du cadre, voilée** (#15355) : posée SOUS l'image du cadre,
/// qui la recouvre exactement — seule la part qui dépasse se voit, assombrie.
/// Elle lit la même source, le même look sans son cadre et le même cadrage que
/// le cadre ; elle ne peint que ce qui tombe à l'écran.
struct ComposerCropOverflow: View {
    @ObservedObject var session: ComposerCaptureSession
    let frame: CGRect
    let screen: CGSize

    var body: some View {
        if let source = session.editSource, let pose = placement {
            ComposerLiveLookSurface(look: session.look.withoutFrame, person: session.lookPerson,
                                    date: session.lookDate, framing: pose.framing, source: source,
                                    canvas: ComposerLookPainter.previewCanvas(
                                        aspect: ComposerLookPainter.aspect(of: pose.rect.size)),
                                    fps: ComposerCaptureSurfaceRule.editFPS(session.thermalBudget))
                .overlay(Color.black.opacity(ComposerCropOverflowLayout.veil))
                .frame(width: pose.rect.width, height: pose.rect.height)
                .position(x: pose.rect.midX, y: pose.rect.midY)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    /// La fenêtre que le cadre peint, lue comme lui : aux proportions de sa toile.
    private var placement: ComposerCropOverflowPlacement? {
        guard let etendue = session.editExtent else { return nil }
        let toile = ComposerLookPainter.previewCanvas(aspect: ComposerLookPainter.aspect(of: frame.size))
        guard toile.height > 0 else { return nil }
        let fenetre = session.framing.window(in: etendue, aspect: toile.width / toile.height)
        return ComposerCropOverflowLayout.visible(frame: frame, window: fenetre, source: etendue,
                                                  screen: CGRect(origin: .zero, size: screen))
    }
}
