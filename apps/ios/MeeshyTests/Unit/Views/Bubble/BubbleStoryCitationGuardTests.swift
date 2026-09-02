import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Vue `3h` (#4098) — répondre à une story la CITE.**
///
/// > « La story répondue reste citée, pas aplatie. La vignette porte la scène
/// > telle qu'elle était et le lien vers l'original ; si elle a expiré, la
/// > citation subsiste avec sa date au lieu de disparaître. »
///
/// Quatre familles, dans l'ordre où elles mordent : la RÈGLE de placement
/// (pure, seize cas), le NON-DOUBLON entre la carte et la citation plate, la
/// FEUILLE `Equatable` de la carte, et — la seule qui touche l'utilisateur —
/// le fait qu'un lien mort DISE qu'il est mort.
final class BubbleStoryCitationGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    /// Racine du dépôt — un fait de ce lot vit dans le SDK, pas dans l'app.
    private func sdkSource(_ relativePath: String) throws -> String {
        let repoRoot = MyStoriesSourceCorpus.appRoot()
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
        return try String(contentsOf: repoRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private static let card = "Meeshy/Features/Main/Views/Bubble/BubbleStoryCitationCard.swift"
    private static let host = "Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift"
    private static let conversation = "Meeshy/Features/Main/Views/ConversationView.swift"

    private func storyReference(
        messageId: String = "story-1",
        previewText: String = "Dernier soir de tournage",
        isMe: Bool = false,
        publishedAt: Date? = Date(timeIntervalSince1970: 1_700_000_000),
        thumbnailUrl: String? = "https://cdn.example/s1.webp",
        moodEmoji: String? = nil
    ) -> ReplyReference {
        ReplyReference(
            messageId: messageId, authorName: "Story", previewText: previewText, isMe: isMe,
            isStoryReply: true, storyPublishedAt: publishedAt,
            storyThumbnailUrl: thumbnailUrl, moodEmoji: moodEmoji
        )
    }

    // MARK: - 1. La règle de placement — seize cas, trois détachements

    /// La table entière. Trois combinaisons seulement détachent, et ce sont
    /// celles où la citation n'a **aucun autre hôte** : ni la carte plate d'une
    /// humeur, ni le conteneur unifié média, ni le lecteur audio.
    ///
    /// Une relecture confirme une règle à quatre entrées ; elle ne la MESURE
    /// pas. Ces seize lignes le font, et elles tomberaient sur l'inversion la
    /// plus probable — oublier qu'une humeur voyage AVEC `isStoryReply == true`
    /// (c'est ce drapeau qui route son envoi), ce qui aurait transformé toutes
    /// les humeurs citées en cartes de scène vides.
    func test_thePlacementRule_detachesOnlyWhenNoOtherHostHoldsTheCitation() {
        for isStory in [false, true] {
            for hasMood in [false, true] {
                for visual in [false, true] {
                    for audio in [false, true] {
                        let expected = isStory && !hasMood && !visual && !audio
                        XCTAssertEqual(
                            StoryCitationPlacement.isDetached(
                                isStoryReply: isStory, hasMoodEmoji: hasMood,
                                visualHostsReply: visual, audioHostsReply: audio),
                            expected,
                            "story=\(isStory) humeur=\(hasMood) média=\(visual) audio=\(audio)"
                        )
                    }
                }
            }
        }
    }

    /// L'hôte doit CONSULTER la règle, pas la rejouer. Une seconde copie du
    /// `guard` en cascade rendrait le témoin ci-dessus décoratif : il
    /// mesurerait une fonction que plus personne n'appelle.
    func test_theHostAsksTheRule_neverReplaysIt() throws {
        let host = try source(Self.host)

        XCTAssertTrue(
            host.contains("StoryCitationPlacement.isDetached("),
            "`detachedStoryCitation` doit appeler la règle partagée."
        )
        XCTAssertFalse(
            host.contains("guard let reply = content.reply, reply.isStory else"),
            "La cascade d'origine est revenue dans l'hôte : deux écritures de la " +
            "même règle divergent au premier cas de bord, et la citation se rend " +
            "alors deux fois — une fois en scène, une fois aplatie."
        )
    }

    // MARK: - 2. La carte et la citation plate ne se doublent JAMAIS

    /// L'invariant est structurel : **un seul site décide**, et la citation
    /// plate se conditionne à ce même site. Vérifier « il n'y a qu'une carte à
    /// l'écran » demanderait de rendre la bulle et n'attraperait que le cas
    /// observé ; interroger la structure attrape tous les autres.
    func test_theFlatCitation_standsDownWhenTheSceneCardTookIt() throws {
        let host = try source(Self.host)

        XCTAssertTrue(
            host.contains("if let reply = content.reply, detachedStoryCitation == nil {"),
            "La citation plate doit se taire quand la carte de scène a pris la story."
        )
        XCTAssertEqual(
            host.components(separatedBy: "private var detachedStoryCitation: ReplyReference?").count - 1, 1,
            "Un seul producteur de la décision — sinon les deux consommateurs (le " +
            "`body` qui MONTE la carte, le corps de bulle qui RETIRE la plate) " +
            "peuvent répondre différemment sur le même message."
        )
        XCTAssertTrue(
            host.contains("BubbleStoryCitationCard("),
            "Le `body` doit monter la carte — sans elle, le témoin ci-dessus resterait " +
            "vert sur une story qui ne se cite plus du tout."
        )
    }

    /// Le geste n'est armé que s'il a une cible. Sans identifiant, la carte se
    /// rend quand même — c'est la citation qui « subsiste » — mais elle
    /// n'annonce pas une porte qui n'existe pas (loi 4).
    func test_theOpenGesture_isArmedOnlyWhenThereIsSomethingToOpen() throws {
        let host = try source(Self.host)
        XCTAssertTrue(host.contains("!citation.messageId.isEmpty"))

        let card = try source(Self.card)
        XCTAssertTrue(
            card.contains("accessibilityAddTraits(onOpen == nil ? [] : .isButton)"),
            "Un trait de BOUTON sur une carte que personne n'a câblée annoncerait à " +
            "VoiceOver une cible qui ne fait rien."
        )
        XCTAssertFalse(
            card.contains(".onTapGesture { onOpen?() }"),
            "Un `.onTapGesture` posé sans condition AVALE le tap même sans " +
            "gestionnaire : la carte devient une cible morte au lieu de laisser passer."
        )
    }

    // MARK: - 3. Aucune inférence d'expiration, et la date est SERVIE

    /// **Le refus le plus important de ce lot, et il s'écrit en négatif.**
    ///
    /// `storyPublishedAt + StoryItem.defaultExpiryInterval` est une règle pure,
    /// testable, et à portée de main : la carte tient la date. Elle est
    /// REFUSÉE, parce que le droit d'ouvrir une story passé son heure est
    /// DÉCLARÉ par le serveur (`StoryItem.referenceAccess`, « never recomputed
    /// from `expiresAt` here ») — une personne NOMMÉE dans la story y accède
    /// encore. Une carte qui s'annoncerait « expirée » sur une story que le tap
    /// aurait ouverte mentirait, et un mensonge est pire que le silence qu'on
    /// corrige.
    ///
    /// Lu sur le CODE, commentaires dépouillés : le doc-comment de la carte
    /// CITE la règle du SDK pour expliquer pourquoi elle est refusée, et une
    /// garde qui lirait la prose rougirait sur l'explication du refus.
    func test_theCard_neverGuessesExpiry() throws {
        let raw = try source(Self.card)
        let card = AppSourceGuard.stripComments(raw)
        XCTAssertFalse(
            card.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            "dépouillement vide : un balayage vide ne doit jamais ressembler à un succès"
        )
        XCTAssertTrue(card.contains("struct BubbleStoryCitationCard"),
                      "le dépouillement doit laisser le CODE intact")

        for inference in ["isExpired", "defaultExpiryInterval", "expiresAt", "Date()"] {
            XCTAssertFalse(
                card.contains(inference),
                "La carte préjuge de l'expiration (« \(inference) ») : seul le serveur " +
                "sait qui garde le droit d'ouvrir une story périmée."
            )
        }
    }

    /// « La citation subsiste **avec sa date** ». La planche ne montre pas la
    /// date sur le bandeau — la doctrine, si. Le témoin suit la doctrine.
    func test_theStripCarriesItsDate() throws {
        let card = try source(Self.card)

        XCTAssertTrue(
            card.contains("RelativeTimeFormatter.shortString(for: date)"),
            "Le bandeau doit porter la date de la story citée — par le formateur que " +
            "`StoryItem.timeAgo` emploie, pour que la citation date la story comme le " +
            "reste de l'app. `Text(date, style: .relative)` rendait « 11 h et 11 min »."
        )
        XCTAssertTrue(card.contains("bubble.reply.story.answer"))
    }

    /// **La variante « à VOTRE story » est INTERDITE tant qu'aucune donnée ne
    /// peut la déclencher.**
    ///
    /// Elle a été écrite, puis retirée : les QUATRE producteurs d'une citation
    /// de story laissent `isMe` à faux — l'un le pose littéralement
    /// `isMe: false` — et le snapshot ne porte aucune identité d'auteur
    /// (`authorName` vaut la chaîne « Story »). La branche aurait été du code
    /// mort déguisé en fonctionnalité, et son libellé un mensonge silencieux
    /// dans le catalogue.
    ///
    /// Le témoin garde les DEUX faces : le libellé unique côté carte, et le
    /// fait producteur qui le justifie côté SDK. Sans la seconde, il
    /// interdirait pour toujours une variante que la donnée pourrait un jour
    /// permettre — ce qui ferait de lui un obstacle, pas une garde.
    func test_theStripHasASingleForm_becauseNoProducerCanTellWhoseStoryItWas() throws {
        let card = try source(Self.card)
        XCTAssertFalse(
            card.contains("bubble.reply.story.answer.mine"),
            "Libellé « votre story » revenu : aucune donnée ne peut l'atteindre."
        )

        let models = try sdkSource("packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift")
        let persistence = try sdkSource("packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift")
        XCTAssertGreaterThan(models.count, 10_000)
        XCTAssertGreaterThan(persistence.count, 10_000)
        XCTAssertTrue(
            models.contains("authorName: \"Story\""),
            "Le producteur nomme encore la story « Story » — s'il porte enfin un " +
            "auteur RÉEL, la variante « votre story » redevient possible et cette " +
            "garde doit être relue, pas contournée."
        )
    }

    // MARK: - 4. La feuille Equatable voit tout ce qu'elle rend

    /// Une feuille à `==` MANUEL qui oublie un champ ne se redessine JAMAIS
    /// quand ce champ change — la vignette arrivée après coup resterait grise
    /// pour toujours. Cinq mutations, une par champ rendu.
    @MainActor
    func test_theCardRedrawsOnEveryFieldItRenders() {
        func card(_ reply: ReplyReference, isDark: Bool = true, accent: String = "#7C6CF6") -> BubbleStoryCitationCard {
            BubbleStoryCitationCard(reply: reply, isDark: isDark, accentHex: accent)
        }
        let base = card(storyReference())

        XCTAssertEqual(base, card(storyReference()), "même donnée ⇒ pas de redessin")

        XCTAssertNotEqual(base, card(storyReference(messageId: "story-2")))
        XCTAssertNotEqual(base, card(storyReference(previewText: "Six heures du matin")))
        XCTAssertNotEqual(base, card(storyReference(publishedAt: nil)))
        XCTAssertNotEqual(base, card(storyReference(thumbnailUrl: nil)))
        XCTAssertNotEqual(base, card(storyReference(), isDark: false))
        XCTAssertNotEqual(base, card(storyReference(), accent: "#FF0000"))
    }

    /// La scène tient ENTIÈRE : une story est en 9:16, et la recadrer
    /// trahirait « la vignette porte la scène **telle qu'elle était** ».
    @MainActor
    func test_theSceneKeepsTheStorysOwnShape() {
        XCTAssertEqual(BubbleStoryCitationCard.sceneAspectRatio, 9.0 / 16.0, accuracy: 0.0001)
        XCTAssertEqual(
            BubbleStoryCitationCard.sceneHeight,
            (BubbleStoryCitationCard.cardWidth / BubbleStoryCitationCard.sceneAspectRatio).rounded()
        )
        XCTAssertGreaterThan(BubbleStoryCitationCard.sceneHeight, BubbleStoryCitationCard.cardWidth,
                             "une scène de story est en PORTRAIT")
    }

    // MARK: - 5. Un lien mort le DIT

    /// **Le défaut que « survit à son expiration » a fait remonter.**
    ///
    /// `onStoryReplyTap` s'ouvrait sur `if let groupIdx = …` **sans `else`** :
    /// story expirée, purgée ou jamais chargée, le tap ne faisait RIEN. Pas
    /// d'erreur, pas d'explication — la citation subsistait à l'écran et son
    /// lien était mort en silence. Le chemin voisin, pour un MESSAGE cité
    /// introuvable, faisait déjà la bonne chose douze lignes plus haut.
    ///
    /// Témoin POSITIF exprès : en négatif il serait passé au vert le jour où
    /// quelqu'un renomme la closure, en ne décrivant plus rien.
    func test_aStoryThatCannotBeOpened_saysSo() throws {
        let view = try source(Self.conversation)

        XCTAssertTrue(
            view.contains("guard let groupIdx = storyViewModel.groupIndex(forStoryId: storyId) else {"),
            "L'échec de résolution doit avoir une branche à lui."
        )
        XCTAssertTrue(
            view.contains("conversation.storyUnavailable"),
            "…et cette branche doit DIRE quelque chose : un tap sans effet ni " +
            "explication se lit comme une app figée."
        )
    }

    /// Fusible de lecture : cinq des témoins ci-dessus sont négatifs, et un
    /// négatif sur une lecture vide passe au vert sans qu'aucune assertion ne
    /// puisse le signaler.
    func test_theGuardActuallyReadsItsSources() throws {
        XCTAssertGreaterThan(try source(Self.card).count, 5_000)
        XCTAssertGreaterThan(try source(Self.host).count, 40_000)
        XCTAssertGreaterThan(try source(Self.conversation).count, 40_000)
    }
}
