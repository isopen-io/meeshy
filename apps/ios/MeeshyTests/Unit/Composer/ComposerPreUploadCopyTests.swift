import XCTest
@testable import Meeshy
import MeeshySDK

/// #5086 (vue `4c`) — **ce que l'objet DIT de l'état de son asset.**
///
/// > `PRÊT` · `MONTÉE EN COURS · 34 %` — `4,8 / 14,2 Mo`
@MainActor
final class ComposerPreUploadCopyTests: XCTestCase {

    private let fr = Locale(identifier: "fr_FR")

    // MARK: - Les deux silences

    /// **L'échec ne se montre pas.** La publication reprendra l'envoi ;
    /// l'auteur ne peut ni le comprendre ni le corriger, et le lui dire
    /// transformerait une optimisation invisible en inquiétude.
    func test_unEchec_neDitRien() {
        XCTAssertNil(ComposerPreUploadCopy.label(for: .failed, locale: fr))
    }

    func test_rienDeCommence_neDitRien() {
        XCTAssertNil(ComposerPreUploadCopy.label(for: .idle, locale: fr))
    }

    /// **`nil` et non une chaîne VIDE.** Une chaîne vide se concatène en
    /// silence et laisse un séparateur orphelin — le défaut exact du
    /// « Texte : » de VoiceOver. `nil` oblige l'appelant à décider.
    func test_leSilence_estNil_jamaisUneChaineVide() {
        XCTAssertNil(ComposerPreUploadCopy.label(for: .idle))
        XCTAssertNotEqual(ComposerPreUploadCopy.label(for: .idle), "")
    }

    // MARK: - Les deux états qui parlent

    func test_unAssetPret_leDit() {
        let phrase = ComposerPreUploadCopy.label(
            for: .ready(postMediaId: "m1", remoteURL: "https://cdn/x"), locale: fr)
        XCTAssertEqual(phrase, "PRÊT")
    }

    /// La phrase de la planche, dans ses trois morceaux.
    func test_uneMonteeEnCours_portePourcentageEtOctets() throws {
        let phrase = try XCTUnwrap(ComposerPreUploadCopy.label(
            for: .uploading(sent: 4_800_000, total: 14_200_000), locale: fr))
        XCTAssertTrue(phrase.contains("MONTÉE EN COURS"), phrase)
        XCTAssertTrue(phrase.contains("34"), phrase)
        XCTAssertTrue(phrase.contains("4,8"), phrase)
        XCTAssertTrue(phrase.contains("14,2"), phrase)
    }

    // MARK: - Les octets

    /// **L'unité une seule fois, à la fin.** La répéter double la longueur pour
    /// ne rien ajouter : les deux nombres partagent forcément l'échelle, un
    /// envoi ne change pas d'ordre de grandeur en route.
    func test_lUnite_neSeciteQuUneFois() {
        let texte = ComposerPreUploadCopy.bytes(sent: 4_800_000, total: 14_200_000, locale: fr)
        XCTAssertEqual(texte.components(separatedBy: "Mo").count - 1, 1, texte)
        XCTAssertTrue(texte.hasSuffix("Mo"), "l'unité ferme la phrase : \(texte)")
    }

    /// **Le témoin qui aurait attrapé le paramètre INERTE, et que je n'avais
    /// pas écrit.**
    ///
    /// La première version employait `ByteCountFormatter`, qui n'expose AUCUNE
    /// propriété `locale` : le paramètre était décoratif. Tous mes témoins
    /// passaient — ils mesuraient la locale du SIMULATEUR, française chez moi —
    /// et tombaient chez un voisin dont le simulateur est anglais.
    ///
    /// La seule forme qui ne peut pas passer dans les deux mondes compare DEUX
    /// locales sur la MÊME entrée : un paramètre inerte les rend identiques.
    func test_laLocale_estVIVANTE_etNonDecorative() {
        let enFr = ComposerPreUploadCopy.bytes(
            sent: 4_800_000, total: 14_200_000, locale: Locale(identifier: "fr_FR"))
        let enEn = ComposerPreUploadCopy.bytes(
            sent: 4_800_000, total: 14_200_000, locale: Locale(identifier: "en_US"))
        XCTAssertNotEqual(enFr, enEn,
                          "un paramètre `locale` inerte rendrait la même chaîne : \(enFr)")
        XCTAssertTrue(enFr.contains("4,8"), enFr)
        XCTAssertTrue(enEn.contains("4.8"), enEn)
    }

    /// **La phrase ENTIÈRE doit être d'une seule locale.** Le défaut ne se
    /// voyait pas sur `bytes` seul : il naissait de la COMPOSITION — pourcentage
    /// français, nombre anglais, unité française dans la même ligne. Le témoin
    /// se pose donc sur la phrase, pas sur ses morceaux.
    func test_laPhraseEntiere_estDUneSeuleLocale() throws {
        let phrase = try XCTUnwrap(ComposerPreUploadCopy.label(
            for: .uploading(sent: 4_800_000, total: 14_200_000),
            locale: Locale(identifier: "en_US")))
        XCTAssertTrue(phrase.contains("4.8"), phrase)
        XCTAssertTrue(phrase.contains("14.2"), phrase)
        XCTAssertFalse(phrase.contains("4,8"), phrase)
    }

    /// **L'échelle vient du TOTAL, jamais de l'envoyé.**
    ///
    /// Sur les premiers octets d'un fichier de 14 Mo, une échelle choisie sur
    /// `sent` afficherait « 12,0 / 14,2 » en mélangeant kilo-octets et
    /// méga-octets — deux nombres qui se comparent à l'œil et ne se comparent
    /// pas. Le témoin se pose sur un envoi à peine commencé : à mi-parcours,
    /// les deux échelles coïncident et il passerait dans les deux mondes.
    func test_lEchelle_vientDuTotal_pasDeLEnvoye() {
        let texte = ComposerPreUploadCopy.bytes(sent: 12_000, total: 14_200_000, locale: fr)
        XCTAssertFalse(texte.contains("ko") || texte.contains("kB"), texte)
        XCTAssertTrue(texte.contains("14,2"), texte)
        // 12 000 octets sur une échelle en Mo : le premier nombre est un
        // arrondi à une décimale, pas un « 12 » qui se lirait comme des Mo.
        XCTAssertTrue(texte.hasPrefix("0"), texte)
    }

    /// Un envoi qui déborderait son total — un serveur qui accuse plus que ce
    /// qu'on a envoyé — ne doit pas afficher un nombre supérieur au total.
    func test_unEnvoiAberrant_neDepassePasLeTotal() {
        let texte = ComposerPreUploadCopy.bytes(sent: 99_000_000, total: 1_000_000, locale: fr)
        XCTAssertFalse(texte.contains("99"), texte)
    }

    // MARK: - La composition avec le badge

    /// **Le badge ne gagne un morceau que s'il y a quelque chose à dire.** Sans
    /// cette borne, tout objet sélectionné traînerait un séparateur orphelin —
    /// et les quatre familles sans asset en porteraient un pour toujours.
    func test_leBadge_neGagneUnMorceau_queSiLaMonteeParle() {
        let slide = StorySlide(id: "s1")
        // Aucun objet : le badge est nil dans les deux cas, et c'est le
        // comportement d'avant ce lot qui doit être préservé.
        XCTAssertNil(ComposerObjectChips.badge(forSelected: nil, in: slide, preUpload: .idle))
        XCTAssertNil(ComposerObjectChips.badge(
            forSelected: nil, in: slide,
            preUpload: .uploading(sent: 1, total: 2)))
    }
}
