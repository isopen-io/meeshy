import Foundation

/// **Le pack à mettre en avant d'un lien profond** (`meeshy://settings/packs?pack=<slug>`, #10703).
///
/// Même paramètre que le web (`/settings?volet=packs&pack=<slug>`). Un slug est un identifiant
/// de catalogue — minuscules, chiffres, tirets — : tout le reste est écarté, le lien ouvre alors
/// la vitrine sans rien mettre en avant plutôt que de porter une chaîne arbitraire jusqu'à l'écran.
enum PackFocusSlug {
    static func normalized(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let slug = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !slug.isEmpty, slug.count <= 64,
              slug.unicodeScalars.allSatisfy({ ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "-" }),
              slug.first != "-" else { return nil }
        return slug
    }
}
