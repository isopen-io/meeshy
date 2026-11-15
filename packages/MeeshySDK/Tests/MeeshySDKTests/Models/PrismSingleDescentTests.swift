import XCTest
@testable import MeeshySDK

/// Le Prisme descend par UNE fonction — `PrismTranslationResolver` — et chaque
/// famille de contenu n'en est qu'une PROJECTION.
///
/// Sept sites du SDK réécrivaient la boucle « pour chaque langue du lecteur,
/// la première servie gagne » : le texte d'une story, son `content` legacy (aux
/// DEUX signatures), sa piste audio, sa transcription, le corps d'un post et le
/// code de langue que la carte de feed affiche à côté. Toutes se ressemblaient
/// assez pour avoir l'air d'accord, et aucune ne l'était : chacune avait laissé
/// tomber une règle différente.
///
/// **Chaque témoin ci-dessous FAIT VARIER la règle que sa jumelle traitait
/// autrement.** Un témoin qui ne la fait pas varier serait vert avec ET sans le
/// défaut — c'est exactement ce qui est arrivé aux suites existantes : pas une
/// ne construisait un `StoryTextObject` AVEC sa `sourceLanguage`, donc la
/// dimension était ABSENTE, pas « testée par défaut ».
///
/// Et les témoins de RANG portent sur un rang AUTRE que le premier : au rang 1,
/// le court-circuit interdit et la règle juste rendent le même verdict, donc un
/// témoin écrit là ne peut pas tomber.
final class PrismSingleDescentTests: XCTestCase {

    // MARK: - Story TEXT : la langue d'origine concourt à son RANG

    /// Prisme `["de", "fr", "en"]`, texte écrit en `fr`, traduction `en`
    /// disponible. Le rang 2 (`fr`) EST servi — le texte y est déjà écrit —
    /// donc la descente s'arrête là et rend l'original.
    ///
    /// La boucle manuscrite ne lisait jamais `sourceLanguage` : elle tombait au
    /// rang 3 et servait l'ANGLAIS à un lecteur dont la langue applicative
    /// servie est le français. Rang 2, pas rang 1 : au rang 1 les deux codes
    /// rendent le même verdict.
    func test_storyText_originalLanguageWinsAtItsRank_notALowerRankTranslation() {
        let obj = StoryTextObject(
            id: "t1",
            text: "Bonjour tout le monde",
            translations: ["en": "Hello everyone"],
            sourceLanguage: "fr"
        )
        XCTAssertEqual(
            obj.resolvedText(preferredLanguages: ["de", "fr", "en"]),
            "Bonjour tout le monde",
            "Le texte est DÉJÀ en français : le rang 2 est servi, la traduction anglaise du rang 3 ne doit jamais gagner"
        )
    }

    /// Le miroir, pour prouver que le témoin ci-dessus mesure bien le RANG et
    /// non une préférence pour l'original : la même charge avec l'anglais au
    /// rang 1 sert bien l'anglais.
    func test_storyText_translationOutranksOriginal_servesTheTranslation() {
        let obj = StoryTextObject(
            id: "t1",
            text: "Bonjour tout le monde",
            translations: ["en": "Hello everyone"],
            sourceLanguage: "fr"
        )
        XCTAssertEqual(
            obj.resolvedText(preferredLanguages: ["en", "fr"]),
            "Hello everyone"
        )
    }

    // MARK: - Story TEXT : une traduction VIDE n'est pas une traduction

    /// La boucle manuscrite rendait la chaîne blanche telle quelle — un calque
    /// de texte VIDE sur la story, là où le rang suivant avait une traduction.
    func test_storyText_blankTranslationIsSkipped_nextRankServes() {
        let obj = StoryTextObject(
            id: "t1",
            text: "Hello",
            translations: ["fr": "   ", "es": "Hola"]
        )
        XCTAssertEqual(
            obj.resolvedText(preferredLanguages: ["fr", "es"]),
            "Hola",
            "Une traduction blanche ne sert pas son rang : la descente continue"
        )
    }

    /// Et quand aucun rang n'est servable, c'est l'ORIGINAL — jamais la chaîne
    /// blanche, jamais `translations.first`.
    func test_storyText_onlyBlankTranslations_servesOriginal() {
        let obj = StoryTextObject(
            id: "t1",
            text: "Hello",
            translations: ["fr": "  "]
        )
        XCTAssertEqual(obj.resolvedText(preferredLanguages: ["fr"]), "Hello")
    }

    // MARK: - Story TEXT : deux clés qui se canonisent pareil, départagées par le CONTENU

    /// `"fr"` et `"fr-CA"` coexistent sur le fil. `translations` étant un
    /// `Dictionary`, le `first(where:)` qu'on remplace tirait au sort entre les
    /// deux : la MÊME story rendait deux textes différents selon la graine de
    /// hachage du processus. La règle est de CONTENU — la clé DÉJÀ canonique
    /// gagne, c'est celle que le lecteur a demandée.
    func test_storyText_duplicateCanonicalKeys_canonicalOneWins() {
        let obj = StoryTextObject(
            id: "t1",
            text: "Hello",
            translations: ["fr": "Bonjour", "fr-CA": "Salut"]
        )
        XCTAssertEqual(obj.resolvedText(preferredLanguages: ["fr-BE"]), "Bonjour")
    }

    // MARK: - Story CONTENT : la signature à UNE langue est une PROJECTION

    /// `resolvedContent(preferredLanguage:)` portait sa propre descente : une
    /// comparaison `==` BRUTE, ni canonisée ni rang-consciente. `"FR"` ne
    /// rencontrait jamais la clé `"fr"` et l'original repartait, déguisé en
    /// « pas de traduction ».
    func test_storySingleLanguageContent_isCanonicalised_likeTheChain() {
        let story = StoryItem(
            id: "s1",
            content: "Original",
            translations: [StoryTranslation(language: "fr", content: "Bonjour")]
        )
        XCTAssertEqual(story.resolvedContent(preferredLanguage: "FR"), "Bonjour")
        XCTAssertEqual(
            story.resolvedContent(preferredLanguage: "FR"),
            story.resolvedContent(preferredLanguages: ["FR"]),
            "Les deux signatures sont UNE règle : leurs verdicts ne peuvent pas diverger"
        )
    }

    /// Région strippée aussi — `"fr-CH"` est du français.
    func test_storySingleLanguageContent_regionQualified_matchesBaseKey() {
        let story = StoryItem(
            id: "s1",
            content: "Original",
            translations: [StoryTranslation(language: "fr", content: "Bonjour")]
        )
        XCTAssertEqual(story.resolvedContent(preferredLanguage: "fr-CH"), "Bonjour")
    }

    // MARK: - Story AUDIO : la piste d'origine gagne à son rang

    /// La piste est enregistrée en `fr` et une variante `fr` (doublage
    /// synthétique) existe. Au rang du français, c'est la VOIX DE L'AUTEUR qui
    /// est servie — la boucle manuscrite, aveugle à `sourceLanguage`, faisait
    /// jouer le doublage.
    func test_storyAudio_originalTrackWinsAtItsRank_overASameLanguageVariant() {
        let audio = StoryAudioPlayerObject(
            id: "a1",
            postMediaId: "piste-originale",
            backgroundAudioVariants: [StoryAudioVariant(postMediaId: "doublage-fr", language: "fr")],
            sourceLanguage: "fr"
        )
        XCTAssertEqual(audio.resolvedPostMediaId(preferredLanguages: ["fr"]), "piste-originale")
    }

    /// Le miroir : une variante dans une AUTRE langue que l'original gagne bien
    /// son rang.
    func test_storyAudio_variantInAnotherLanguage_stillWinsItsRank() {
        let audio = StoryAudioPlayerObject(
            id: "a1",
            postMediaId: "piste-originale",
            backgroundAudioVariants: [StoryAudioVariant(postMediaId: "doublage-en", language: "en")],
            sourceLanguage: "fr"
        )
        XCTAssertEqual(audio.resolvedPostMediaId(preferredLanguages: ["en", "fr"]), "doublage-en")
    }

    // MARK: - Story TRANSCRIPTION : une transcription VIDE n'occupe pas son rang

    /// Une transcription blanche gagnait son rang et s'affichait comme un
    /// sous-titre vide, alors que le rang suivant portait du texte.
    func test_storyTranscript_blankOneIsSkipped_nextRankServes() {
        var effects = StoryEffects()
        effects.voiceTranscriptions = [
            StoryVoiceTranscription(language: "fr", content: "   "),
            StoryVoiceTranscription(language: "en", content: "Hello")
        ]
        XCTAssertEqual(
            StoryAudioTranscript.resolve(effects: effects, preferredLanguages: ["fr", "en"])?.content,
            "Hello"
        )
    }

    // MARK: - POST : la canonisation, pas un `.lowercased()` brut

    /// La locale appareil entre au rang 4 du Prisme et arrive RÉGION-TAGUÉE
    /// (`"en-US"`). Les deux jumelles rapprochaient les codes par un
    /// `.lowercased()` : `"en-us"` ne rencontrait jamais la clé `"en"`, la
    /// traduction existait et le post restait dans la langue de l'auteur — ce
    /// qui ressemble à une traduction absente.
    func test_post_regionQualifiedPreferred_matchesBaseTranslationKey() {
        let post = FeedPost(
            id: "p1",
            author: "Alice",
            content: "Bonjour",
            originalLanguage: "fr",
            translations: ["en": PostTranslation(text: "Hello", translationModel: "nllb-200", confidenceScore: 0.9)],
            translatedContent: nil
        )
        XCTAssertEqual(post.resolved(preferredLanguages: ["en-US"]).translatedContent, "Hello")
    }

    /// Et le badge de langue de la carte de feed ANNONCE la langue du texte que
    /// le corps AFFICHE : les deux sortent désormais de la même descente, donc
    /// ils ne peuvent plus se contredire sur cette charge.
    func test_post_languageBadgeAgreesWithTheServedBody_onARegionQualifiedRank() {
        let post = FeedPost(
            id: "p1",
            author: "Alice",
            content: "Bonjour",
            originalLanguage: "fr",
            translations: ["en": PostTranslation(text: "Hello", translationModel: "nllb-200", confidenceScore: 0.9)],
            translatedContent: nil
        )
        XCTAssertEqual(post.resolved(preferredLanguages: ["en-US"]).translatedContent, "Hello")
        XCTAssertEqual(post.resolvedLanguageCode(preferredLanguages: ["en-US"]), "en")
    }

    /// Une traduction VIDE ne sert pas son rang non plus côté post — le rang
    /// suivant est essayé.
    func test_post_blankTranslationIsSkipped_nextRankServes() {
        let post = FeedPost(
            id: "p1",
            author: "Alice",
            content: "Hello",
            originalLanguage: "en",
            translations: [
                "fr": PostTranslation(text: "  ", translationModel: "nllb-200", confidenceScore: 0.9),
                "es": PostTranslation(text: "Hola", translationModel: "nllb-200", confidenceScore: 0.9)
            ],
            translatedContent: nil
        )
        XCTAssertEqual(post.resolved(preferredLanguages: ["fr", "es"]).translatedContent, "Hola")
        XCTAssertEqual(post.resolvedLanguageCode(preferredLanguages: ["fr", "es"]), "es")
    }

    /// `APIPost.resolveTranslation` — le décodeur réseau — descend la MÊME
    /// règle que le modèle de domaine ci-dessus.
    func test_apiPost_regionQualifiedPreferred_matchesBaseTranslationKey() {
        let served = APIPost.resolveTranslation(
            translations: ["en": APIPostTranslationEntry(
                text: "Hello", translationModel: "nllb-200", confidenceScore: 0.9, createdAt: nil
            )],
            originalLanguage: "fr",
            preferredLanguages: ["en-US"]
        )
        XCTAssertEqual(served, "Hello")
    }

    // MARK: - Garde d'INVENTAIRE : personne ne réécrit la boucle

    /// Un témoin de comportement pince UNE charge ; il ne dit rien du PROCHAIN
    /// site qui réécrira le parcours ailleurs. C'est précisément comme ça que
    /// sept jumelles sont nées, chacune juste le jour où elle a été écrite.
    ///
    /// Cette garde énumère les fichiers des deux targets et refuse toute
    /// itération sur une chaîne de langues préférées hors du résolveur.
    /// `PrismTranslationResolver.swift` est le SEUL site autorisé : c'est la
    /// définition de « une source de vérité ».
    func test_noSourceFileReinlinesThePrismDescent() throws {
        let sources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources")

        let forbidden = ["for lang in preferredLanguages",
                         "for language in preferredLanguages",
                         "for lang in preferred ",
                         "for language in preferred ",
                         "for candidate in preferredLanguages"]
        // `PrismTranslationResolver` EST la descente. `ConsumedLanguageResolver`
        // est l'exception DÉCLARÉE : il ne résout aucun contenu — il rapporte
        // quelle version a été lue, pour une statistique — et le témoin qui suit
        // pince son accord de rang avec la descente. Toute autre entrée de cette
        // liste serait une jumelle.
        let allowed: Set<String> = ["PrismTranslationResolver.swift",
                                    "ConsumedLanguageResolver.swift"]

        var offenders: [String] = []
        let walker = FileManager.default.enumerator(at: sources,
                                                    includingPropertiesForKeys: nil)
        while let item = walker?.nextObject() as? URL {
            guard item.pathExtension == "swift",
                  !allowed.contains(item.lastPathComponent) else { continue }
            let text = try String(contentsOf: item, encoding: .utf8)
            for needle in forbidden where text.contains(needle) {
                offenders.append("\(item.lastPathComponent) — « \(needle) »")
            }
        }

        XCTAssertEqual(
            offenders.sorted(), [],
            """
            Une descente du Prisme a été réécrite hors de PrismTranslationResolver.
            Appeler `PrismTranslationResolver.resolve(originalLanguage:candidates:preferredLanguages:isServable:)`
            plutôt que de reparcourir la chaîne : c'est cette réécriture qui a
            produit sept jumelles, chacune ayant perdu une règle différente
            (la langue d'origine à son rang, le saut d'une entrée VIDE, la
            canonisation des codes, le départage déterministe de deux clés).
            """
        )
    }

    /// Le pendant du précédent : `ConsumedLanguageResolver` a le DROIT de
    /// parcourir la chaîne parce qu'il ne résout pas un CONTENU — il rapporte
    /// quelle version le lecteur a eue sous les yeux, pour une statistique. Il
    /// est donc nommé ici, pour que sa présence dans la liste des sites qui
    /// itèrent soit un CHOIX relu et non un oubli.
    func test_consumedLanguageResolver_isTheDeclaredExceptionAndStillAgreesOnRank() {
        XCTAssertEqual(
            ConsumedLanguageResolver.resolve(
                originalLanguage: "fr",
                availableTranslations: ["en"],
                preferredLanguages: ["de", "fr", "en"]
            ),
            "fr",
            "Même verdict de RANG que la descente de contenu : le lecteur a vu l'original"
        )
    }
}
