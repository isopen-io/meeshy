import SwiftUI
import MeeshySDK

/// La rangée compacte sous la barre d'outils du composer : `👤 3 personnes`
/// avec la pastille de chaque mode.
///
/// C'est le SEUL endroit d'où l'auteur voit ses références silencieuses — et
/// donc le seul d'où il peut en retirer une. Sans elle, une SILENT posée par
/// erreur serait invisible et irrécupérable jusqu'à la publication.
///
/// Feuille : aucun `@ObservedObject` sur un singleton, que des valeurs — et
/// `Equatable` pour ne pas se redessiner à chaque frappe du composer.
public struct ReferenceChipRow: View, Equatable {
    let references: [ComposerReference]
    let accentColor: Color
    let onTap: () -> Void

    public init(references: [ComposerReference], accentColor: Color, onTap: @escaping () -> Void) {
        self.references = references
        self.accentColor = accentColor
        self.onTap = onTap
    }

    /// `==` MANUEL : les closures ne sont pas `Equatable`, donc la synthèse
    /// automatique n'existe pas. Comparer l'état, jamais l'action.
    public static func == (lhs: ReferenceChipRow, rhs: ReferenceChipRow) -> Bool {
        lhs.references == rhs.references && lhs.accentColor == rhs.accentColor
    }

    public var body: some View {
        if !references.isEmpty {
            Button(action: onTap) {
                HStack(spacing: 8) {
                    Image(systemName: "person.2.fill")
                        .font(.system(size: 12, weight: .semibold))
                    Text(label)
                        .font(.system(size: 13, weight: .medium))
                    HStack(spacing: 4) {
                        ForEach(references, id: \.username) { reference in
                            Image(systemName: reference.display.symbolName)
                                .font(.system(size: 10))
                                .foregroundStyle(reference.display == .silent ? Color.secondary : accentColor)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(accentColor.opacity(0.12)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
        }
    }

    private var label: String {
        String(localized: "reference.row.count",
               defaultValue: "\(references.count) personne(s)",
               bundle: .module)
    }
}
