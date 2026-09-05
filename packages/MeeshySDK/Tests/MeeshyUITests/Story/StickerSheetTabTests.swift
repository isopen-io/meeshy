import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **Les cinq onglets de la feuille de stickers** (directive porteur
/// 2026-09-05).
///
/// Ce que ces témoins gardent n'est pas la mise en page : c'est
/// l'ATTEIGNABILITÉ. Le passage d'un interrupteur à deux positions à cinq
/// onglets redistribue vingt-deux familles, et une famille oubliée ne casse
/// rien — elle DISPARAÎT. Une disparition n'a aucun site où rougir.
@MainActor
final class StickerSheetTabTests: XCTestCase {

    /// Le jeu servi le plus large — tous les magasins injectés.
    private var toutesServies: [StickerPaletteTab] {
        StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: true)
    }

    // MARK: - L'atteignabilité

    /// **LE témoin du lot.** Toute famille servie appartient à au moins un
    /// onglet — sans quoi elle est peinte nulle part, et rien ne le dit.
    func test_aucuneFamilleServie_neDevientInatteignable() {
        XCTAssertEqual(StickerSheetTab.unreachable(among: toutesServies), [],
                       "ces familles n'appartiennent à aucun onglet : elles ont disparu de la feuille")
    }

    /// …et la garde tient aussi quand les magasins ne sont PAS injectés, où le
    /// jeu servi est plus court. Une règle qui ne serait juste que sur le cas
    /// nominal laisserait un trou sur le cas le plus fréquent — un simulateur
    /// neuf, sans autorisation de position.
    func test_aucuneFamille_neDevientInatteignable_sansMagasins() {
        let maigre = StickerPaletteTab.offered(hasLibrary: false, hasNearbyPlaces: false)
        XCTAssertEqual(StickerSheetTab.unreachable(among: maigre), [])
    }

    /// **Aucune famille n'est servie DEUX fois.** Un doublon ne se voit pas sur
    /// un écran — on croit avoir changé d'onglet — et il double le contenu
    /// d'une feuille dont tout l'objet est de le raccourcir.
    func test_aucuneFamille_nAppartientADeuxOnglets() {
        var vues: [StickerPaletteTab: Int] = [:]
        for onglet in StickerSheetTab.allCases {
            for famille in StickerSheetTab.sections(of: onglet, offered: toutesServies) {
                vues[famille, default: 0] += 1
            }
        }
        XCTAssertEqual(vues.filter { $0.value > 1 }.keys.map(\.rawValue).sorted(), [])
    }

    // MARK: - Ce que chaque onglet contient

    /// **DYNAMIQUE porte les quatre familles à donnée VIVANTE, et elles
    /// seules.** C'est la définition de l'onglet : leur contenu n'existe pas
    /// avant l'ouverture — il vient de l'horloge, du GPS, du service météo ou
    /// du clavier.
    func test_dynamique_porteLesQuatreFamillesVivantes() {
        XCTAssertEqual(StickerSheetTab.sections(of: .dynamic, offered: toutesServies),
                       [.text, .place, .time, .weather])
    }

    /// **Le LIEU reste servi SANS fournisseur de position** (directive porteur
    /// 2026-09-05).
    ///
    /// Ce témoin affirmait l'inverse jusqu'à ce jour, au nom de la loi 4 — « un
    /// outil qu'on ne peut pas servir est absent, jamais grisé ». Le motif est
    /// juste et ne s'appliquait pas : **les dix styles de lieu n'ont pas besoin
    /// du GPS**, seule la DONNÉE en a besoin. Autorisation refusée, et le
    /// catalogue entier — dessinateurs et traductions compris — disparaissait.
    ///
    /// > « On ne peut pas servir » et « on n'a pas encore de quoi remplir » sont
    /// > deux états, et un seul justifie une absence. Le second se DIT : la
    /// > section montre ses styles, désactivés, sous la phrase qui nomme ce
    /// > qui manque. C'est ce que l'onglet TEXTE fait depuis toujours.
    ///
    /// Le témoin est conservé plutôt que supprimé, et retourné : c'est lui qui
    /// empêchera qu'on rétablisse le gate au nom de la même loi mal appliquée.
    func test_dynamique_gardeLeLieu_memeSansFournisseurDePosition() {
        let sansLieu = StickerPaletteTab.offered(hasLibrary: true, hasNearbyPlaces: false)
        XCTAssertTrue(StickerSheetTab.sections(of: .dynamic, offered: sansLieu).contains(.place),
                      "les dix styles de lieu ne dépendent pas du GPS — seule leur donnée en dépend")
        XCTAssertTrue(StickerSheetTab.sections(of: .dynamic, offered: sansLieu).contains(.text))
    }

    /// **Une entrée de « Mes stickers » est une TROISIÈME nature.**
    ///
    /// Ni un emoji ni un gabarit : son dessin vit sur le disque de l'auteur,
    /// pas au catalogue. La confondre avec un `template` aurait fait chercher
    /// son identifiant dans `StickerTemplateCatalog`, qui ne le connaît pas —
    /// et l'entrée aurait disparu des favoris sans un mot.
    func test_uneEntreeDeBibliotheque_neSeResoutPasAuCatalogue() {
        let entree = StickerUsageEntry(kind: .library, value: "abc123")
        XCTAssertNil(StickerPickerView.template(for: entree))
    }

    func test_smileys_nePorteQueLEmoji() {
        XCTAssertEqual(StickerSheetTab.sections(of: .smileys, offered: toutesServies), [.emoji])
    }

    /// RECHERCHE atteint tout le reste — c'est ce qui rend le témoin
    /// d'atteignabilité satisfiable, et c'est aussi ce qui fait de cet onglet
    /// le seul indispensable.
    func test_recherche_porteLesCataloguesFiges_etMesStickers() {
        let trouvees = StickerSheetTab.sections(of: .search, offered: toutesServies)
        XCTAssertTrue(trouvees.contains(.library))
        XCTAssertTrue(trouvees.contains(.love))
        XCTAssertFalse(trouvees.contains(.emoji), "les smileys ont leur onglet")
        XCTAssertFalse(trouvees.contains(.place), "le lieu est une donnée VIVANTE")
    }

    /// **FAVORIS et RÉCENTS ne portent AUCUNE famille de catalogue**, et c'est
    /// écrit plutôt que subi : leur contenu vient de ce que l'auteur a fait,
    /// pas d'une liste. Ce témoin est ce qui empêche un futur lot de leur
    /// greffer le catalogue « en attendant ».
    func test_favorisEtRecents_neSontPasDesCatalogues() {
        XCTAssertEqual(StickerSheetTab.sections(of: .favorites, offered: toutesServies), [])
        XCTAssertEqual(StickerSheetTab.sections(of: .recents, offered: toutesServies), [])
    }

    // MARK: - Le filtre de recherche

    /// Une requête VIDE laisse tout passer : le champ FILTRE, il ne sélectionne
    /// pas. Sans ce cas, ouvrir l'onglet montrerait une feuille vide.
    func test_uneRequeteVide_laissePasserTout() {
        for famille in toutesServies {
            XCTAssertTrue(StickerPickerView.section(famille, matches: ""))
            XCTAssertTrue(StickerPickerView.section(famille, matches: "   "))
        }
    }

    /// **Insensible à la casse ET aux diacritiques.** « fete » doit trouver
    /// « Fête » : un champ qui punit l'auteur qui tape vite n'est pas un
    /// raccourci.
    ///
    /// > **La requête est DÉRIVÉE du titre servi, jamais écrite en dur.**
    /// > Première version : `matches: "fete"` contre `.party`. Elle est tombée
    /// > — le bundle de tests tourne en ANGLAIS, où le titre est « Party », et
    /// > aucun « fete » n'y est. Un témoin qui épingle un libellé LOCALISÉ
    /// > n'éprouve pas la règle, il éprouve la locale de la machine qui
    /// > l'exécute. Dériver la requête du titre rend la PROPRIÉTÉ vérifiable
    /// > dans les sept langues du catalogue, y compris celles où le mot n'a
    /// > aucun accent — le témoin y devient trivialement vrai, ce qui est
    /// > exact plutôt que faux.
    func test_leFiltre_ignoreLaCasseEtLesAccents() {
        let titre = StickerPickerView.tabTitle(.party)
        XCTAssertTrue(StickerPickerView.section(.party, matches: titre.lowercased()),
                      "la casse ne doit pas décider")
        let sansAccent = titre.folding(options: .diacriticInsensitive, locale: nil)
        XCTAssertTrue(StickerPickerView.section(.party, matches: sansAccent),
                      "« \(sansAccent) » doit trouver « \(titre) »")
        XCTAssertFalse(StickerPickerView.section(.party, matches: "zzqx"),
                       "une requête absente ne doit RIEN laisser passer")
    }
}

/// **Le magasin des favoris et des récents.**
@MainActor
final class StickerUsageStoreTests: XCTestCase {

    /// Un domaine JETABLE par test. Lire `.standard` écrirait dans les
    /// préférences de l'app hôte et rendrait deux suites dépendantes de leur
    /// ordre — le piège que la grappe des tests nomme « domaine de l'app hôte ».
    private func makeSUT() -> StickerUsageStore {
        let domaine = "test.\(UUID().uuidString)"
        return StickerUsageStore(defaults: UserDefaults(suiteName: domaine)!)
    }

    func test_poser_metLaDecorationEnTeteDesRecents() {
        let sut = makeSUT()
        sut.noteUse(.emoji("🎬"))
        sut.noteUse(.emoji("🔥"))
        XCTAssertEqual(sut.recents.map(\.value), ["🔥", "🎬"])
    }

    /// **Reposer ne DUPLIQUE pas, ça REMONTE.** Sans cette règle, la liste se
    /// remplirait du même sticker et perdrait exactement ce qu'elle donne : la
    /// variété de ce qu'on a fait.
    func test_reposerUneDecoration_laRemonteSansLaDupliquer() {
        let sut = makeSUT()
        sut.noteUse(.emoji("🎬"))
        sut.noteUse(.emoji("🔥"))
        sut.noteUse(.emoji("🎬"))
        XCTAssertEqual(sut.recents.map(\.value), ["🎬", "🔥"])
    }

    /// **Les récents sont BORNÉS.** Au-delà, retrouver quelque chose y coûte
    /// autant que dans le catalogue : la liste cesse d'être un raccourci.
    /// Cinquante depuis le 2026-09-05 (directive porteur). Le témoin ne cite
    /// PAS le nombre : il interroge la constante, donc il survit au prochain
    /// arbitrage sans mentir entre-temps. Ce qu'il garde est la BORNE, pas sa
    /// valeur.
    func test_lesRecents_sontBornes() {
        let sut = makeSUT()
        for i in 0...(StickerUsageStore.recentsLimit + 10) {
            sut.noteUse(.emoji("e\(i)"))
        }
        XCTAssertEqual(sut.recents.count, StickerUsageStore.recentsLimit)
        XCTAssertEqual(sut.recents.first?.value, "e\(StickerUsageStore.recentsLimit + 10)",
                       "la plus récente reste en tête")
    }

    /// **Les FAVORIS ne le sont pas**, et c'est une distinction, pas un oubli :
    /// ils sont posés à la main, donc déjà bornés par l'intention de l'auteur.
    /// En refuser un serait refuser une intention explicite.
    func test_lesFavoris_neSontPasBornes() {
        let sut = makeSUT()
        for i in 0...(StickerUsageStore.recentsLimit + 5) {
            sut.toggleFavorite(.emoji("f\(i)"))
        }
        XCTAssertGreaterThan(sut.favorites.count, StickerUsageStore.recentsLimit)
    }

    func test_epinglerPuisDepingler_rendLaListeAuMemeEtat() {
        let sut = makeSUT()
        XCTAssertFalse(sut.isFavorite(.emoji("⭐️")))
        sut.toggleFavorite(.emoji("⭐️"))
        XCTAssertTrue(sut.isFavorite(.emoji("⭐️")))
        sut.toggleFavorite(.emoji("⭐️"))
        XCTAssertFalse(sut.isFavorite(.emoji("⭐️")))
        XCTAssertEqual(sut.favorites, [])
    }

    /// **Le nouvel épinglé passe en TÊTE.** Le chercher en bas d'une liste
    /// qu'on vient d'allonger serait le contraire d'un raccourci.
    func test_unNouvelEpingle_passeEnTete() {
        let sut = makeSUT()
        sut.toggleFavorite(.emoji("🎬"))
        sut.toggleFavorite(.emoji("🔥"))
        XCTAssertEqual(sut.favorites.map(\.value), ["🔥", "🎬"])
    }

    /// **Ce qui est retenu SURVIT à la fermeture.** Le témoin monte un SECOND
    /// magasin sur le même domaine : c'est la seule façon d'éprouver la
    /// persistance sans se fier à l'instance qui vient d'écrire.
    func test_lesFavoris_survivent_aUneNouvelleInstance() {
        let domaine = "test.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: domaine)!
        let premier = StickerUsageStore(defaults: defaults)
        premier.toggleFavorite(.emoji("⭐️"))
        premier.noteUse(.emoji("🎬"))

        let second = StickerUsageStore(defaults: defaults)
        XCTAssertEqual(second.favorites.map(\.value), ["⭐️"])
        XCTAssertEqual(second.recents.map(\.value), ["🎬"])
    }

    /// **Des préférences corrompues coûtent des favoris, jamais un écran.**
    /// Une lecture qui échoue rend `[]` — la feuille s'ouvre vide plutôt que
    /// de ne pas s'ouvrir.
    func test_desPreferencesIllisibles_rendentUneListeVide() {
        let domaine = "test.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: domaine)!
        defaults.set(Data([0x00, 0x01, 0x02]), forKey: "meeshy.sticker.favorites")
        XCTAssertEqual(StickerUsageStore(defaults: defaults).favorites, [])
    }
}
