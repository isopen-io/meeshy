import Foundation

/// D4 / bandwidth lever 5.2 — moteur pur de sélection d'URL d'image.
///
/// Choisit la **plus petite image dont la largeur en pixels est `>= targetWidthPx`**
/// parmi les variantes responsive (`MeeshyImageVariant`) plus l'original, pour
/// charger un WebP allégé au lieu de l'original multi-Mo dans une preview.
///
/// Provenance de l'algorithme (cf. spec 2026-06-09) :
/// - Construction des candidats (filtre `url`/`width>0`, tri, dédupe, append de
///   l'original ssi strictement plus large) = miroir de `buildImageSrcSet`
///   (web `srcset.ts:26-42`).
/// - Sélection (plus petit candidat `>= target`, sinon le plus grand) = miroir de
///   l'étape navigateur HTML « select an image source ».
///
/// Sortie ne dépend que des entrées, sans I/O ni état mutable — atome SDK, dans
/// la lignée de `MediaDownloadPolicyEngine`.
public enum ImageVariantSelector {
    /// - Parameters:
    ///   - variants: les variantes responsive de l'attachment (peut être vide —
    ///     images chiffrées n'en ont pas).
    ///   - originalURL: l'URL de l'image originale (`attachment.fileUrl`).
    ///   - originalWidth: la largeur en pixels de l'original (`attachment.width`),
    ///     `nil` si inconnue.
    ///   - targetWidthPx: la largeur d'affichage cible en pixels
    ///     (`points × UIScreen.scale`).
    /// - Returns: l'URL de l'image à charger. `originalURL` quand aucune variante
    ///   ne convient (fallback à régression nulle).
    public static func bestImageURL(
        variants: [MeeshyImageVariant],
        originalURL: String,
        originalWidth: Int?,
        targetWidthPx: Int
    ) -> String {
        // Étape 1 — candidats : filtrer, trier par un comparateur TOTAL `(width, url)`
        // (Swift `sort(by:)` n'est pas stable), puis dédupliquer par `width` en
        // gardant le DERNIER en ordre croissant (last-write-wins, miroir srcset.ts:33).
        // Résultat déterministe run-to-run, indépendant de l'ordre d'entrée.
        let sorted = variants
            .filter { !$0.url.isEmpty && $0.width > 0 }
            .sorted { ($0.width, $0.url) < ($1.width, $1.url) }

        var urlByWidth: [Int: String] = [:]
        var ascendingWidths: [Int] = []
        for v in sorted {
            if urlByWidth[v.width] == nil { ascendingWidths.append(v.width) }
            urlByWidth[v.width] = v.url
        }
        var candidates: [(width: Int, url: String)] = ascendingWidths.map { ($0, urlByWidth[$0]!) }

        // Étape 2 — ajouter l'original comme plus grand candidat ssi STRICTEMENT
        // plus large que la plus grande variante (miroir srcset.ts:40).
        if let originalWidth, let largest = candidates.last?.width, originalWidth > largest {
            candidates.append((originalWidth, originalURL))
        }

        // Étape 5 — aucun candidat exploitable → original (fallback chiffré inclus).
        guard !candidates.isEmpty else { return originalURL }

        // Étape 6 — cible dégénérée (jamais vue par un navigateur) → le moins d'octets.
        if targetWidthPx <= 0 { return candidates[0].url }

        // Étape 3 — plus petit candidat `>= target`.
        if let fit = candidates.first(where: { $0.width >= targetWidthPx }) {
            return fit.url
        }
        // Étape 4 — cible au-dessus de tout → plus grand candidat.
        return candidates[candidates.count - 1].url
    }
}
