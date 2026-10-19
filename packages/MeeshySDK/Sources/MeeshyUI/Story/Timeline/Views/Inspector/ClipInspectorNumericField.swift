import SwiftUI
import MeeshySDK

/// Champ numérique : saisissable au clavier ET grignotable par pas.
/// `key` isole le brouillon de saisie d'un champ à l'autre ; les brouillons
/// vivent chez `ClipInspector` (vidés sur un undo) et arrivent en `Binding`.
struct ClipInspectorNumericField: View {
    let key: String
    let title: String
    let value: String
    let unit: String
    @Binding var drafts: [String: String]
    let onStep: (Float) -> Void
    let onCommit: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title.uppercased())
                .font(.system(size: MeeshyFont.microSize, weight: .semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            HStack(spacing: MeeshySpacing.xxs) {
                TextField("", text: Binding(
                    get: { drafts[key] ?? value },
                    set: { drafts[key] = $0 }
                ))
                .keyboardType(.numbersAndPunctuation)
                .multilineTextAlignment(.center)
                .font(.system(.footnote, design: .monospaced))
                .monospacedDigit()
                .submitLabel(.done)
                .onSubmit {
                    if let draft = drafts[key] { onCommit(draft) }
                    drafts[key] = nil
                }
                if !unit.isEmpty {
                    Text(unit)
                        .font(.system(size: MeeshyFont.microSize))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.vertical, 5)
            .padding(.horizontal, MeeshySpacing.xs)
            .background(RoundedRectangle(cornerRadius: 7)
                .fill(MeeshyColors.indigo500.opacity(0.10)))
            HStack(spacing: MeeshySpacing.xs) {
                stepButton(systemName: "minus.circle.fill") { onStep(-ClipInspector.timeStep) }
                Spacer(minLength: 0)
                stepButton(systemName: "plus.circle.fill") { onStep(ClipInspector.timeStep) }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title) \(value)\(unit)")
    }

    private func stepButton(systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.title3)
                .foregroundStyle(MeeshyColors.indigo400)
                .contentShape(Rectangle().inset(by: -8))
        }
        .buttonStyle(.plain)
    }
}
