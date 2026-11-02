import SwiftUI

/// Le gate de re-render de la rangée plate — extrait de `FocalRow.swift` (#7513).
///
/// **Pourquoi c'est un fichier à lui.** `FocalRow.swift` avait franchi le
/// plafond DUR de 1 200 lignes de la directive 2026-09-02, sans figurer dans la
/// dette héritée de `FileSizeBudgetGuardTests` : la règle 1 le refusait, et
/// `dev` était rouge. La directive dit comment réparer — « un fichier qui
/// dépasse se DÉCOUPE, par responsabilité, jamais par tranche ».
///
/// La responsabilité est ici nette et se lit dans le doc-comment d'origine : le
/// gate ne se pose JAMAIS sur `FocalRow` lui-même (contrat §WS-4, régression
/// documentée du 2026-05-25). `FocalRow` n'est donc pas `Equatable` ; seule
/// cette enveloppe l'est. Le rendu d'une rangée et la décision de la re-rendre
/// sont deux sujets, et c'est la seconde qui part.
///
/// Corps déplacé à l'IDENTIQUE — aucun comportement ne change. L'enveloppe ne
/// touche aucun état stocké de `FocalRow`, donc le piège d'accès cross-file
/// (`@State private` invisible depuis un fichier frère) ne s'applique pas : elle
/// ne lit que `row.input`, internal par défaut.
///
/// Même topologie que `EquatableMessageBubble` (`ThemedMessageBubble.swift`, lue
/// jamais modifiée). `FocalRowActions` est exclu de la comparaison par
/// construction, comme `FocalRowInput.==` ne le compare jamais.
struct EquatableFocalRow: View {
    let row: FocalRow
    var body: some View { row }
}

extension EquatableFocalRow: @MainActor Equatable {
    static func == (lhs: EquatableFocalRow, rhs: EquatableFocalRow) -> Bool {
        lhs.row.input == rhs.row.input
    }
}
