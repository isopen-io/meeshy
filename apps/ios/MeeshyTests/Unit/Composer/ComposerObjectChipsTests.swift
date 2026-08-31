import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **L'inspecteur de `1c` porte des VALEURS LISIBLES, pas des glyphes muets
/// (#4073).**
///
/// La planche `1c` montre une rangée horizontale de jetons : `STYLE · NÉON`,
/// `TAILLE 38`, `ALIGN ▭`, `0:00 → 0:06`. Chacun dit l'état COURANT de l'objet
/// sélectionné avant même qu'on le touche. L'app rend aujourd'hui des bulles
/// d'icônes — on y lit ce qu'on peut CHANGER, jamais ce qui EST.
///
/// La différence n'est pas décorative : un réglage qu'il faut ouvrir pour
/// connaître oblige l'auteur à explorer pour se souvenir. Un jeton qui porte sa
/// valeur répond sans être touché — c'est la dimension 12, la complexité se paie
/// dans le code, pas chez l'utilisateur.
///
/// **La règle est PURE et rend des mots, pas des vues.** Ce qu'un jeton AFFICHE
/// s'éprouve sans monter d'écran ; ce qu'il ouvre est l'affaire de la vue.
final class ComposerObjectChipsTests: XCTestCase {

    /// **La locale est PINCÉE, et c'est ce qui rend les attentes ci-dessous
    /// honnêtes.** « TAILLE 38 » et « 0:00 → 0:06 » ne sont vrais qu'en
    /// chiffres latins ; les lire sous `.current` ferait juger la locale du
    /// SIMULATEUR — vert en France, rouge sur un banc arabe, sans qu'aucune des
    /// deux couleurs ne dise quoi que ce soit de la règle (leçon 234i).
    private func chips(pour texte: StoryTextObject) -> [ComposerObjectChips.Chip] {
        ComposerObjectChips.chips(for: texte, locale: Locale(identifier: "fr_FR"))
    }

    private func texte(style: String? = nil,
                       taille: Double = 38,
                       align: String? = nil,
                       debut: Double? = nil,
                       duree: Double? = nil) -> StoryTextObject {
        var t = StoryTextObject(text: "Dernier soir de tournage", x: 0.5, y: 0.5)
        t.textStyle = style
        t.fontSize = taille
        t.textAlign = align
        t.startTime = debut
        t.duration = duree
        return t
    }

    func test_laTaille_seLitSansOuvrirQuoiQueCeSoit() {
        let jetons = chips(pour: texte(taille: 38))
        XCTAssertTrue(jetons.contains { $0.label == "TAILLE 38" },
                      "le jeton porte la valeur courante — \(jetons.map(\.label))")
    }

    /// **Un style ABSENT ne fabrique pas un jeton « aucun ».** Loi 8 : le jeton
    /// paraît quand il a quelque chose à dire. « STYLE · — » enseignerait moins
    /// que rien : il occuperait la place en affirmant une valeur qui n'existe pas.
    func test_unStyleAbsent_neFabriquePasDeJeton() {
        let jetons = chips(pour: texte(style: nil))
        XCTAssertFalse(jetons.contains { $0.label.hasPrefix("STYLE") })
    }

    func test_unStylePose_seNommeEnMajuscules() {
        let jetons = chips(pour: texte(style: "neon"))
        XCTAssertTrue(jetons.contains { $0.label == "STYLE · NÉON" },
                      "la planche écrit « STYLE · NÉON » — \(jetons.map(\.label))")
    }

    /// La fenêtre de temps se lit `0:00 → 0:06`, et seulement quand l'objet en a
    /// une : un texte permanent n'a pas de fin à annoncer.
    func test_laFenetreDeTemps_seLitQuandElleExiste() {
        let avec = chips(pour: texte(debut: 0, duree: 6))
        XCTAssertTrue(avec.contains { $0.label == "0:00 → 0:06" }, "\(avec.map(\.label))")

        let permanent = chips(pour: texte(debut: nil, duree: nil))
        XCTAssertFalse(permanent.contains { $0.label.contains("→") })
    }

    func test_lAlignement_seLitParSonMot() {
        let jetons = chips(pour: texte(align: "center"))
        XCTAssertTrue(jetons.contains { $0.label == "ALIGN · CENTRÉ" }, "\(jetons.map(\.label))")
    }

    /// **Le fusible.** Une règle qui rendrait toujours une liste vide passerait
    /// les trois témoins négatifs ci-dessus sans rien servir.
    func test_unTexteCompletPorteSesQuatreJetons() {
        let jetons = chips(
            pour: texte(style: "neon", taille: 38, align: "center", debut: 0, duree: 6))
        XCTAssertEqual(jetons.count, 4, "\(jetons.map(\.label))")
        XCTAssertEqual(Set(jetons.map(\.id)).count, 4, "deux jetons ne partagent pas une identité")
    }

    /// L'ORDRE suit la planche : ce qui change l'apparence d'abord, le temps en
    /// dernier. Il ne dépend pas de ce qui est renseigné — un jeton qui
    /// apparaît ne doit pas déplacer ses voisins sous le doigt.
    func test_lOrdreSuitLaPlanche_etNeDependPasDeCeQuiEstRenseigne() {
        let complet = chips(
            pour: texte(style: "neon", align: "center", debut: 0, duree: 6)).map(\.id)
        XCTAssertEqual(complet, ["style", "size", "align", "window"])

        let partiel = chips(pour: texte(align: "center")).map(\.id)
        XCTAssertEqual(partiel, ["size", "align"], "l'ordre des survivants est celui du complet")
    }

    /// **Le témoin qui prouve que la conversion a servi à quelque chose.**
    ///
    /// `String(format: "%d:%02d")` vécut dans `timecode` et gravait les chiffres
    /// LATINS. Le défaut ne se voit pas en français : les deux écritures y
    /// rendent « 0:06 », donc un témoin en fr_FR reste vert des deux côtés du
    /// correctif et ne prouve RIEN. Il faut une locale où les deux divergent.
    ///
    /// **`ar_SA`, pas `ar`** : une locale arabe NUE se fait compléter par la
    /// région de l'APPAREIL, et rend donc des chiffres latins sur un banc
    /// américain — le témoin serait vert par accident, pour la mauvaise raison.
    /// C'est la même précaution que `LocalizedNumberTests` et
    /// `ReachMetricLabelTests`, et elle se paie une fois.
    ///
    /// La comparaison est `.literal` : par COLLATION, « ٦ » vaut « 6 », et un
    /// `contains` ordinaire trouverait le chiffre latin dans la chaîne arabe.
    func test_lesChiffresSuiventLaLocale_pasLeFormateur() {
        let arabe = ComposerObjectChips.chips(
            for: texte(taille: 38, debut: 0, duree: 6),
            locale: Locale(identifier: "ar_SA"))
        let fenetre = arabe.first { $0.id == "window" }?.label ?? ""

        XCTAssertNil(fenetre.range(of: "0:06", options: .literal),
                     "chiffres latins dans une fenêtre arabe — \(fenetre)")
        XCTAssertNotNil(fenetre.range(of: "٦", options: .literal),
                        "la fenêtre doit porter les chiffres arabo-indiens — \(fenetre)")

        let taille = arabe.first { $0.id == "size" }?.label ?? ""
        XCTAssertNil(taille.range(of: "38", options: .literal),
                     "la TAILLE aussi est un nombre montré — \(taille)")
    }

    // MARK: - Les autres kinds — « il change de contenu, jamais de place »

    private func media(scale: Double = 1, rotation: Double = 0,
                       volume: Float = 1, kind: StoryMediaKind = .video,
                       debut: Double? = nil, duree: Double? = nil) -> StoryMediaObject {
        StoryMediaObject(id: "m", postMediaId: "pm", kind: kind,
                         aspectRatio: 16.0 / 9.0, scale: scale, rotation: rotation,
                         volume: volume, startTime: debut, duration: duree)
    }

    private func sticker(scale: Double = 2.2, rotation: Double = 0) -> StorySticker {
        StorySticker(emoji: "🎬", x: 0.5, y: 0.5, scale: scale, rotation: rotation)
    }

    private func libelles(_ jetons: [ComposerObjectChips.Chip]) -> [String] { jetons.map(\.label) }

    /// **La taille ne manque JAMAIS, quel que soit le kind.** C'est ce qui
    /// garantit qu'un objet sélectionné a toujours au moins un jeton : une
    /// rangée vide ne dirait pas « rien à régler », elle aurait l'air cassée.
    func test_chaqueKind_porteAuMoinsSonJetonDeTaille() {
        for jetons in [ComposerObjectChips.chips(for: texte(), locale: Locale(identifier: "fr_FR")),
                       ComposerObjectChips.chips(for: media(), locale: Locale(identifier: "fr_FR")),
                       ComposerObjectChips.chips(for: sticker(), locale: Locale(identifier: "fr_FR"))] {
            XCTAssertTrue(jetons.contains { $0.id == "size" }, "\(libelles(jetons))")
        }
    }

    /// **Et l'espace avant le « % » n'est PAS une espace ordinaire.**
    ///
    /// Ce témoin a d'abord été écrit `== "TAILLE 140 %"` et il est tombé sur
    /// deux chaînes visuellement identiques : le français veut une **espace
    /// fine insécable** (U+202F), que `LocalizedNumber.percent` pose et qu'un
    /// littéral tapé au clavier n'a pas. L'échec était la preuve que le
    /// formatage localisé fait son travail — comparer à un littéral l'aurait
    /// gardé vert en le contournant.
    func test_lEchelleDunMedia_seLitEnPourcentage() {
        let libelle = ComposerObjectChips.chips(for: media(scale: 1.4),
                                                locale: Locale(identifier: "fr_FR"))
            .first { $0.id == "size" }?.label ?? ""

        XCTAssertTrue(libelle.hasPrefix("TAILLE 140"), libelle)
        XCTAssertTrue(libelle.hasSuffix("%"), libelle)
        XCTAssertFalse(libelle.contains("140 %"),
                       "l'espace avant le % est celle de la LOCALE, jamais la nôtre — \(libelle)")
    }

    /// **Un objet DROIT n'annonce pas sa rotation.** « ROTATION 0° »
    /// occuperait la place pour dire une absence (loi 8).
    func test_unObjetDroit_nAnnoncePasSaRotation() {
        XCTAssertFalse(ComposerObjectChips.chips(for: media(rotation: 0))
            .contains { $0.id == "rotation" })
        XCTAssertTrue(ComposerObjectChips.chips(for: media(rotation: 12))
            .contains { $0.id == "rotation" })
    }

    /// **Le SON ne se dit que s'il existe ET qu'il a été touché.** Une image n'a
    /// pas de son du tout, et une vidéo au volume nominal n'a rien à annoncer :
    /// « SON 100 % » sur une photo enseignerait moins que rien.
    func test_leSon_neSeDitQueSurUneVideoDontLeVolumeAChange() {
        XCTAssertTrue(ComposerObjectChips.chips(for: media(volume: 0.6, kind: .video))
            .contains { $0.id == "volume" })
        XCTAssertFalse(ComposerObjectChips.chips(for: media(volume: 1, kind: .video))
            .contains { $0.id == "volume" })
        XCTAssertFalse(ComposerObjectChips.chips(for: media(volume: 0.6, kind: .image))
            .contains { $0.id == "volume" },
                       "une image n'a pas de son — le champ existe, la chose non")
    }

    /// La fenêtre de temps se lit à l'identique sur les trois kinds : c'est la
    /// MÊME question, donc le même jeton, à la même place.
    func test_laFenetreDeTemps_estLaMEMEsurLesTroisKinds() {
        let attendu = "0:00 → 0:06"
        XCTAssertEqual(
            ComposerObjectChips.chips(for: texte(debut: 0, duree: 6),
                                      locale: Locale(identifier: "fr_FR")).last?.label, attendu)
        XCTAssertEqual(
            ComposerObjectChips.chips(for: media(debut: 0, duree: 6),
                                      locale: Locale(identifier: "fr_FR")).last?.label, attendu)
    }

    /// **Le TEMPS est toujours en dernier, l'apparence toujours devant.** Un
    /// jeton qui apparaît ne doit pas déplacer ses voisins sous le doigt, et
    /// c'est vrai d'un kind à l'autre : passer d'un texte à un média ne doit pas
    /// réorganiser la rangée.
    func test_leTemps_estToujoursEnDernier() {
        let m = ComposerObjectChips.chips(for: media(scale: 1.4, rotation: 12,
                                                     volume: 0.5, debut: 0, duree: 6)).map(\.id)
        XCTAssertEqual(m, ["size", "rotation", "volume", "window"])

        let s = ComposerObjectChips.chips(for: sticker(scale: 2.2, rotation: 8)).map(\.id)
        XCTAssertEqual(s, ["size", "rotation"])
    }

    /// **Le fusible des trois kinds.** Une règle qui rendrait toujours la même
    /// liste passerait les témoins d'ordre ci-dessus sans distinguer quoi que
    /// ce soit — or c'est exactement ce que la planche demande : « il change de
    /// CONTENU selon le kind, jamais de place ».
    func test_lesTroisKinds_neDisentPasLaMemeChose() {
        let t = Set(ComposerObjectChips.chips(for: texte(style: "neon", align: "center")).map(\.id))
        let m = Set(ComposerObjectChips.chips(for: media(volume: 0.5)).map(\.id))
        XCTAssertNotEqual(t, m)
        XCTAssertTrue(t.contains("style"), "le style est propre au TEXTE")
        XCTAssertTrue(m.contains("volume"), "le son est propre au MÉDIA")
        XCTAssertEqual(t.intersection(m), ["size"], "seule la taille leur est commune")
    }

    // MARK: - Quand la rangée PARAÎT

    /// **Le défaut mesuré à l'écran, et que trois témoins de règle verts
    /// n'avaient pas vu.**
    ///
    /// Le premier câblage demandait `toolOptions == nil`. L'hôte passe ce
    /// panneau INCONDITIONNELLEMENT — il se vide lui-même quand aucun outil
    /// n'est ouvert, et c'est ainsi qu'il tient la loi 4. La condition était
    /// donc TOUJOURS fausse, et la rangée n'a jamais pu paraître : quinze
    /// témoins verts sur ce qu'elle DIT, aucun sur le fait qu'elle EXISTE.
    ///
    /// > **Une vue qui existe toujours ne peut pas servir de témoin à « un
    /// > outil est ouvert ».** La question se pose à ce qui la SAIT — le mode
    /// > du rail — et la règle est écrite pour être éprouvable sans monter
    /// > quoi que ce soit.
    func test_laRangee_paraitQuandUnObjetEstSelectionne() {
        XCTAssertTrue(ComposerObjectChips.isServed(
            toolIsOpen: false, chips: chips(pour: texte())))
    }

    /// Un outil ouvert lui prend la place — les empiler ferait remonter la
    /// scène de cinquante points sous le doigt.
    func test_unOutilOuvert_luiPrendLaPlace() {
        XCTAssertFalse(ComposerObjectChips.isServed(
            toolIsOpen: true, chips: chips(pour: texte())))
    }

    /// **Le fusible.** Une règle qui rendrait toujours `true` peindrait un
    /// cadre vide dès qu'aucun objet n'est sélectionné — ce qui n'aurait pas
    /// l'air sobre, mais cassé.
    func test_sansAucunJeton_aucuneRangee() {
        XCTAssertFalse(ComposerObjectChips.isServed(toolIsOpen: false, chips: []))
    }

    // MARK: - Ce qu'un jeton OUVRE — la moitié qui n'existait pas

    /// **Le contrat portait `activeChipId` et `onSelect`, et AUCUN hôte ne les
    /// remplissait.** La rangée peignait donc six capsules dont chacune
    /// s'annonçait `.isButton` à VoiceOver, dont aucune n'avait le moindre
    /// effet, et dont aucune ne pouvait jamais paraître active.
    ///
    /// C'est la loi 4 dans sa forme la plus coûteuse : le contrôle n'est pas
    /// absent, il est INERTE — et il PROMET par son cadre, son retour haptique
    /// et son trait d'accessibilité. Trouvé en cherchant, sur la surface de
    /// scène, le motif que `PostCard` avait déjà rendu au cycle 123 : une zone
    /// cliquable dont le clic ne change rien.
    ///
    /// > **Suivre une donnée jusqu'à son consommateur s'arrête un cran trop
    /// > tôt : la suivre jusqu'au PIXEL.** Le témoin qui l'attrape n'interroge
    /// > ni le libellé ni la présence — il demande ce que le doigt OBTIENT.
    ///
    /// La réponse tient en une phrase : **un jeton mène là où sa valeur se
    /// CHANGE**, et une valeur qui ne se change nulle part ne mène nulle part.
    func test_laFenetreDeTemps_meneAuRognage() {
        let jetons = ComposerObjectChips.chips(for: media(duree: 6),
                                               locale: Locale(identifier: "fr_FR"),
                                               openableBands: [.timeline])
        XCTAssertEqual(jetons.first { $0.id == "window" }?.destination, .timeline,
                       "une fenêtre de temps se règle à la timeline — \(libelles(jetons))")
    }

    /// **Une destination NON SERVIE n'est pas proposée**, et c'est ce qui
    /// distingue ce câblage d'une promesse. `ComposerSceneBand.opened` refuse
    /// déjà d'ouvrir une bande absente du jeu servi : attacher la destination
    /// sans regarder ce jeu aurait fabriqué un jeton qui s'illumine, vibre, et
    /// n'ouvre rien — exactement le défaut qu'on répare.
    func test_uneDestinationNonServie_nEstPasProposee() {
        let jetons = ComposerObjectChips.chips(for: media(duree: 6),
                                               locale: Locale(identifier: "fr_FR"),
                                               openableBands: [])
        XCTAssertNil(jetons.first { $0.id == "window" }?.destination,
                     "aucune bande ouvrable ⇒ aucun jeton actionnable")
    }

    /// **Le style mène aux dix-huit styles** — la bande n'a pas encore d'hôte
    /// (#4083), donc elle n'est pas servie aujourd'hui. La règle la nomme quand
    /// même : le jour où la bande arrive, le jeton devient actionnable sans
    /// qu'aucune ligne ne change ici. C'est le jeu SERVI qui décide, pas une
    /// liste écrite à la main.
    func test_leStyle_meneAuxDixHuitStyles() {
        let jetons = ComposerObjectChips.chips(for: texte(style: "neon"),
                                               locale: Locale(identifier: "fr_FR"),
                                               openableBands: [.textStyles])
        XCTAssertEqual(jetons.first { $0.id == "style" }?.destination, .textStyles)
    }

    /// **Une valeur qui ne se change NULLE PART ne ment pas sur son pouvoir.**
    /// La taille, l'alignement, la rotation et le volume n'ont aujourd'hui
    /// aucune bande — les annoncer cliquables serait la même promesse creuse un
    /// cran plus bas.
    func test_unJetonSansDestination_neSePresentePasCommeUnBouton() {
        let jetons = ComposerObjectChips.chips(for: texte(style: "neon", align: "center"),
                                               locale: Locale(identifier: "fr_FR"),
                                               openableBands: Set(ComposerSceneBand.allCases))
        for sansPorte in ["size", "align"] {
            XCTAssertNil(jetons.first { $0.id == sansPorte }?.destination,
                         "\(sansPorte) ne se règle dans aucune bande")
        }
    }

    /// **Le jeton ACTIF est celui de la bande OUVERTE** — la planche l'encadre,
    /// et c'est la seule chose que VoiceOver ne peut pas lire dans le libellé.
    ///
    /// Cet état est OBSERVABLE parce que la destination est une BANDE et non un
    /// outil du rail : `isServed` cache la rangée dès qu'un outil s'ouvre, donc
    /// un jeton qui mènerait à un outil ne pourrait jamais se montrer actif. Le
    /// choix de destination n'est pas un rangement — c'est ce qui rend l'état
    /// atteignable.
    func test_leJetonActif_estCeluiDeLaBandeOuverte() {
        let jetons = ComposerObjectChips.chips(for: media(duree: 6),
                                               locale: Locale(identifier: "fr_FR"),
                                               openableBands: [.timeline])
        XCTAssertEqual(ComposerObjectChips.activeChipId(chips: jetons, openedBand: .timeline),
                       "window")
    }

    func test_aucuneBandeOuverte_aucunJetonActif() {
        let jetons = ComposerObjectChips.chips(for: media(duree: 6),
                                               locale: Locale(identifier: "fr_FR"),
                                               openableBands: [.timeline])
        XCTAssertNil(ComposerObjectChips.activeChipId(chips: jetons, openedBand: nil))
    }

    /// **Une bande ouverte par AUTRE CHOSE n'allume aucun jeton.** La palette
    /// de fond s'ouvre depuis la rangée d'outils basse et ne règle aucun objet ;
    /// encadrer un jeton parce qu'une bande est ouverte, sans regarder LAQUELLE,
    /// aurait fait clignoter la taille chaque fois qu'on choisit une couleur.
    func test_uneBandeSansJeton_nEnAllumeAucun() {
        let jetons = ComposerObjectChips.chips(for: media(duree: 6),
                                               locale: Locale(identifier: "fr_FR"),
                                               openableBands: [.timeline])
        XCTAssertNil(ComposerObjectChips.activeChipId(chips: jetons, openedBand: .palette))
    }

    /// **Taper le jeton actif REFERME sa bande.** Sans cette bascule, l'auteur
    /// n'a aucun geste pour ranger ce qu'il vient d'ouvrir depuis le même
    /// endroit — il doit aller chercher une autre sortie, ce qui fait de
    /// l'ouverture un aller simple.
    func test_taperLeJetonActif_refermeSaBande() {
        let jetons = ComposerObjectChips.chips(for: media(duree: 6),
                                               locale: Locale(identifier: "fr_FR"),
                                               openableBands: [.timeline])
        XCTAssertEqual(ComposerObjectChips.toggled("window", in: jetons, opened: nil), .timeline)
        XCTAssertNil(ComposerObjectChips.toggled("window", in: jetons, opened: .timeline))
    }

    /// **Un jeton sans destination laisse la bande EXACTEMENT où elle est.** Il
    /// ne la referme pas : taper « TAILLE 140 % » pendant qu'on rogne fermerait
    /// le rognage sans rien ouvrir, ce qui se lit comme une panne.
    func test_unJetonSansDestination_neTouchePasALaBandeOuverte() {
        let jetons = ComposerObjectChips.chips(for: media(duree: 6),
                                               locale: Locale(identifier: "fr_FR"),
                                               openableBands: [.timeline])
        XCTAssertEqual(ComposerObjectChips.toggled("size", in: jetons, opened: .timeline), .timeline)
    }
}
