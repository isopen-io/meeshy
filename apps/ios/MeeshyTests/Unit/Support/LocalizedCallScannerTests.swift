import XCTest

/// Bornes du scanner partagé par toutes les gardes de localisation.
///
/// Chaque cliquet du dépôt — le plafond des clés non traduites, l'épinglage des
/// écrans, l'invariant « une clé, une chaîne » — repose entièrement sur ce que ce
/// scanner VOIT. Rétréci, il ne rougit pas : il compte simplement MOINS, et les
/// plafonds deviennent franchissables sans que rien ne le signale. Ces bornes
/// l'épinglent donc contre des échantillons dont la réponse est connue, plutôt
/// que contre le dépôt, dont le contenu bouge.
final class LocalizedCallScannerTests: XCTestCase {

    /// **Il voit les DEUX écritures d'un appel (258i, #4292).**
    ///
    /// Le marqueur a été un littéral pendant huit itérations, et un appel réparti sur
    /// plusieurs lignes lui était invisible.
    func test_leScannerVoitLesAppelsRepartisSurPlusieursLignes() {
        let source = """
        let a = String(localized: "une.ligne", defaultValue: "A", bundle: .main)
        let b = String(
            localized: "plusieurs.lignes",
            defaultValue: "B",
            bundle: .main
        )
        """
        let keys = LocalizedCallScanner.calls(in: source).map(\.key).sorted()
        XCTAssertEqual(
            keys, ["plusieurs.lignes", "une.ligne"],
            "le scanner doit voir l'appel sur une ligne ET l'appel réparti — sinon le "
            + "plafond du cliquet borne une mesure partielle"
        )
    }

    /// **Il voit l'appel IMBRIQUÉ (271i).** Même angle mort que 258i, un cran plus
    /// bas : ce n'est pas un appel que le marqueur rate, c'est un appel que le
    /// curseur ENJAMBE, parce qu'il reprenait après la fin de l'appel englobant.
    /// Le dépôt en comptait trois, tous dans l'interpolation d'un `defaultValue`.
    func test_leScannerVoitLAppelImbriqueDansUneInterpolation() {
        let source = """
        let a = String(
            localized: "externe",
            defaultValue: "\\(x ? String(localized: "interne.vrai", defaultValue: "Actif", bundle: .main) : \
        String(localized: "interne.faux", defaultValue: "Inactif", bundle: .main))",
            bundle: .main
        )
        """
        let keys = LocalizedCallScanner.calls(in: source).map(\.key).sorted()
        XCTAssertEqual(
            keys, ["externe", "interne.faux", "interne.vrai"],
            "un appel écrit dans l'interpolation d'un autre est un appel : il porte une "
            + "clé, un defaultValue, et se dément aussi bien qu'un autre"
        )
    }

    /// L'appel englobant garde SON `defaultValue`, pas celui de l'appel qu'il
    /// contient — sans quoi élargir le scanner ferait diverger l'externe d'avec
    /// lui-même à chaque site.
    ///
    /// Ce défaut-là est TRONQUÉ au premier guillemet interne (`"Avant \(String(localized: `),
    /// le lecteur de `defaultValue:` ne connaissant pas l'interpolation. C'est sans
    /// conséquence pour « une clé, une chaîne » : la troncature est DÉTERMINISTE, donc
    /// deux sites qui écrivent la même chose produisent le même squelette. La borne
    /// n'affirme donc que ce qui est vrai — le préfixe vient de l'externe.
    func test_lAppelEnglobantGardeSonPropreDefaultValue() {
        let source = """
        let a = String(localized: "externe", defaultValue: "Avant \\(String(localized: "interne", \
        defaultValue: "Dedans", bundle: .main)) après", bundle: .main)
        """
        let outer = LocalizedCallScanner.calls(in: source).first { $0.key == "externe" }
        XCTAssertEqual(outer?.defaultValue?.hasPrefix("Avant "), true, "l'externe garde le sien")
    }

    /// **Le squelette sépare un texte divergent d'une EXPRESSION divergente.**
    /// Un squelette qui écraserait tout, ou rien, laisserait
    /// `InlineDefaultConsistencyTests` vert sur un arbre cassé.
    func test_leSqueletteSepareLeTexteDeLExpression() {
        let skeleton = LocalizedCallScanner.literalSkeleton(of:)

        XCTAssertEqual(
            skeleton("Supprimer \\(label)"), skeleton("Supprimer \\(labelFor(attachment))"),
            "deux expressions, une seule chaîne — Xcode extrait les deux en `Supprimer %@`"
        )
        XCTAssertNotEqual(
            skeleton("Media 1 of \\(count)"), skeleton("Media 2 of \\(count)"),
            "deux chaînes — une entrée de catalogue ne peut pas servir les deux"
        )
        XCTAssertEqual(
            skeleton("\\(a ? \"x\" : \"y\") fin"), skeleton("\\(f(g(z))) fin"),
            "le balayage d'interpolation connaît les guillemets et l'imbrication : une "
            + "ternaire porte des guillemets et aucune parenthèse interne, un appel "
            + "imbriqué en ferme trois"
        )
        XCTAssertEqual(
            skeleton("R\\u{00E9}initialiser"), skeleton("Réinitialiser"),
            "une seule chaîne écrite de deux façons — la comparaison porte sur les "
            + "chaînes, pas sur leur orthographe source"
        )
        XCTAssertEqual(skeleton("Terminé"), "Terminé", "un défaut sans interpolation est lui-même")
    }
}
