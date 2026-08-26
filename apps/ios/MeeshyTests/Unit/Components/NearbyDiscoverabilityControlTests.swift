import XCTest
@testable import Meeshy
@testable import MeeshySDK
import MeeshyUI

/// Le contrôle « Rendre ce contenu trouvable à proximité » (spec du
/// 2026-08-02 §2), pris par ses deux surfaces vérifiables : les LIBELLÉS qu'il
/// rend, et le fait que sa règle reste celle du modèle.
///
/// Les notices sont l'objet principal de cette suite. Elles ne sont pas de la
/// décoration : la spec exige que « l'utilisateur voit et confirme toujours ;
/// rien n'est appliqué silencieusement ». Un resserrement effectué mais non
/// dit viole cette phrase exactement autant qu'un arrondi muet — et il se
/// perd d'autant plus facilement qu'il ne casse rien.
///
/// La substitution est vérifiée par le même critère que
/// `InterpolatedLocalizationSubstitutionTests` : un `%@` résiduel signe un
/// type de placeholder qui ne correspond pas au catalogue, et personne ne le
/// voit avant la production.
@MainActor
final class NearbyDiscoverabilityControlTests: XCTestCase {

    private func assertNoSpecifierSurvives(
        _ produced: String, _ key: String,
        file: StaticString = #filePath, line: UInt = #line
    ) {
        for specifier in ["%@", "%lld", "%1$", "%2$"] {
            XCTAssertFalse(
                produced.contains(specifier),
                "« \(key) » laisse « \(specifier) » brut — produit : « \(produced) »",
                file: file, line: line
            )
        }
    }

    // MARK: - Libellés de palier

    func test_tierTitle_everyTierHasARealLabel() {
        for tier in DiscoverabilityPrecision.allCases {
            let title = NearbyDiscoverabilityLabels.tierTitle(tier)
            XCTAssertFalse(title.isEmpty, "\(tier.rawValue) sans libellé")
            XCTAssertNotEqual(title, tier.rawValue, "\(tier.rawValue) rend sa valeur brute")
            XCTAssertFalse(title.contains("feed.nearby"), "\(tier.rawValue) rend sa clé brute")
        }
    }

    /// Quatre paliers indiscernables à l'écran rendraient le sélecteur inutile
    /// — l'utilisateur choisirait au hasard un grain de vie privée.
    func test_tierTitle_theFourTiersAreDistinguishable() {
        let titles = Set(DiscoverabilityPrecision.allCases.map(NearbyDiscoverabilityLabels.tierTitle))
        XCTAssertEqual(titles.count, DiscoverabilityPrecision.allCases.count)
    }

    func test_tierIcon_theFourTiersAreDistinguishable() {
        let icons = Set(DiscoverabilityPrecision.allCases.map(NearbyDiscoverabilityLabels.tierIcon))
        XCTAssertEqual(icons.count, DiscoverabilityPrecision.allCases.count)
    }

    // MARK: - Les notices DISENT ce que la règle a fait

    func test_capNotice_namesTheFinestOfferedTier() {
        let notice = NearbyDiscoverabilityLabels.capNotice(finest: .city)

        XCTAssertTrue(
            notice.contains(NearbyDiscoverabilityLabels.tierTitle(.city)),
            "la notice de plafond ne nomme pas le palier — produit : « \(notice) »"
        )
        assertNoSpecifierSurvives(notice, "feed.nearby.precision.capped")
    }

    func test_narrowNotice_namesBothTheAbandonedTierAndTheAppliedOne() {
        let notice = NearbyDiscoverabilityLabels.narrowNotice(from: .exact, to: .city)

        XCTAssertTrue(
            notice.contains(NearbyDiscoverabilityLabels.tierTitle(.exact)),
            "le palier abandonné n'est pas nommé — produit : « \(notice) »"
        )
        XCTAssertTrue(
            notice.contains(NearbyDiscoverabilityLabels.tierTitle(.city)),
            "le palier retenu n'est pas nommé — produit : « \(notice) »"
        )
        assertNoSpecifierSurvives(notice, "feed.nearby.precision.narrowed")
    }

    /// Le témoin exhaustif : tout resserrement que la RÈGLE peut produire a
    /// une phrase qui le nomme. Un palier ajouté plus tard sans son libellé
    /// ferait tomber ce test au lieu d'afficher une notice trouée.
    func test_narrowNotice_coversEveryNarrowingTheRuleCanProduce() {
        for sharing in LocationPrecision.allCases {
            for memorized in DiscoverabilityPrecision.allCases {
                let choice = NearbyDiscoverabilityChoice(memorized: memorized, sharing: sharing)
                guard let abandoned = choice.narrowedFrom else { continue }

                let notice = NearbyDiscoverabilityLabels.narrowNotice(from: abandoned, to: choice.tier)

                XCTAssertTrue(notice.contains(NearbyDiscoverabilityLabels.tierTitle(abandoned)))
                XCTAssertTrue(notice.contains(NearbyDiscoverabilityLabels.tierTitle(choice.tier)))
                assertNoSpecifierSurvives(notice, "feed.nearby.precision.narrowed")
            }
        }
    }

    // MARK: - Textes fixes

    func test_headerTexts_areRealSentences() {
        for (label, text) in [
            ("title", NearbyDiscoverabilityLabels.title),
            ("subtitle", NearbyDiscoverabilityLabels.subtitle),
            ("hint", NearbyDiscoverabilityLabels.hint)
        ] {
            XCTAssertFalse(text.isEmpty, "\(label) vide")
            XCTAssertFalse(text.contains("feed.nearby"), "\(label) rend sa clé brute : « \(text) »")
            assertNoSpecifierSurvives(text, label)
        }
    }

    // MARK: - Le contrôle rend la RÈGLE, il ne la réécrit pas

    /// Ce que le sélecteur affiche est exactement ce que la règle offre. Rendre
    /// `allCases` puis désactiver visuellement les paliers interdits aurait
    /// laissé un chemin vers un libellé plus fin que la coordonnée envoyée.
    func test_control_offersExactlyTheTiersTheRuleAllows() {
        for sharing in LocationPrecision.allCases {
            let choice = NearbyDiscoverabilityChoice(memorized: nil, sharing: sharing)

            XCTAssertEqual(
                choice.offeredTiers,
                DiscoverabilityPrecision.allowedTiers(under: sharing),
                "le sélecteur diverge de la règle sous \(sharing.rawValue)"
            )
        }
    }

    /// Off par défaut, jusque dans ce que la vue reçoit : un palier mémorisé
    /// pré-sélectionne le sélecteur SANS ouvrir l'interrupteur, donc sans
    /// rendre quoi que ce soit trouvable.
    func test_control_startsClosed_evenWithAMemorizedTier() {
        let choice = NearbyDiscoverabilityChoice(memorized: .exact, sharing: .exact)

        XCTAssertFalse(choice.isDiscoverable)
        XCTAssertEqual(choice.tier, .exact)
        XCTAssertNil(choice.precisionToSend)
    }

    // MARK: - Le pont vers la mémoire LOCALE

    /// Les deux grains sont lus au même instant, depuis le même
    /// enregistrement — c'est ce qui permet au grain de PARTAGE de borner ce
    /// que le grain mémorisé revendique.
    func test_choiceFromPreferences_readsBothGrainsFromTheSameRecord() {
        let preferences = LocationSharingPreferences(
            precision: .city,
            mapStyle: .standard,
            lastDiscoverabilityPrecision: .exact
        )

        let choice = FeedNearbyDiscoverability.choice(from: preferences)

        XCTAssertEqual(choice.offeredTiers, [.city, .region])
        XCTAssertEqual(choice.tier, .city, "le palier mémorisé n'a pas été resserré")
        XCTAssertEqual(choice.narrowedFrom, .exact, "le resserrement n'est pas annonçable")
        XCTAssertFalse(choice.isDiscoverable, "la mémoire a ouvert l'interrupteur")
    }

    func test_choiceFromPreferences_withoutMemory_preselectsTheCoarsestTier() {
        let choice = FeedNearbyDiscoverability.choice(from: .defaults)

        XCTAssertEqual(choice.tier, .region)
        XCTAssertNil(choice.narrowedFrom)
        XCTAssertFalse(choice.isDiscoverable)
    }

    func test_remembering_aUsedTier_writesItForTheNextPublication() {
        var choice = NearbyDiscoverabilityChoice(memorized: nil, sharing: .exact)
        choice.setDiscoverable(true)
        choice.select(.neighborhood)

        let updated = FeedNearbyDiscoverability.remembering(choice, in: .defaults)

        XCTAssertEqual(updated.lastDiscoverabilityPrecision, .neighborhood)
    }

    /// Une publication qui n'active rien ne retient rien — et surtout
    /// n'EFFACE pas une mémoire plus ancienne, elle bien utilisée. Écrire
    /// `nil` ici aurait détruit la préférence d'un utilisateur au premier post
    /// publié sans consentement, c'est-à-dire à l'immense majorité d'entre
    /// eux, sans que rien ne le signale.
    func test_remembering_whenNothingWasUsed_leavesTheOlderMemoryIntact() {
        let preferences = LocationSharingPreferences(
            precision: .exact,
            mapStyle: .standard,
            lastDiscoverabilityPrecision: .city
        )
        var choice = FeedNearbyDiscoverability.choice(from: preferences)
        choice.select(.exact)

        let updated = FeedNearbyDiscoverability.remembering(choice, in: preferences)

        XCTAssertEqual(updated.lastDiscoverabilityPrecision, .city)
    }

    /// Le pont ne touche à RIEN d'autre : le grain de partage et le style de
    /// carte sont des réglages voisins, pas les siens.
    func test_remembering_leavesTheNeighbouringSettingsAlone() {
        let preferences = LocationSharingPreferences(precision: .neighborhood, mapStyle: .imagery)
        var choice = FeedNearbyDiscoverability.choice(from: preferences)
        choice.setDiscoverable(true)

        let updated = FeedNearbyDiscoverability.remembering(choice, in: preferences)

        XCTAssertEqual(updated.precision, .neighborhood)
        XCTAssertEqual(updated.mapStyle, .imagery)
    }

    // MARK: - La phrase de rassurance ne doit pas promettre l'AUTRE porte

    /// **Le témoin du constat qui rendait tout le lot mensonger.**
    ///
    /// `discoverabilityPrecision` ne gouverne QUE `Post.geoPoint`. Le lieu
    /// affiché part par `CreatePostRequest.location` et se persiste au grain de
    /// `LocationSharingPreferences.precision` — défaut `.exact`. Une phrase
    /// disant « Meeshy n'enregistre jamais une position plus précise que la
    /// zone choisie » était donc FAUSSE dans la configuration nominale, et
    /// c'était la seule phrase du lot sur laquelle un lecteur fondait sa
    /// décision.
    ///
    /// Le témoin ne peut pas se contenter de lire la phrase corrigée : il doit
    /// interdire qu'elle reparle de ce qu'elle ne gouverne pas. D'où le
    /// contrôle NÉGATIF sur la formulation qui rendrait la promesse à nouveau
    /// universelle, dans la langue source du catalogue.
    ///
    /// **Il lit le CATALOGUE, pas la chaîne résolue.** `String(localized:)`
    /// rend la langue de l'hôte de test — l'anglais sur cette machine et en CI
    /// — et une assertion sur des mots français y échoue au premier passage,
    /// pendant que sa moitié NÉGATIVE passe pour la mauvaise raison : aucune
    /// phrase anglaise ne contient « n'enregistre jamais », donc la garde qui
    /// compte serait morte en silence. La langue source est celle où la
    /// promesse mensongère a été écrite, et c'est celle qu'il faut garder.
    func test_hint_speaksOnlyForTheSearchIndex_notForWhatIsStored() throws {
        let hint = try catalogValue(of: "feed.nearby.consent.hint", locale: "fr")

        XCTAssertTrue(
            hint.lowercased().contains("recherche à proximité"),
            "la phrase doit nommer CE qu'elle gouverne — produit : « \(hint) »"
        )
        XCTAssertFalse(
            hint.lowercased().contains("n'enregistre jamais"),
            "la phrase promet à nouveau une RÉTENTION que le pipeline contredit " +
            "sur la même publication — produit : « \(hint) »"
        )
    }

    /// La valeur d'une clé dans une langue donnée, lue dans
    /// `Localizable.xcstrings`. Même patron que
    /// `BookmarkFeedbackLocalizationTests.catalog()`.
    private func catalogValue(of key: String, locale: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Components
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
        let url = root.appendingPathComponent("Meeshy/Localizable.xcstrings")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        let strings = try XCTUnwrap(
            (object as? [String: Any])?["strings"] as? [String: Any],
            "Localizable.xcstrings doit exposer un objet `strings`"
        )
        let entry = try XCTUnwrap(
            strings[key] as? [String: Any],
            "« \(key) » est absente du catalogue — elle rendrait son `defaultValue` " +
            "français à tous les lecteurs, quelle que soit leur langue."
        )
        let localizations = try XCTUnwrap(
            entry["localizations"] as? [String: Any],
            "« \(key) » ne porte aucune traduction."
        )
        let unit = (localizations[locale] as? [String: Any])?["stringUnit"] as? [String: Any]
        return try XCTUnwrap(
            unit?["value"] as? String,
            "« \(key) » n'a pas de valeur \(locale)."
        )
    }

    /// L'autre porte, dite quand elle est grande ouverte. Sans cette ligne, un
    /// lecteur qui choisit « Région » pour ne pas donner son adresse la donne
    /// quand même, par un réglage qu'il a posé ailleurs et oublié.
    func test_exactBadgeNotice_isOfferedExactlyWhenTheDisplayedPlaceIsExact() {
        XCTAssertTrue(
            NearbyDiscoverabilityChoice(memorized: nil, sharing: .exact).sharedCoordinateIsExact,
            "partage « Exacte » : le badge part au mètre près, il faut le DIRE"
        )
        for sharing in LocationPrecision.allCases where sharing != .exact {
            XCTAssertFalse(
                NearbyDiscoverabilityChoice(memorized: nil, sharing: sharing).sharedCoordinateIsExact,
                "\(sharing.rawValue) dégrade déjà le badge : la mise en garde serait fausse"
            )
        }

        let notice = NearbyDiscoverabilityLabels.exactBadgeNotice
        XCTAssertFalse(notice.isEmpty)
        XCTAssertFalse(notice.contains("feed.nearby"), "la notice rend sa clé brute : « \(notice) »")
        assertNoSpecifierSurvives(notice, "feed.nearby.consent.exactBadge")
    }

    // MARK: - Le palier appliqué se LIT, même sans faire défiler

    /// Le sélecteur défile, et la pré-sélection sans mémoire est sa DERNIÈRE
    /// puce : elle naît hors écran sur tout iPhone en portrait. Une phrase qui
    /// nomme le palier appliqué est ce qui rend vraie la promesse « voit et
    /// confirme toujours », quel que soit l'offset du défilement.
    func test_appliedNotice_namesEveryTierTheRuleCanPreselect() {
        for sharing in LocationPrecision.allCases {
            let choice = NearbyDiscoverabilityChoice(memorized: nil, sharing: sharing)
            let notice = NearbyDiscoverabilityLabels.appliedNotice(tier: choice.tier)

            XCTAssertTrue(
                notice.contains(NearbyDiscoverabilityLabels.tierTitle(choice.tier)),
                "le palier appliqué n'est pas nommé sous \(sharing.rawValue) — produit : « \(notice) »"
            )
            assertNoSpecifierSurvives(notice, "feed.nearby.precision.applied")
        }
    }

    /// Garde de SOURCE, faute de pouvoir monter la vue : le sélecteur doit
    /// amener sa sélection à l'écran. Sans `ScrollViewReader` + `scrollTo`, il
    /// s'ouvre à l'offset 0 et la puce sélectionnée reste invisible — l'état
    /// exact dans lequel l'utilisateur publiait un palier qu'il n'avait jamais
    /// vu.
    func test_tierPicker_bringsTheSelectedChipIntoView() throws {
        let control = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Components/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Components/NearbyDiscoverabilityControl.swift")
        let source = try String(contentsOf: control, encoding: .utf8)

        XCTAssertTrue(
            source.contains("ScrollViewReader"),
            "le sélecteur ne peut plus amener sa sélection à l'écran"
        )
        XCTAssertTrue(
            source.contains("proxy.scrollTo(choice.tier, anchor: .center)"),
            "à l'ouverture, le palier PRÉ-SÉLECTIONNÉ doit être amené à l'écran"
        )
        XCTAssertTrue(
            source.contains("proxy.scrollTo(tier, anchor: .center)"),
            "après un choix, la puce retenue doit rester visible"
        )
    }

    // MARK: - Quand le consentement est OFFERT

    /// **Un contrôle existe s'il a un effet.** `GET /posts/nearby` filtre
    /// `visibility: 'PUBLIC'` en dur : hors PUBLIC, cocher « trouvable à
    /// proximité » ne pouvait rien rendre trouvable, et faisait seulement
    /// persister un point géospatial sur un contenu que l'utilisateur venait de
    /// restreindre.
    func test_offers_onlyForAPublicAudience() {
        XCTAssertTrue(FeedNearbyDiscoverability.offers(hasPlace: true, visibility: .public))
        for audience in PostVisibility.allCases where audience != .public {
            XCTAssertFalse(
                FeedNearbyDiscoverability.offers(hasPlace: true, visibility: audience),
                "\(audience.rawValue) n'apparaît JAMAIS dans /posts/nearby : la case y serait inerte"
            )
        }
    }

    func test_offers_neverWithoutAPlace() {
        XCTAssertFalse(FeedNearbyDiscoverability.offers(hasPlace: false, visibility: .public))
    }

    /// Le périmètre de la spec est « POST, REEL, STORY, STATUS (tous les
    /// `PostType`) ». Exclure les publications porteuses d'un média — donc tout
    /// REEL — rendait la fonctionnalité structurellement vide sur un fil de
    /// production, et l'écran de découverte restait muet sans que rien ne le
    /// dise. La règle ne connaît plus les pièces jointes du tout.
    func test_offers_doesNotDependOnAttachments() throws {
        let attachments = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/FeedView+Attachments.swift")
        let source = try String(contentsOf: attachments, encoding: .utf8)

        XCTAssertFalse(
            source.contains("pendingPlace != nil && pendingAttachments.isEmpty"),
            "le consentement redevient invisible dès qu'un média est joint — " +
            "c'est-à-dire pour tout REEL, que la spec range pourtant dans le périmètre"
        )
        XCTAssertEqual(
            source.components(separatedBy: "FeedNearbyDiscoverability.offers(").count - 1, 2,
            "les DEUX hôtes du composer doivent partager la même règle"
        )
    }
}
