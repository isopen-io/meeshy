import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La barre du viseur — trois pastilles, un déclencheur, une phrase** (#4080,
/// vue `2b`).
///
/// > `PHOTO` · `VIDÉO` · `MAINS LIBRES` … « maintenir pour filmer · relâcher
/// > pour poser dans la scène » — planche `2b`
///
/// ## Elle vit dans le COULOIR, jamais sur la carte
///
/// La cible dessine ces contrôles par-dessus un aperçu plein écran. Le composer
/// n'a pas cette géographie : ses rails et sa rangée d'entrées vivent dans les
/// couloirs du plateau (directive porteur 2026-08-31), et un contrôle posé sur
/// le canvas vole les touches de la bande qu'il couvre. La barre prend donc la
/// place de la rangée basse — la même place, le même échange de contenu que
/// `railMode` opère déjà pour les contrôleurs d'un outil ouvert.
///
/// Ce n'est pas une entorse à la cible : `2b` prescrit un ORDRE (les modes
/// au-dessus du déclencheur, la phrase en dessous) et des ÉTATS, et les deux
/// sont ici. C'est la géographie du plateau qui prime, comme pour les rails.
struct ComposerSceneCameraBar: View {

    let modes: [ComposerSceneCameraMode]
    let mode: ComposerSceneCameraMode
    let stage: ComposerSceneCameraStage
    let onPickMode: (ComposerSceneCameraMode) -> Void
    /// L'appui — il PREND en photo, ou commence à filmer.
    let onPress: () -> Void
    /// Le relâchement. Ce qu'il fait dépend du mode, et la loi le dit
    /// (`ComposerSceneCamera.stageAfterRelease`) : cette vue ne re-décide rien.
    let onRelease: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            if modes.count > 1 { modeRow }
            shutter
            hint
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
    }

    // MARK: - Les pastilles

    /// **Montées seulement s'il y a un CHOIX.** Un format qui ne sert qu'un
    /// mode afficherait une pastille unique et toujours sélectionnée — un
    /// contrôle sans effet, que la loi 4 bannit.
    private var modeRow: some View {
        HStack(spacing: 8) {
            ForEach(modes, id: \.self) { candidat in
                Button {
                    onPickMode(candidat)
                    HapticFeedback.light()
                } label: {
                    Text(ComposerSceneCameraCopy.label(for: candidat))
                        .font(MeeshyFont.relative(11, weight: .bold))
                        .foregroundStyle(candidat == mode ? Color.white : Color.white.opacity(0.7))
                        .padding(.horizontal, 14)
                        .frame(height: 30)
                        .background {
                            if candidat == mode {
                                Capsule().fill(MeeshyColors.brandGradient)
                            } else {
                                Capsule().fill(Color.white.opacity(0.12))
                            }
                        }
                        // La CIBLE fait 44 pt de haut, la pastille 30 : un
                        // contrôle de 30 pt ne s'atteint pas au pouce
                        // (dimension 5), et l'agrandir écraserait la rangée.
                        .contentShape(Capsule().inset(by: -7))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(candidat == mode ? [.isButton, .isSelected] : .isButton)
            }
        }
    }

    // MARK: - Le déclencheur

    /// **Un anneau blanc, un disque corail** — et le disque se rétracte en carré
    /// pendant la prise, comme le déclencheur de la feuille. La forme dit
    /// l'état sans un mot : rond = prêt, carré = en train d'écrire.
    private var shutter: some View {
        ZStack {
            Circle()
                .stroke(.white, lineWidth: 4)
                .frame(width: 72, height: 72)
            if stage == .recording {
                RoundedRectangle(cornerRadius: 6)
                    .fill(MeeshyColors.error)
                    .frame(width: 28, height: 28)
            } else {
                Circle()
                    .fill(MeeshyColors.error)
                    .frame(width: 58, height: 58)
            }
        }
        .contentShape(Circle())
        // **`onPress` et `onRelease` sont DEUX événements, pas une action.**
        // Un `Button` ne rend que le second, et la vidéo tenue a besoin du
        // premier : c'est l'appui qui commence la prise, le relâchement qui la
        // clôt. `DragGesture(minimumDistance: 0)` est la façon dont SwiftUI
        // donne les deux sans imposer de déplacement.
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    guard stage != .recording else { return }
                    onPress()
                }
                .onEnded { _ in onRelease() }
        )
        .accessibilityElement()
        .accessibilityLabel(ComposerSceneCameraCopy.shutterLabel(mode: mode, stage: stage))
        .accessibilityAddTraits(.isButton)
    }

    // MARK: - La phrase

    /// **Elle DIT le geste**, et change avec le mode et l'étape — la clé vient
    /// de `ComposerSceneCamera.hintKey`, pas d'un `switch` écrit ici : une
    /// condition dans un corps de vue est invisible aux tests, et celle-ci est
    /// tout ce que l'affordance promet.
    private var hint: some View {
        Text(ComposerSceneCameraCopy.hint(mode: mode, stage: stage))
            .font(MeeshyFont.relative(11, design: .monospaced))
            .foregroundStyle(.white.opacity(0.6))
            .multilineTextAlignment(.center)
            .lineLimit(2)
            .minimumScaleFactor(0.8)
            .padding(.horizontal, 16)
            // Lue par la phrase du déclencheur, qui la reprend : l'entendre
            // deux fois de suite n'apprend rien.
            .accessibilityHidden(true)
    }
}
