import Foundation

/// Les initiales qu'une identité affiche quand elle n'a pas d'image — avatar,
/// pastille d'appel, bulle de la Rivière, intro d'export.
///
/// **Seules les LETTRES comptent (#8143)** : un nom de carnet « Théo (foot) »
/// donne « TF », jamais « T( » ; un mot sans lettre (emoji, ponctuation) est
/// sauté. Sans aucune lettre, le premier caractère non blanc reste le repli ;
/// un nom vide ou blanc rend une chaîne vide, et c'est à l'appelant de dire ce
/// qu'il peint à la place.
///
/// Cinq surfaces dérivaient leurs initiales chacune de son côté, et seule celle
/// de l'avatar avait reçu la règle des lettres : c'est ici qu'elle vit
/// désormais, une fois.
public enum NameInitials {
    public static func of(_ name: String) -> String {
        let letters = name.split(whereSeparator: \.isWhitespace)
            .compactMap { $0.first(where: \.isLetter) }
            .prefix(2)
            .map(String.init)
            .joined()
            .uppercased()
        guard letters.isEmpty else { return letters }
        return String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1)).uppercased()
    }
}
