import SwiftUI

/// Bande d'opérations de la timeline — rendue SOUS la bande des outils du
/// composer et AU-DESSUS du transport (retour user 2026-07-20) : l'historique
/// (annuler / rétablir), l'aimantation et l'enregistrement vivent ici. Le
/// transport ne garde que la lecture, le temps, le zoom et le son. Leaf view —
/// paramètres primitifs uniquement.
///
/// Le chip « +10 s » avait été retiré le 2026-07-27 : il écrivait la durée
/// dans `project.slideDuration`, que le recalcul depuis le contenu effaçait à
/// l'édition suivante. Il revient en écrivant une durée d'AUTEUR distincte
/// (`TimelineViewModel.authoredSlideDuration`), que le recalcul respecte comme
/// un plancher — c'était le champ manquant, pas le bouton qui était en trop.
public struct TimelineOperationsBar: View {

    /// Pas d'extension. Ce bouton ne fait qu'ALLONGER ; raccourcir passe par le
    /// champ de durée du composer.
    public nonisolated static let extendStepSeconds: Float = 10

    public let canUndo: Bool
    public let canRedo: Bool
    public let isSnapEnabled: Bool
    public let onUndo: () -> Void
    public let onRedo: () -> Void
    public let onSnapToggle: () -> Void
    public let onSave: (() -> Void)?
    /// Prolonge la timeline d'un pas fixe. `nil` masque le chip.
    public let onExtendDuration: (() -> Void)?

    public init(canUndo: Bool, canRedo: Bool, isSnapEnabled: Bool,
                onUndo: @escaping () -> Void,
                onRedo: @escaping () -> Void,
                onSnapToggle: @escaping () -> Void,
                onSave: (() -> Void)?,
                onExtendDuration: (() -> Void)? = nil) {
        self.canUndo = canUndo
        self.canRedo = canRedo
        self.isSnapEnabled = isSnapEnabled
        self.onUndo = onUndo
        self.onRedo = onRedo
        self.onSnapToggle = onSnapToggle
        self.onSave = onSave
        self.onExtendDuration = onExtendDuration
    }

    public var body: some View {
        HStack(spacing: 8) {
            historyButton(icon: "arrow.uturn.backward", enabled: canUndo, action: onUndo,
                          a11y: String(localized: "story.timeline.toolbar.undo",
                                       defaultValue: "Annuler", bundle: .module))
            historyButton(icon: "arrow.uturn.forward", enabled: canRedo, action: onRedo,
                          a11y: String(localized: "story.timeline.toolbar.redo",
                                       defaultValue: "Rétablir", bundle: .module))
            snapChip
            if let onExtendDuration {
                extendChip(onExtendDuration)
            }
            Spacer(minLength: 8)
            if let onSave {
                saveButton(onSave)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 5)
        .frame(minHeight: 38)
        .accessibilityElement(children: .contain)
    }

    // MARK: - Sub-views

    private func historyButton(icon: String, enabled: Bool,
                               action: @escaping () -> Void, a11y: String) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .frame(width: 30, height: 30)
                .contentShape(Rectangle().inset(by: -7))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.35)
        .foregroundStyle(MeeshyColors.indigo600)
        .accessibilityLabel(a11y)
    }

    /// « +10 s » : le geste rapide pour se donner de la place à droite, sans
    /// avoir à rallonger un clip ni à pincer la règle.
    private func extendChip(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 3) {
                Image(systemName: "plus")
                    .font(.system(size: 10, weight: .bold))
                Text(String(format: String(localized: "story.timeline.ops.extend.label",
                                           defaultValue: "%@ s", bundle: .module),
                            "\(Int(Self.extendStepSeconds))"))
                    .font(.caption2.weight(.semibold))
                    .monospacedDigit()
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(Capsule().fill(MeeshyColors.indigo500.opacity(0.15)))
            .contentShape(Rectangle().inset(by: -6))
        }
        .buttonStyle(.plain)
        .foregroundStyle(MeeshyColors.indigo700)
        .accessibilityLabel(String(localized: "story.timeline.ops.extend",
                                   defaultValue: "Prolonger la timeline de 10 secondes",
                                   bundle: .module))
    }

    /// Même langage visuel que le snap historique du transport (point vert
    /// quand actif) — l'opération déménage, sa sémantique apprise reste.
    private var snapChip: some View {
        Button(action: onSnapToggle) {
            HStack(spacing: 4) {
                Circle()
                    .fill(isSnapEnabled ? MeeshyColors.success : Color.secondary.opacity(0.4))
                    .frame(width: 8, height: 8)
                Text(String(localized: "story.timeline.toolbar.snap", bundle: .module))
                    .font(.caption2.weight(.semibold))
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(isSnapEnabled
                               ? MeeshyColors.indigo500.opacity(0.15)
                               : Color.gray.opacity(0.1))
            )
            .contentShape(Rectangle().inset(by: -6))
        }
        .buttonStyle(.plain)
        .foregroundStyle(isSnapEnabled ? MeeshyColors.indigo700 : Color.secondary)
        .accessibilityLabel(isSnapEnabled
            ? String(localized: "story.timeline.a11y.snap.on", bundle: .module)
            : String(localized: "story.timeline.a11y.snap.off", bundle: .module))
    }

    private func saveButton(_ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "square.and.arrow.down")
                .font(.system(size: 15, weight: .semibold))
                .frame(width: 30, height: 30)
                .contentShape(Rectangle().inset(by: -7))
        }
        .buttonStyle(.plain)
        .foregroundStyle(MeeshyColors.indigo600)
        .accessibilityLabel(String(localized: "story.timeline.export.button",
                                   defaultValue: "Enregistrer la story en vidéo",
                                   bundle: .module))
    }
}
