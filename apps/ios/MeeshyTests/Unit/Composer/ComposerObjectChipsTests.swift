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

    // MARK: - Assertions indépendantes de la LOCALE (#4559)
    //
    // Les libellés de la rangée sont passés au catalogue : leur texte dépend
    // désormais de la langue de l'hôte de test, qui est `en-US` en intégration
    // continue et pas nécessairement chez le développeur. Comparer à « TAILLE
    // 38 » ne mesurerait plus la règle, mais la langue du simulateur.
    //
    // Ce que ces témoins vérifient reste ce qu'ils vérifiaient : que la valeur
    // COURANTE de l'objet arrive dans le libellé, et qu'aucun spécificateur ne
    // survit — la signature d'un type de placeholder qui ne correspond pas à
    // l'argument (`InterpolatedLocalizationSubstitutionTests` en fait la
    // doctrine). Les MOTS français de la planche, eux, sont épinglés à leur
    // source par `test_lesMotsDeLaPlanche_sontCeuxDuCatalogue`.

    private func assertNoSurvivingSpecifier(
        _ produced: String, file: StaticString = #filePath, line: UInt = #line
    ) {
        for specifier in ["%@", "%lld", "%1$", "%2$", "%3$"] {
            XCTAssertFalse(
                produced.contains(specifier),
                "« \(specifier) » survit dans « \(produced) » : le type du placeholder au " +
                "catalogue ne correspond pas à l'argument passé au site d'appel.",
                file: file, line: line
            )
        }
    }

    private func assertBadge(
        _ produced: String?, kind: String, plane: String, rank: String,
        file: StaticString = #filePath, line: UInt = #line
    ) {
        guard let produced else {
            return XCTFail("le badge est absent", file: file, line: line)
        }
        XCTAssertTrue(produced.contains(kind), "kind absent — \(produced)", file: file, line: line)
        XCTAssertTrue(produced.contains(plane), "plan absent — \(produced)", file: file, line: line)
        XCTAssertTrue(produced.contains(rank), "rang absent — \(produced)", file: file, line: line)
        assertNoSurvivingSpecifier(produced, file: file, line: line)
    }

    func test_laTaille_seLitSansOuvrirQuoiQueCeSoit() {
        let jetons = chips(pour: texte(taille: 38))
        let taille = jetons.first { $0.id == "size" }?.label ?? ""
        XCTAssertTrue(taille.contains("38"),
                      "le jeton porte la valeur courante — \(jetons.map(\.label))")
        assertNoSurvivingSpecifier(taille)
    }

    /// **Un style ABSENT ne fabrique pas un jeton « aucun ».** Loi 8 : le jeton
    /// paraît quand il a quelque chose à dire. « STYLE · — » enseignerait moins
    /// que rien : il occuperait la place en affirmant une valeur qui n'existe pas.
    func test_unStyleAbsent_neFabriquePasDeJeton() {
        let jetons = chips(pour: texte(style: nil))
        XCTAssertFalse(jetons.contains { $0.id == "style" })
    }

    func test_unStylePose_seNommeEnMajuscules() {
        let jetons = chips(pour: texte(style: "neon"))
        let style = jetons.first { $0.id == "style" }?.label ?? ""
        XCTAssertTrue(style.contains(ComposerObjectChipsCopy.styleName("neon")),
                      "la planche écrit « STYLE · NÉON » — \(jetons.map(\.label))")
        assertNoSurvivingSpecifier(style)
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
        let align = jetons.first { $0.id == "align" }?.label ?? ""
        XCTAssertTrue(align.contains(ComposerObjectChipsCopy.alignName("center")),
                      "\(jetons.map(\.label))")
        assertNoSurvivingSpecifier(align)
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

        XCTAssertTrue(libelle.contains("140"), libelle)
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
    /// et son trait d'accessibilité.
    ///
    /// > **Suivre une donnée jusqu'à son consommateur s'arrête un cran trop
    /// > tôt : la suivre jusqu'au PIXEL.** Le témoin qui l'attrape n'interroge
    /// > ni le libellé ni la présence — il demande ce que le doigt OBTIENT.
    ///
    /// **Ce que le doigt obtient a changé de place le 2026-09-05** : un jeton
    /// ouvrait une BANDE sous la scène, il ouvre désormais l'éditeur plein
    /// écran sur la SECTION où la valeur se change. La première vue n'édite
    /// plus (`ComposerFirstView`) ; la réponse, elle, ne bouge pas — **un
    /// jeton mène là où sa valeur se CHANGE**.
    func test_laFenetreDeTemps_meneAuTempsDeLObjet() {
        let jetons = ComposerObjectChips.chips(for: media(duree: 6),
                                               locale: Locale(identifier: "fr_FR"))
        XCTAssertEqual(jetons.first { $0.id == "window" }?.destination, .timing,
                       "une fenêtre de temps se règle au TEMPS — \(libelles(jetons))")
    }

    /// **Le style mène à la POLICE de l'éditeur**, section `.tool(.style)` — la
    /// grille des dix-huit, à l'endroit unique où elle vit désormais.
    func test_leStyle_meneAuxDixHuitStyles() {
        let jetons = ComposerObjectChips.chips(for: texte(style: "neon"),
                                               locale: Locale(identifier: "fr_FR"))
        XCTAssertEqual(jetons.first { $0.id == "style" }?.destination, .tool(.style))
    }

    /// **La TAILLE mène à la police, l'ALIGNEMENT à l'alignement.**
    ///
    /// Les deux n'avaient AUCUNE destination tant que les destinations étaient
    /// des bandes : ni la taille ni l'alignement n'avait de bande, donc les
    /// deux jetons étaient des lectures muettes. L'éditeur les sert tous les
    /// deux — la taille au curseur du panneau POLICE, l'alignement au sien.
    ///
    /// > Une destination absente peut être une LOI (« ça ne se change nulle
    /// > part ») ou un MANQUE (« ça ne se change pas ICI »). Les deux se
    /// > lisaient `nil`. Changer de destination a séparé les deux cas, et il
    /// > n'en restait aucun du premier genre.
    func test_laTailleEtLAlignement_menentAuxOutilsQuiLesReglent() {
        let jetons = ComposerObjectChips.chips(for: texte(style: "neon", align: "center"),
                                               locale: Locale(identifier: "fr_FR"))
        XCTAssertEqual(jetons.first { $0.id == "size" }?.destination, .tool(.style))
        XCTAssertEqual(jetons.first { $0.id == "align" }?.destination, .tool(.align))
    }

    /// **Une destination que la FAMILLE ne sert pas n'est pas proposée.**
    ///
    /// C'est la même loi qu'avant, posée sur la question qui a remplacé
    /// l'ancienne : ce n'est plus « cette bande est-elle ouvrable ? » mais
    /// « cette famille règle-t-elle cela ? ». Un sticker n'a aucun panneau
    /// d'options dans l'éditeur ; ses jetons de taille et de rotation ne
    /// mènent donc nulle part, et la vue ne les annonce pas comme des boutons.
    func test_uneDestinationQueLaFamilleNeSertPas_nEstPasProposee() {
        let jetons = ComposerObjectChips.chips(for: sticker(scale: 1.4, rotation: 0.3),
                                               locale: Locale(identifier: "fr_FR"))
        for sansPorte in ["size", "rotation"] {
            XCTAssertNil(jetons.first { $0.id == sansPorte }?.destination,
                         "\(sansPorte) ne se règle nulle part pour un sticker")
        }
    }

    /// **Toute destination servie EXISTE dans l'éditeur pour sa famille.**
    ///
    /// Le témoin structurel du lot : il ne vérifie pas une destination
    /// particulière, il interdit qu'un jeton pointe sur une section que
    /// `ComposerObjectEditorRail.entries(for:)` ne rend pas. Sans lui,
    /// `selection(forFamily:keeping:)` retomberait EN SILENCE sur la première
    /// section servie — un jeton qui ouvre l'écran, mais pas au bon endroit,
    /// et rien pour le dire.
    func test_chaqueDestination_estUneSectionServieParSaFamille() {
        let cas: [(MeeshySceneObject.Kind, [ComposerObjectChips.Chip])] = [
            (.text, ComposerObjectChips.chips(for: texte(style: "neon", align: "center",
                                                         debut: 0, duree: 6))),
            (.media, ComposerObjectChips.chips(for: media(duree: 6))),
            (.sticker, ComposerObjectChips.chips(for: sticker(scale: 1.4, rotation: 0.3)))
        ]
        for (famille, jetons) in cas {
            let servies = ComposerObjectEditorRail.entries(for: famille)
            for jeton in jetons {
                guard let destination = jeton.destination else { continue }
                XCTAssertTrue(
                    servies.contains(destination),
                    "le jeton « \(jeton.id) » d'un \(famille) pointe sur \(destination), "
                        + "que l'éditeur ne sert pas pour cette famille")
            }
        }
    }

    // MARK: - Le badge de l'objet sélectionné

    /// **Le canvas n'avait AUCUNE notion d'objet sélectionné** (#4073).
    ///
    /// La vue `1c` s'appelle « Éditeur de scène — objet sélectionné » et sa
    /// doctrine tient en une phrase : « Trois plans, **un seul objet à la
    /// fois** ». Elle le dessine avec un cadre, quatre poignées et un badge
    /// `TEXT · PLAN FG · z 2`. Rien de tout cela n'existait : l'inspecteur, les
    /// contrôleurs du rail et le menu d'appui long portaient sur un objet que
    /// rien ne désignait à l'écran.
    ///
    /// Le doc-comment de `editOverlayLayer` promettait pourtant « snap guides,
    /// **selection markers** » depuis toujours. Seuls les guides existaient —
    /// un commentaire qui décrit un mécanisme absent ne se fait contredire par
    /// rien, et celui-ci a survécu à toutes les passes parce qu'il énonçait la
    /// bonne intention au bon endroit.
    private func slide(texte t: StoryTextObject? = nil,
                       media m: StoryMediaObject? = nil,
                       sticker s: StorySticker? = nil) -> StorySlide {
        var effets = StoryEffects()
        if let t { effets.textObjects = [t] }
        if let m { effets.mediaObjects = [m] }
        if let s { effets.stickerObjects = [s] }
        var slide = StorySlide(id: "s1")
        slide.effects = effets
        return slide
    }

    func test_leBadge_diCeQueLObjetEST_sonPlanEtSonRang() {
        var t = texte()
        t.zIndex = 2
        let badge = ComposerObjectChips.badge(forSelected: t.id, in: slide(texte: t),
                                              locale: Locale(identifier: "fr_FR"))
        assertBadge(badge, kind: ComposerObjectChipsCopy.kindText,
                    plane: ComposerObjectChipsCopy.planeForeground, rank: "2")
    }

    /// **Un fond le DIT**, et ce n'est pas cosmétique : le fond n'est mouvable
    /// que par sa propre porte (règle produit 2026-07-11). Dire le plan explique
    /// pourquoi le doigt n'obtient pas le même effet sur deux objets d'apparence
    /// semblable.
    func test_unMediaDeFond_annonceSonPlan() {
        let m = StoryMediaObject(id: "bg", postMediaId: "pm", kind: .image,
                                 aspectRatio: 16.0 / 9.0, isBackground: true, zIndex: 0)
        assertBadge(ComposerObjectChips.badge(forSelected: "bg", in: slide(media: m),
                                              locale: Locale(identifier: "fr_FR")),
                    kind: ComposerObjectChipsCopy.kindMedia,
                    plane: ComposerObjectChipsCopy.planeBackground, rank: "0")
    }

    func test_unSticker_porteSonPropreMot() {
        var s = sticker()
        s.zIndex = 5
        assertBadge(ComposerObjectChips.badge(forSelected: s.id, in: slide(sticker: s),
                                              locale: Locale(identifier: "fr_FR")),
                    kind: ComposerObjectChipsCopy.kindSticker,
                    plane: ComposerObjectChipsCopy.planeForeground, rank: "5")
    }

    /// **Le rang se dit dans la LOCALE**, comme tout ce que l'inspecteur montre.
    /// `ar_SA` — jamais `ar` nue, qui emprunte la région de l'appareil — est la
    /// seule locale où les deux écritures divergent ; comparaison `.literal`,
    /// puisque par collation « ٢ » vaut « 2 ».
    func test_leRang_suitLaLocale() {
        var t = texte()
        t.zIndex = 2
        let badge = ComposerObjectChips.badge(forSelected: t.id, in: slide(texte: t),
                                              locale: Locale(identifier: "ar_SA")) ?? ""
        XCTAssertNil(badge.range(of: "z 2", options: .literal),
                     "chiffre latin dans un badge arabe — \(badge)")
    }

    /// **Le fusible.** Un id qui ne désigne plus rien — un objet supprimé
    /// pendant que la sélection tenait encore — n'encadre pas du vide.
    func test_aucuneSelection_aucunBadge() {
        XCTAssertNil(ComposerObjectChips.badge(forSelected: nil, in: slide(texte: texte())))
        XCTAssertNil(ComposerObjectChips.badge(forSelected: "fantome", in: slide(texte: texte())))
    }

    // MARK: - Les MOTS de la planche, épinglés à leur SOURCE (#4559)

    /// **Ce que les témoins ci-dessus ne peuvent plus dire.** Ils vérifient que
    /// la valeur courante arrive dans le libellé, jamais que le libellé DIT ce
    /// que la planche `1c` écrit — comparer à « STYLE · NÉON » mesurerait la
    /// langue du simulateur, pas la règle.
    ///
    /// La doctrine se vérifie donc à la SOURCE, où le français est écrit une
    /// fois et pour toutes : le `defaultValue` de chaque clé est la valeur
    /// `fr` du catalogue (`LocalizationConsistencyTests` le prouve pour les
    /// écrans épinglés), et il est indépendant de toute locale d'exécution.
    ///
    /// Sans ce témoin, traduire aurait fait DISPARAÎTRE la vérification du
    /// vocabulaire : les sept mots de la planche deviendraient de simples
    /// arguments, justes ou faux, et plus rien ne dirait lesquels.
    func test_lesMotsDeLaPlanche_sontCeuxDuCatalogue() throws {
        let copy = try MyStoriesSourceCorpus.text(
            of: "Meeshy/Features/Main/Composer/ComposerObjectChipsCopy.swift")

        for mot in ["STYLE · %@", "TAILLE %@", "ALIGN · %@", "SON %@", "ROTATION %@°",
                    "%1$@ · %2$@ · z %3$@",
                    "NÉON", "GRAS", "MACHINE", "MANUSCRIT", "CLASSIQUE",
                    "GAUCHE", "CENTRÉ", "DROITE",
                    "TEXTE", "MÉDIA", "STICKER", "PLAN FG", "PLAN BG"] {
            XCTAssertTrue(
                copy.contains("defaultValue: \"\(mot)\""),
                "« \(mot) » n'est plus le mot français de la planche `1c`. Le changer est " +
                "une décision de produit : elle se prend dans le catalogue ET ici."
            )
        }
    }

    /// Fusible : le témoin ci-dessus est une suite de `contains` sur un fichier
    /// lu au disque. Sur une lecture vide, il passerait au vert en ne regardant
    /// rien — et la seule chose qu'il protège est justement un vocabulaire que
    /// personne ne relit.
    func test_leTemoinDesMots_litVraimentSaSource() throws {
        XCTAssertGreaterThan(
            try MyStoriesSourceCorpus.text(
                of: "Meeshy/Features/Main/Composer/ComposerObjectChipsCopy.swift").count,
            2_000)
    }

}
