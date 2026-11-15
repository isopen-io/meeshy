import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Un séparateur n'a de sens que s'il sépare deux choses** — signalé par une
/// session voisine au simulateur, 2026-09-03.
///
/// > « la carte s'annonce `« Story, 1 objet : Texte :  »` — un deux-points en
/// > suspens quand le texte est encore vide. VoiceOver dit "Texte :" et
/// > s'arrête. »
///
/// ## Pourquoi ce cas EXISTE, et n'est pas une curiosité
///
/// Taper la porte TEXTE pose une coquille VIDE et ouvre l'éditeur dans le même
/// geste. Entre les deux, l'objet est sur la scène et n'a pas un caractère —
/// c'est l'état NOMINAL du premier instant, pas un cas limite. Un utilisateur
/// de VoiceOver qui explore la carte à ce moment entend une phrase coupée.
///
/// ## Le témoin s'écrit sur la surface PUBLIQUE
///
/// `accessibilityElements` est ce que VoiceOver interroge réellement ; épingler
/// le helper seul prouverait qu'une fonction rend la bonne chaîne, jamais que
/// c'est elle que l'arbre expose. Le mode `.edit` est celui du composer, seul
/// endroit où une coquille vide peut vivre (elle est supprimée à la fermeture).
@MainActor
final class StoryCanvasTextAccessibilityTests: XCTestCase {

    private func canvas(texte: String) -> StoryCanvasUIView {
        var effets = StoryEffects()
        effets.textObjects = [StoryTextObject(id: "t1", text: texte)]
        var slide = StorySlide(id: "s1")
        slide.effects = effets
        let vue = StoryCanvasUIView(slide: slide, mode: .edit)
        vue.frame = CGRect(x: 0, y: 0, width: 270, height: 480)
        return vue
    }

    private func libellés(_ vue: StoryCanvasUIView) -> [String] {
        (vue.accessibilityElements as? [UIAccessibilityElement] ?? [])
            .compactMap(\.accessibilityLabel)
    }

    /// **Aucun libellé ne se termine par un séparateur orphelin.** L'assertion
    /// porte sur la FORME plutôt que sur la chaîne exacte : elle attrape le
    /// même défaut sur le lieu, le sticker ou toute famille ajoutée ensuite,
    /// et elle survit à une traduction.
    func test_uneCoquilleVide_neLaissePasDeDeuxPointsEnSuspens() {
        for libellé in libellés(canvas(texte: "")) {
            let net = libellé.trimmingCharacters(in: .whitespaces)
            XCTAssertFalse(net.hasSuffix(":"),
                           "« \(libellé) » se termine par un séparateur que rien ne suit")
            XCTAssertFalse(net.isEmpty, "un élément sans libellé est muet pour VoiceOver")
        }
    }

    /// **Le vide se DIT, et c'est le HELPER que l'arbre expose.**
    ///
    /// L'assertion compare l'arbre à ce que la production compose, jamais à un
    /// mot français : la première rédaction de ce témoin cherchait « vide »
    /// dans le libellé et tombait sur un simulateur en ANGLAIS — un témoin qui
    /// n'échoue que dans une langue ne garde la règle que dans celle-là.
    ///
    /// Ce que la comparaison prouve n'est pas la CHAÎNE (le helper la choisit)
    /// mais le CÂBLAGE : que la coquille vide passe bien par lui, et non par
    /// la concaténation qu'il remplace.
    func test_uneCoquilleVide_annonceCeQueLeHelperCompose() {
        let vue = canvas(texte: "")
        let attendu = vue.textAccessibilityLabel("")
        XCTAssertFalse(attendu.contains(" : "),
                       "le libellé d'un vide ne compose aucun séparateur")
        XCTAssertTrue(libellés(vue).contains(attendu),
                      "l'arbre n'expose pas ce que le helper compose")
    }

    /// **Le cas nominal reste intact** — c'est la moitié qu'un correctif de
    /// vide casse le plus facilement, en supprimant le séparateur pour tout le
    /// monde plutôt que pour le seul cas qui n'a rien à séparer.
    func test_unTexteÉcrit_gardeSonPréfixeEtSonSéparateur() {
        XCTAssertTrue(libellés(canvas(texte: "Bonjour")).contains { $0.hasSuffix(": Bonjour") },
                      "un texte non vide doit rester annoncé « Texte : Bonjour »")
    }

    /// Le blanc compte comme du vide — même règle que partout ailleurs dans le
    /// composer. L'égalité avec le vide VRAI dit la règle sans nommer aucune
    /// langue : sans elle, une espace tapée par accident rendrait le défaut
    /// d'origine sous une forme que le premier témoin ne verrait pas.
    func test_unTexteFaitDEspaces_sAnnonceCommeUnVideVrai() {
        XCTAssertEqual(libellés(canvas(texte: "   \n ")), libellés(canvas(texte: "")))
    }
}
