import Foundation

/// **Le logo de cercle peint sur l'intro d'une story exportée (#13997).**
///
/// Miroir Swift de `relationExportBadge` (`packages/shared/utils/relation-export-badge.ts`) ;
/// `RelationExportBadgeVectorTests` rejoue le fichier de vecteurs commun
/// (`packages/shared/fixtures/relation-export-badge.vectors.json`).
///
/// Entrée : le niveau EFFECTIF du lien exportateur / auteur, tel que le serveur le
/// SERT — jamais un niveau accordé d'un seul côté. Sortie : l'emoji du cercle, ou
/// `nil` = rien n'est peint. À partir de Proche seulement (décision porteur du
/// 2026-10-31) ; Ami et en dessous ne montrent rien. Toute valeur absente, inconnue,
/// en minuscules ou réservée (ATOM, hors MVP) rend `nil` : le logo se ferme sur le doute.
public enum RelationExportBadge {

    /// Premier niveau qui porte un logo ; le fichier de vecteurs le déclare aussi.
    public static let minimumLevel = "CLOSE"

    private static let emojis: [String: String] = [
        "CLOSE": "🔥",
        "BLOOD": "🩸",
    ]

    public static func emoji(forServedLevel level: String?) -> String? {
        guard let level else { return nil }
        return emojis[level]
    }
}
