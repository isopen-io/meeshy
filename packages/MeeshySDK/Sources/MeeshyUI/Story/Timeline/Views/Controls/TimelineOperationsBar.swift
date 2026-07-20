import SwiftUI

/// Bande d'opérations de la timeline — rendue SOUS la bande des outils du
/// composer et AU-DESSUS du transport (retour user 2026-07-20) : l'historique
/// (annuler / rétablir), l'aimantation, la prolongation « +10 s » et
/// l'enregistrement vivent ici. Le transport ne garde que la lecture, le
/// temps, le zoom et le son. Leaf view — paramètres primitifs uniquement.
public struct TimelineOperationsBar: View {

    /// Pas de prolongation du bouton « +10 s ». La RÉDUCTION reste au handler
    /// de fin de ruler (`DurationHandle`) — ce bouton ne fait qu'étendre.
    public nonisolated static let extendStepSeconds: Float = 10

    public let canUndo: Bool
    public let canRedo: Bool
    public let isSnapEnabled: Bool
    public let onUndo: () -> Void
    public let onRedo: () -> Void
    public let onSnapToggle: () -> Void
    public let onExtendDuration: () -> Void
    public let onSave: (() -> Void)?

    public init(canUndo: Bool, canRedo: Bool, isSnapEnabled: Bool,
                onUndo: @escaping () -> Void,
                onRedo: @escaping () -> Void,
                onSnapToggle: @escaping () -> Void,
                onExtendDuration: @escaping () -> Void,
                onSave: (() -> Void)?) {
        self.canUndo = canUndo
        self.canRedo = canRedo
        self.isSnapEnabled = isSnapEnabled
        self.onUndo = onUndo
        self.onRedo = onRedo
        self.onSnapToggle = onSnapToggle
        self.onExtendDuration = onExtendDuration
        self.onSave = onSave
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
            Spacer(minLength: 8)
            extendChip
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

    /// « +10 s » : prolonge la durée de la timeline d'un pas fixe — le geste
    /// rapide pour se donner de la place à droite sans pincer le ruler.
    private var extendChip: some View {
        Button(action: onExtendDuration) {
            HStack(spacing: 3) {
                Image(systemName: "plus")
                    .font(.system(size: 10, weight: .bold))
                Text("10 s")
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
