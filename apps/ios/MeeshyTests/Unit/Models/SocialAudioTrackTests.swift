import XCTest
@testable import Meeshy
import MeeshySDK

/// **Le Prisme AUDIO ne s'arrête pas au fil** (#4926).
///
/// Le `CLAUDE.md` racine range la piste jouée dans la famille AUDIO du Prisme et
/// nomme, pour iOS, `AudioTrackLanguageResolver.resolve`. Le relevé du
/// 2026-09-02 dit que ses cinq appelants sont TOUS dans la conversation : un
/// vocal de post, de réel ou de commentaire arrivait avec ses pistes traduites
/// et n'en élisait aucune.
///
/// > **Les traductions VOYAGENT jusqu'à la vue et n'y sont pas SERVIES.** C'est
/// > la forme du cycle 122 du Prisme rejouée côté client : `FeedMedia.translatedAudios`
/// > est décodé, passé en paramètre, affiché dans la liste des puces — et le
/// > lecteur francophone entend l'espagnol tant qu'il ne tape pas.
///
/// Ce fichier éprouve la PROJECTION sociale de la loi. Il ne réécrit pas la
/// résolution — `AudioTrackLanguageResolverTests` la garde déjà — il éprouve ce
/// que la projection AJOUTE : la sentinelle du plein écran, et le fait que les
/// deux formes disent la même chose.
final class SocialAudioTrackTests: XCTestCase {

    private func track(_ code: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            id: "t-\(code)",
            attachmentId: "att-1",
            targetLanguage: code,
            url: "https://cdn.test/\(code).m4a",
            transcription: "texte \(code)",
            durationMs: 1000,
            format: "m4a",
            cloned: false,
            quality: 1,
            ttsModel: "chatterbox"
        )
    }

    // MARK: - Le rang, éprouvé AILLEURS qu'au premier

    /// **Le témoin de RANG s'écrit sur un rang AUTRE que le premier** (leçon
    /// 261) : au rang 1, la règle juste et le court-circuit rendent le même
    /// verdict, donc le témoin ne peut pas tomber.
    ///
    /// Prisme `['de', 'fr']`, audio espagnol, pistes `en` ET `fr` : le rang 1
    /// (`de`) n'est pas servi, le rang 2 (`fr`) l'est. Servir `en` — la
    /// PREMIÈRE piste du tableau — est le défaut que la règle 1 du Prisme
    /// interdit nommément.
    func test_laPisteElue_estCelleDuPREMIERrangSERVI_pasLaPremiereDisponible() {
        XCTAssertEqual(
            SocialAudioTrack.language(
                originalLanguage: "es",
                preferredLanguages: ["de", "fr"],
                translatedAudios: [track("en"), track("fr")]
            ),
            "fr",
            "le rang 2 gagne quand le rang 1 n'est pas servi — jamais translatedAudios.first"
        )
    }

    /// La langue d'ORIGINE concourt à SON rang, jamais en court-circuit
    /// (règle 3 du Prisme). Prisme `['es', 'fr']` sur un audio espagnol : on
    /// sert l'ORIGINAL, même si une piste `fr` existe.
    func test_laLangueDorigine_gagneASonRANG() {
        XCTAssertNil(
            SocialAudioTrack.language(
                originalLanguage: "es",
                preferredLanguages: ["es", "fr"],
                translatedAudios: [track("fr")]
            ),
            "nil = piste originale ; l'origine au rang 1 bat la traduction du rang 2"
        )
    }

    /// Et l'inverse, qui est le cas NOMINAL dès que la locale appareil (rang 4)
    /// diffère de la langue applicative : l'origine au rang 2 ne court-circuite
    /// pas le rang 1.
    func test_laLangueDorigine_auRang2_neCourtCircuitePasLeRang1() {
        XCTAssertEqual(
            SocialAudioTrack.language(
                originalLanguage: "en",
                preferredLanguages: ["fr", "en"],
                translatedAudios: [track("fr")]
            ),
            "fr",
            "prisme ['fr','en'] sur un audio anglais avec piste fr ⇒ fr, jamais l'original"
        )
    }

    func test_sansAucunePisteTraduite_onSertLoriginal() {
        XCTAssertNil(SocialAudioTrack.language(
            originalLanguage: "es",
            preferredLanguages: ["fr"],
            translatedAudios: []
        ))
    }

    func test_uneLangueDuPrismeSansPiste_neFabriquePasDePiste() {
        XCTAssertNil(SocialAudioTrack.language(
            originalLanguage: "es",
            preferredLanguages: ["de"],
            translatedAudios: [track("fr")]
        ), "de n'a pas de piste, et fr n'est pas dans le prisme — on sert l'original")
    }

    // MARK: - La sentinelle du plein écran

    /// `AudioFullscreenView` porte son état en `String` avec `"orig"` pour
    /// « piste originale », là où la loi rend `String?`. La conversion est ICI
    /// et nulle part ailleurs : elle était écrite en dur à l'initialisation du
    /// `@State`, ce qui EST le défaut — `selectedLanguage = "orig"` ne
    /// consultait rien.
    func test_lePleinEcran_souvreSurLaLangueELUE() {
        XCTAssertEqual(
            SocialAudioTrack.fullscreenSelection(
                originalLanguage: "es",
                preferredLanguages: ["de", "fr"],
                translatedAudios: [track("en"), track("fr")]
            ),
            "fr"
        )
    }

    func test_lePleinEcran_retombeSurLaSentinelle_quandRienNestServi() {
        XCTAssertEqual(
            SocialAudioTrack.fullscreenSelection(
                originalLanguage: "es",
                preferredLanguages: ["de"],
                translatedAudios: [track("fr")]
            ),
            SocialAudioTrack.originalSentinel
        )
    }

    /// **Le fusible.** Les deux formes doivent dire la MÊME chose — c'est ce qui
    /// interdit à la sentinelle de devenir une seconde descente. Une projection
    /// qui divergerait de sa loi est exactement le défaut que ce lot corrige,
    /// reproduit un étage plus bas.
    func test_lesDeuxFormes_disentLaMemeChose() {
        let cas: [(String, [String], [MessageTranslatedAudio])] = [
            ("es", ["de", "fr"], [track("en"), track("fr")]),
            ("es", ["es", "fr"], [track("fr")]),
            ("en", ["fr", "en"], [track("fr")]),
            ("es", ["de"], [track("fr")]),
            ("es", ["fr"], [])
        ]
        for (origine, prisme, pistes) in cas {
            let loi = SocialAudioTrack.language(
                originalLanguage: origine, preferredLanguages: prisme, translatedAudios: pistes
            )
            let sentinelle = SocialAudioTrack.fullscreenSelection(
                originalLanguage: origine, preferredLanguages: prisme, translatedAudios: pistes
            )
            XCTAssertEqual(sentinelle, loi ?? SocialAudioTrack.originalSentinel,
                           "origine=\(origine) prisme=\(prisme)")
        }
    }

    // MARK: - La langue d'ORIGINE d'un audio n'est pas celle de son porteur

    /// **Le cœur du lot, et le plus facile à écrire faux.**
    ///
    /// `FeedPost.originalLanguage` est la langue du TEXTE du post. Un vocal
    /// espagnol peut très bien voyager sous une légende française — la langue
    /// que la règle 3 du Prisme fait concourir à son rang est celle de la
    /// PISTE. `MessageTranscription.language` est ce que Whisper a détecté dans
    /// l'audio ; elle prime sur le porteur.
    func test_laLangueDeLaPISTE_primeSurCelleDuPorteur() {
        let transcription = MessageTranscription(
            attachmentId: "att-1", text: "hola", language: "es"
        )
        XCTAssertEqual(
            SocialAudioTrack.originalLanguage(transcription: transcription, carrier: "fr"),
            "es",
            "le post est en français, le vocal parle espagnol — c'est l'espagnol qui concourt"
        )
    }

    /// Et la conséquence, qui est le défaut que l'inversion produirait : avec le
    /// porteur, un lecteur francophone se verrait servir l'ORIGINAL espagnol
    /// (parce que « fr » serait pris pour la langue d'origine et gagnerait au
    /// rang 1) alors qu'une piste française existe.
    func test_seTromperDeLangueDorigine_priveLeLecteurDeSaTraduction() {
        let transcription = MessageTranscription(
            attachmentId: "att-1", text: "hola", language: "es"
        )
        let pistes = [track("fr")]

        let juste = SocialAudioTrack.language(
            originalLanguage: SocialAudioTrack.originalLanguage(transcription: transcription, carrier: "fr"),
            preferredLanguages: ["fr"],
            translatedAudios: pistes
        )
        XCTAssertEqual(juste, "fr", "la piste française est servie")

        let faux = SocialAudioTrack.language(
            originalLanguage: "fr",
            preferredLanguages: ["fr"],
            translatedAudios: pistes
        )
        XCTAssertNil(faux, "avec la langue du PORTEUR, on sert l'original espagnol — le défaut")
        XCTAssertNotEqual(juste, faux, "sans cette différence, la règle ne décide de rien")
    }

    func test_sansTranscription_leProteurSertDeRepli() {
        XCTAssertEqual(
            SocialAudioTrack.originalLanguage(transcription: nil, carrier: "de"),
            "de"
        )
    }

    /// Aucune langue connue ⇒ chaîne VIDE, pas une langue fabriquée. Elle ne
    /// matche aucun rang, donc l'origine ne gagne nulle part : sans savoir dans
    /// quelle langue on parle, on ne peut pas décider que le lecteur la comprend.
    func test_aucuneLangueConnue_rendLaChaineVide_jamaisUneLangueFabriquee() {
        XCTAssertEqual(SocialAudioTrack.originalLanguage(transcription: nil, carrier: nil), "")
        XCTAssertEqual(SocialAudioTrack.originalLanguage(transcription: nil, carrier: "   "), "")
        XCTAssertEqual(
            SocialAudioTrack.language(
                originalLanguage: "",
                preferredLanguages: ["fr"],
                translatedAudios: [track("fr")]
            ),
            "fr"
        )
    }

    /// **Le repli sur le porteur est INATTEIGNABLE dans le cas nominal, et
    /// c'est structurel** — question posée par une session voisine, épinglée ici
    /// plutôt que laissée à la chance.
    ///
    /// Sans transcription, il n'y a pas de piste traduite : les pistes sont le
    /// produit du pipeline transcription → traduction → TTS. La loi sort sur
    /// « aucune piste disponible » AVANT de regarder la langue d'origine, donc
    /// la valeur du repli n'a aucun effet observable pendant la transcription.
    ///
    /// > C'est un invariant de PIPELINE, pas un invariant de TYPE :
    /// > `FeedMedia.transcription` et `FeedMedia.translatedAudios` sont deux
    /// > champs indépendants du fil. Une projection partielle rouvrirait la
    /// > fenêtre — et dans cette fenêtre, `""` rendrait le même verdict que le
    /// > porteur, donc le repli n'est jamais PIRE que son absence.
    func test_sansPisteTraduite_laLangueDorigine_nAaucunEffet() {
        for origine in ["", "fr", "es", "n'importe quoi"] {
            XCTAssertNil(
                SocialAudioTrack.language(
                    originalLanguage: origine,
                    preferredLanguages: ["fr", "en"],
                    translatedAudios: []
                ),
                "origine=\(origine) : sans piste, rien ne s'élit — le repli ne peut pas nuire"
            )
        }
    }

    // MARK: - La projection ne réécrit pas la loi

    /// La projection DÉLÈGUE : sur un échantillon de cas, elle rend exactement
    /// ce que `AudioTrackLanguageResolver` rend. Le jour où quelqu'un y écrit
    /// une boucle « pour aller plus vite », ce témoin tombe — et c'est la
    /// réécriture, pas l'appel manquant, qui a produit trois familles
    /// divergentes en trois cycles (§ Prisme du CLAUDE.md racine).
    func test_laProjection_neReecritPasLaLoi() {
        let pistes = [track("en"), track("fr")]
        for prisme in [["de", "fr"], ["fr"], ["en"], ["es"], []] {
            XCTAssertEqual(
                SocialAudioTrack.language(
                    originalLanguage: "es", preferredLanguages: prisme, translatedAudios: pistes
                ),
                AudioTrackLanguageResolver.resolve(
                    manualOverride: nil,
                    originalLanguage: "es",
                    preferredLanguages: prisme,
                    translatedAudios: pistes
                ),
                "prisme=\(prisme)"
            )
        }
    }

    /// La bascule MANUELLE reste souveraine, comme dans le fil : elle traverse
    /// la projection sans être réinterprétée.
    func test_laBasculeManuelle_traverseLaProjection() {
        XCTAssertEqual(
            SocialAudioTrack.language(
                manualOverride: "en",
                originalLanguage: "es",
                preferredLanguages: ["fr"],
                translatedAudios: [track("en"), track("fr")]
            ),
            "en",
            "le geste de l'auteur bat le prisme"
        )
    }
}
