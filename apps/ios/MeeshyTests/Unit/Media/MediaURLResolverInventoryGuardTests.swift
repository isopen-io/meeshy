import Foundation
import XCTest

/// **AUCUN RENDU DE MÉDIA NE COMPOSE SON URL SANS LE RÉSOLVEUR** (#7056).
///
/// ## Le défaut que cette garde ferme
///
/// La base porte désormais des **clés de stockage** (`2026/02/<id>/photo.jpg`)
/// là où elle portait des adresses absolues. `MeeshyConfig.resolveMediaURL`
/// sait les router — c'est sa raison d'être, documentée à
/// `MeeshyConfig.swift:166-172`. Quatre lignes ne l'appelaient pas :
/// `StoryViewerView.swift` (préchauffage des médias, et les deux branches de
/// `resolveVideoURL`) et `StoryMediaLayer.swift`.
///
/// **Et rien ne rougissait**, parce que `URL(string:)` ne rend PAS `nil` sur
/// une clé nue : il rend une URL *relative*, sans schéma ni hôte. Le `guard`
/// passait, le chargement échouait, aucune branche de repli n'était empruntée.
/// Un `nil` aurait au moins été visible. La panne était donc silencieuse à la
/// fois pour l'utilisateur et pour la suite de tests.
///
/// ## Pourquoi une garde d'INVENTAIRE et pas quatre témoins
///
/// Quatre témoins auraient prouvé que ces lignes-là sont corrigées. La question
/// à garder n'est pas « ces sites-ci sont-ils corrects ? » mais **« en
/// existe-t-il un qui ne l'est pas ? »** — la seule forme qui survive à l'ajout
/// d'une surface que personne n'aura pensé à tester.
///
/// Elle a d'ailleurs payé tout de suite : le balayage a relevé **trois sites de
/// plus** que la lecture manuelle qui l'a motivée (`VideoPosterResolver`,
/// `AudioPlayerView`, `SoundPreviewPlayer`). Les trois se sont révélés
/// LÉGITIMES — ils gardent le cas `file://` et routent le distant par le
/// résolveur — mais c'est la garde qui a posé la question, pas l'audit.
///
/// ## Ce que le détecteur cherche, et pourquoi PAS autre chose
///
/// Une première écriture cherchait `URL(string: media.mediaURL)` — la forme
/// littérale. **Mesuré : elle ne trouvait rien**, y compris sur le code
/// FAUTIF, parce que Swift lie d'abord la valeur (`guard let raw = m.url, let
/// url = URL(string: raw)`). Le détecteur doit donc travailler à la LIGNE :
/// une ligne qui nomme un porteur d'adresse de média ET appelle `URL(string:)`
/// est le motif réel, et c'est celui que le `guard let …, let …` idiomatique
/// produit.
///
/// Discrimination mesurée avant de committer : **4 sites sur la version
/// fautive, 0 après le correctif**.
final class MediaURLResolverInventoryGuardTests: XCTestCase {

    /// Les racines balayées : les vues iOS et la couche UI du SDK — partout où
    /// un média se PEINT. Les services de réseau composent leurs URL autrement
    /// (routes d'API), et ne sont pas le sujet.
    private static let racines = [
        "apps/ios/Meeshy/Features",
        "packages/MeeshySDK/Sources/MeeshyUI",
    ]

    /// Les noms de propriété qui portent une adresse de média venue de la BASE.
    /// Ce sont eux qui ont changé de forme, et eux seuls que le résolveur doit
    /// traiter.
    private static let porteursDAdresseDeMedia = [
        "media.mediaURL",
        "media.url",
        "feed.url",
        "m.url",
        ".mediaURL",
        ".fileUrl",
    ]

    /// Le fichier vit dans `apps/ios/MeeshyTests/Unit/Media/` : six remontées
    /// atteignent la racine du dépôt. Lue depuis `#filePath` plutôt que depuis
    /// le bundle — un test unitaire n'embarque pas les sources qu'il inspecte.
    private static func racineDuDepot() -> URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url = url.deletingLastPathComponent() }
        return url
    }

    private static func fichiersSwift(sous racine: String) -> [URL] {
        let base = racineDuDepot().appendingPathComponent(racine)
        guard let enumerateur = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil) else {
            return []
        }
        return enumerateur.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    func test_aucunRenduDeMediaNeComposeSonURLSansLeResolveur() {
        var fautifs: [String] = []
        var fichiersLus = 0

        for racine in Self.racines {
            for fichier in Self.fichiersSwift(sous: racine) {
                guard let source = try? String(contentsOf: fichier, encoding: .utf8) else { continue }
                fichiersLus += 1
                let relatif = fichier.path.replacingOccurrences(of: Self.racineDuDepot().path + "/", with: "")
                let lignes = source.components(separatedBy: .newlines)

                for (index, ligne) in lignes.enumerated() {
                    let nue = ligne.trimmingCharacters(in: .whitespaces)

                    // Une ligne de COMMENTAIRE qui cite la forme interdite pour
                    // l'expliquer ne la commet pas — c'est le piège du détecteur
                    // par sous-chaîne, déjà payé par ce dépôt (leçon 630), et ce
                    // fichier-ci en est lui-même plein.
                    if nue.hasPrefix("//") || nue.hasPrefix("*") || nue.hasPrefix("/*") { continue }
                    guard nue.contains("URL(string:") else { continue }
                    guard Self.porteursDAdresseDeMedia.contains(where: { nue.contains($0) }) else { continue }

                    // LE CAS LOCAL EST LÉGITIME, et c'est une exemption de
                    // CONTEXTE, pas une liste de chemins : un `file://` ne se
                    // résout pas, il se LIT. Trois sites du dépôt l'emploient
                    // correctement — ils testent `hasPrefix("file://")` ou
                    // `isFileURL` puis retombent sur `resolveMediaURL`. Une
                    // liste d'exemptions par fichier se serait périmée au
                    // premier déplacement ; la forme, elle, reste vraie.
                    let contexte = lignes[max(0, index - 2)...index].joined(separator: "\n")
                    if contexte.contains("file://") || contexte.contains("isFileURL") { continue }

                    fautifs.append("\(relatif):\(index + 1) — \(nue.prefix(90))")
                }
            }
        }

        // Sans sujet, ce témoin verdirait sur un inventaire VIDE : une racine
        // renommée le rendrait muet au lieu de rouge.
        XCTAssertGreaterThan(fichiersLus, 200, "Le balayage n'a presque rien lu — les racines ont-elles bougé ?")

        XCTAssertEqual(
            fautifs.sorted(),
            [],
            """
            Ces lignes composent l'URL d'un média avec `URL(string:)` nu.
            Sur une CLÉ DE STOCKAGE (`2026/02/<id>/photo.jpg`), `URL(string:)` ne rend pas `nil` :
            il rend une URL RELATIVE, le `guard` passe, et le média ne se charge JAMAIS — en silence.
            Employer `MeeshyConfig.resolveMediaURL(_:)`, qui porte la branche « clé de stockage »
            et traite `file://` en premier (le cas local reste intact).
            """
        )
    }
}
