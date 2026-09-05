import Testing
import UIKit
import MeeshySDK
@testable import MeeshyUI

/// **Aucune sonde disque synchrone ne se répète dans un `body` (#4617).**
///
/// Mesuré au Time Profiler sur iPhone 16 Pro Max : `DiskCacheStore.cachedFileURL`
/// — donc `lstat` — sous `LentilleRailEntryView.avatarContent.getter`, puis sous
/// `LentilleRailSelfEntryView.avatarContent.getter`. #4002 avait mémoïsé la
/// COUVERTURE du même rail ; l'avatar faisait la même sonde, sans mémo.
///
/// Ce que ces témoins refusent, c'est la forme du défaut plutôt que ses deux
/// sites : l'ABSENCE sur disque n'était jamais mémorisée, donc l'image que le
/// disque n'a PAS — le cas le plus fréquent sur un rail qu'on vient d'ouvrir —
/// refaisait son `lstat` à chaque évaluation, indéfiniment.
@MainActor
@Suite("WarmImageProbe")
struct WarmImageProbeTests {

    private func pixel() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).image { _ in }
    }

    /// LE témoin. Sans mémo, la valeur rendue serait la MÊME (`nil`) — c'est
    /// pourquoi il compte les sondes et non les retours.
    @Test("une absence n'est sondée qu'une fois, quel que soit le nombre de passes de body")
    func absence_is_probed_once() {
        WarmImageProbe.reset()
        var sondes = 0

        for _ in 0..<5 {
            _ = WarmImageProbe.warmedImage(
                for: "https://x/a.jpg", resident: { _ in nil }, probe: { _ in sondes += 1; return nil })
        }

        #expect(sondes == 1, "cinq évaluations, une seule sonde disque")
    }

    /// **Contre-épreuve** : le mémo distingue les adresses. Sans elle, le
    /// témoin ci-dessus passerait au vert pour un mémo qui ne sonderait
    /// qu'UNE FOIS EN TOUT, ce qui serait un défaut bien pire.
    @Test("deux adresses distinctes sont sondées chacune une fois")
    func two_addresses_are_each_probed_once() {
        WarmImageProbe.reset()
        var sondees: [String] = []
        let sonde: (String) -> UIImage? = { sondees.append($0); return nil }

        for _ in 0..<3 {
            _ = WarmImageProbe.warmedImage(for: "https://x/a.jpg", resident: { _ in nil }, probe: sonde)
            _ = WarmImageProbe.warmedImage(for: "https://x/b.jpg", resident: { _ in nil }, probe: sonde)
        }

        #expect(sondees.sorted() == ["https://x/a.jpg", "https://x/b.jpg"])
    }

    /// **L'ordre EST la sûreté du mémo.** La mémoire résidente est consultée
    /// AVANT lui : une entrée « absente » devenue fausse s'efface donc d'
    /// elle-même dès que quelque chose est chargé, sans qu'aucun site
    /// d'écriture ait à connaître cette mémoire.
    @Test("une image devenue résidente est rendue, même après une absence mémorisée")
    func a_memoized_miss_self_heals_through_the_resident_cache() {
        WarmImageProbe.reset()
        var resident: UIImage?

        _ = WarmImageProbe.warmedImage(for: "https://x/a.jpg", resident: { _ in resident }, probe: { _ in nil })
        resident = pixel()
        let apres = WarmImageProbe.warmedImage(for: "https://x/a.jpg", resident: { _ in resident }, probe: { _ in nil })

        #expect(apres != nil, "sinon l'avatar clignoterait au retour de chaque écran")
    }

    /// Et l'entrée périmée est RETIRÉE, pas seulement contournée — sans quoi
    /// le mémo grossirait de clés qu'il n'a plus le droit de refuser.
    @Test("la lecture résidente efface l'absence mémorisée")
    func a_resident_hit_clears_the_memoized_miss() {
        WarmImageProbe.reset()
        _ = WarmImageProbe.warmedImage(for: "https://x/a.jpg", resident: { _ in nil }, probe: { _ in nil })
        #expect(WarmImageProbe.memoizedMissCountForTesting == 1)

        _ = WarmImageProbe.warmedImage(for: "https://x/a.jpg", resident: { _ in self.pixel() }, probe: { _ in nil })

        #expect(WarmImageProbe.memoizedMissCountForTesting == 0)
    }

    /// Une PRÉSENCE ne se mémorise jamais : la retenir doublerait le NSCache
    /// et sa comptabilité d'éviction.
    @Test("une sonde qui trouve n'ajoute rien au mémo")
    func a_successful_probe_memoizes_nothing() {
        WarmImageProbe.reset()

        let image = WarmImageProbe.warmedImage(
            for: "https://x/a.jpg", resident: { _ in nil }, probe: { _ in self.pixel() })

        #expect(image != nil)
        #expect(WarmImageProbe.memoizedMissCountForTesting == 0)
    }

    /// Le mémo ne doit pas devenir une fuite sur un fil qui défile longtemps.
    /// Au plafond on VIDE : le pire cas est une sonde de plus par clé.
    @Test("le mémo se vide au plafond au lieu de croître sans fin")
    func the_memo_empties_at_its_cap() {
        WarmImageProbe.reset()

        for index in 0..<600 {
            _ = WarmImageProbe.warmedImage(
                for: "https://x/\(index).jpg", resident: { _ in nil }, probe: { _ in nil })
        }

        #expect(WarmImageProbe.memoizedMissCountForTesting <= 512,
                "sinon le mémo retient une adresse par image jamais résidente")
        #expect(WarmImageProbe.memoizedMissCountForTesting > 0,
                "et il ne s'annule pas non plus — il continuerait de sonder à chaque passe")
    }

    // MARK: - La porte est UNIQUE

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// #4002 a mémoïsé la COUVERTURE, où le symptôme avait été vu ; l'avatar du
    /// même rail, qui fait la même sonde, n'a rien reçu. Garder les deux sites
    /// que la trace a nommés aurait rejoué la même erreur d'un cran : ils sont
    /// DIX dans ce fichier, répartis sur QUATRE composants.
    @Test("aucun composant d'image n'appelle la sonde disque en direct")
    func no_primitive_calls_the_probe_directly() throws {
        let source = try sdkSource("Sources/MeeshyUI/Primitives/CachedAsyncImage.swift")

        #expect(
            !source.contains("CacheCoordinator.warmedImage(for:"),
            """
            Tout passe par `WarmImageProbe` — seul endroit où l'absence est mémorisée. \
            Un composant qui court-circuite la porte rouvre le `lstat` par passe de body \
            sans qu'aucun autre témoin ne tombe.
            """
        )
    }

    /// **Ancre de la garde négative ci-dessus** : sans elle, supprimer les dix
    /// appels la ferait passer au vert en perdant sa protection.
    @Test("les dix sites passent bien par la porte")
    func the_ten_call_sites_go_through_the_door() throws {
        let source = try sdkSource("Sources/MeeshyUI/Primitives/CachedAsyncImage.swift")
        let passages = source.components(separatedBy: "WarmImageProbe.warmedImage(for:").count - 1

        #expect(passages >= 10, """
        Quatre composants, dix appels : ils doivent tous être là, sinon la garde négative \
        garde le vide.
        """)
    }
}
