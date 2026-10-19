import SwiftUI
import MeeshySDK

/// Rangée d'actions de la fiche. `onRequestDelete` ne détruit rien : le
/// propriétaire présente l'alerte de confirmation (`ClipInspector.DeleteConfirmation`).
struct ClipInspectorActionsRow: View {
    let kind: ClipInspector.ClipSnapshot.Kind
    let isFollowingSlide: Bool
    let onFollowSlide: () -> Void
    let onSplit: () -> Void
    let onRequestDelete: () -> Void

    /// Deux boutons, deux intentions LISIBLES : « Animation » déplie la
    /// configuration PAR-DESSOUS (il n'anime rien lui-même), « Supprimer »
    /// demande confirmation avant la suppression définitive. Icône + TEXTE
    /// obligatoires — les pastilles icône-seule teintées (losange indigo sur
    /// verre indigo, corbeille rouge sur verre rouge) ne portaient ni leur
    /// sens ni leur contraste (capture user 2026-07-20).
    ///
    /// Composition Liquid Glass (iOS 26 via `Compatibility/AdaptiveGlass`) :
    /// la SURFACE de la modale reste en matériau (le verre ne peut pas
    /// échantillonner du verre), seuls les CONTRÔLES flottants prennent le
    /// glass — groupés dans un `AdaptiveGlassContainer` pour que les formes
    /// adjacentes se fondent correctement. Fallback < 26 : matériau teinté
    /// + liseré, géré par le wrapper.
    /// Trois actions ne tiennent pas toujours sur une ligne — en français
    /// « Animation · Diviser · Supprimer » débordait déjà à 360 pt, et les
    /// langues plus verbeuses (allemand) aggravent le cas. `ViewThatFits`
    /// bascule sur deux rangées plutôt que de laisser les capsules se
    /// chevaucher et les libellés se couper en deux (« Anima-tion »).
    ///
    /// Le premier candidat n'a PAS de `Spacer` : un `Spacer` se comprimant à
    /// l'infini, `ViewThatFits` le jugerait toujours suffisant et ne
    /// basculerait jamais.
    var body: some View {
        AdaptiveGlassContainer(spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: MeeshySpacing.smPlus) {
                    if !isFollowingSlide { followSlideButton }
                    if ClipInspector.supportsSplit(kind: kind) { splitButton }
                    if ClipInspector.supportsDeletion(kind: kind) { deleteButton }
                }
                VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
                    if !isFollowingSlide { followSlideButton }
                    if ClipInspector.supportsSplit(kind: kind) { splitButton }
                    if ClipInspector.supportsDeletion(kind: kind) { deleteButton }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// « Suivre la slide » (D3, revue totale U9) — n'apparaît que quand une
    /// fenêtre EXPLICITE a été posée (`!isFollowingSlide`) : un fantôme
    /// n'a rien à relâcher, l'afficher pour lui serait un contrôle mort.
    private var followSlideButton: some View {
        Button(action: onFollowSlide) {
            Label(String(localized: "story.timeline.inspector.followSlide",
                         defaultValue: "Suivre la slide", bundle: .module),
                  systemImage: "arrow.uturn.backward.circle")
                .font(.footnote.weight(.semibold))
                .fixedSize(horizontal: true, vertical: false)
                .glassControlForeground()
                .padding(.horizontal, MeeshySpacing.md)
                .frame(height: 36)
                .adaptiveGlass(in: Capsule(), tint: MeeshyColors.indigo500, interactive: true)
                .contentShape(Rectangle().inset(by: -4))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "story.timeline.inspector.followSlide",
                                   defaultValue: "Suivre la slide", bundle: .module))
        .accessibilityHint(String(localized: "story.timeline.inspector.followSlide.hint",
                                  defaultValue: "Remet la fenêtre du clip à zéro : il suit de nouveau la durée de la slide",
                                  bundle: .module))
    }

    private var splitButton: some View {
        Button(action: onSplit) {
            Label(String(localized: "story.timeline.inspector.split",
                         defaultValue: "Diviser", bundle: .module),
                  systemImage: "scissors")
                .font(.footnote.weight(.semibold))
                .fixedSize(horizontal: true, vertical: false)
                .glassControlForeground()
                .padding(.horizontal, MeeshySpacing.md)
                .frame(height: 36)
                .adaptiveGlass(in: Capsule(), tint: MeeshyColors.indigo500, interactive: true)
                .contentShape(Rectangle().inset(by: -4))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "story.timeline.inspector.split",
                                   defaultValue: "Diviser", bundle: .module))
        .accessibilityHint(String(localized: "story.timeline.inspector.split.hint",
                                  defaultValue: "Coupe le clip à la position de lecture",
                                  bundle: .module))
    }

    private var deleteButton: some View {
        Button {
            onRequestDelete()
        } label: {
            Label(String(localized: "story.timeline.clip.delete", bundle: .module),
                  systemImage: "trash")
                .font(.footnote.weight(.semibold))
                .fixedSize(horizontal: true, vertical: false)
                .foregroundStyle(.white)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(height: 36)
                .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.error)
                .contentShape(Rectangle().inset(by: -4))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "story.timeline.clip.delete", bundle: .module))
        .accessibilityHint(String(localized: "story.timeline.inspector.delete.hint",
                                  defaultValue: "Demande une confirmation avant la suppression",
                                  bundle: .module))
    }
}
