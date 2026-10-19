import SwiftUI
import MeeshySDK

/// Place de la piste dans le PLAN. La fiche restituait le temps et jamais
/// l'espace : impossible de lire ou corriger une position au chiffre près,
/// alors que les modèles portent x/y/échelle/rotation/plan depuis toujours.
struct ClipInspectorTransformSection: View {
    let transform: ClipTransform
    @Binding var drafts: [String: String]
    let onTransformChanged: (ClipTransform.Field) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            Text(String(localized: "story.timeline.inspector.transform",
                        defaultValue: "Position dans le plan", bundle: .module).uppercased())
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.secondary)
            HStack(alignment: .top, spacing: MeeshySpacing.sm) {
                // x/y sont normalisés 0–1 dans le modèle ; on les présente en
                // POURCENTAGE, plus lisible qu'un « 0,5 » pour dire « au centre ».
                ClipInspectorNumericField(key: "tx", title: "X",
                             value: String(format: "%.0f", transform.x * 100),
                             unit: "%",
                             drafts: $drafts,
                             onStep: { delta in
                                 onTransformChanged(.x(transform.x + Double(delta) / 10))
                             },
                             onCommit: {
                                 if let v = ClipInspector.parseDecimal($0) { onTransformChanged(.x(v / 100)) }
                             })
                ClipInspectorNumericField(key: "ty", title: "Y",
                             value: String(format: "%.0f", transform.y * 100),
                             unit: "%",
                             drafts: $drafts,
                             onStep: { delta in
                                 onTransformChanged(.y(transform.y + Double(delta) / 10))
                             },
                             onCommit: {
                                 if let v = ClipInspector.parseDecimal($0) { onTransformChanged(.y(v / 100)) }
                             })
            }
            HStack(alignment: .top, spacing: MeeshySpacing.sm) {
                ClipInspectorNumericField(key: "scale",
                             title: String(localized: "story.timeline.inspector.scale",
                                           defaultValue: "Taille", bundle: .module),
                             value: String(format: "%.2f", transform.scale),
                             unit: "×",
                             drafts: $drafts,
                             onStep: { delta in
                                 onTransformChanged(.scale(transform.scale + Double(delta)))
                             },
                             onCommit: {
                                 if let v = ClipInspector.parseDecimal($0) { onTransformChanged(.scale(v)) }
                             })
                ClipInspectorNumericField(key: "rotation",
                             title: String(localized: "story.timeline.inspector.rotation",
                                           defaultValue: "Rotation", bundle: .module),
                             value: String(format: "%.0f", transform.rotation),
                             unit: "°",
                             drafts: $drafts,
                             onStep: { delta in
                                 onTransformChanged(.rotation(transform.rotation + Double(delta) * 50))
                             },
                             onCommit: {
                                 if let v = ClipInspector.parseDecimal($0) { onTransformChanged(.rotation(v)) }
                             })
                ClipInspectorNumericField(key: "zIndex",
                             title: String(localized: "story.timeline.inspector.zIndex",
                                           defaultValue: "Plan", bundle: .module),
                             value: "\(transform.zIndex)",
                             unit: "",
                             drafts: $drafts,
                             onStep: { delta in
                                 onTransformChanged(.zIndex(transform.zIndex + (delta > 0 ? 1 : -1)))
                             },
                             onCommit: {
                                 if let v = ClipInspector.parseDecimal($0) { onTransformChanged(.zIndex(Int(v))) }
                             })
            }
        }
        .padding(MeeshySpacing.smPlus)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(MeeshyColors.indigo500.opacity(0.08))
        )
    }
}
