import XCTest
import MeeshySDK
@testable import Meeshy

/// Garde d'analyse de source : dans la surface CONVERSATION, une fonction
/// déclarée doit être ATTEIGNABLE — référencée ailleurs qu'à sa propre
/// déclaration.
///
/// ## Le défaut qu'elle fige (243i)
///
/// `ConversationView+MessageRow.swift` hébergeait deux fonctions qu'AUCUN commit
/// du dépôt n'a jamais appelées :
///
/// - `replyCountPill(count:isMe:parentMessageId:)` — une pastille « N réponses »
///   sous la bulle, avec son `Button`, son libellé, son `accessibilityLabel` et
///   son `accessibilityHint`. Le fil de réponses vivant passe par
///   `MessageMoreSheet` → `onThread` → `ThreadView`.
/// - `scrollToAndHighlight(_:proxy:)` — le saut-vers-le-message de l'époque
///   `ScrollView` SwiftUI, remplacé par `MessageListViewController`.
///
/// Entre elles, **trois clés de catalogue traduites en sept locales** pour des
/// pixels qui n'ont jamais existé — et un état, `highlightedMessageId`, dont
/// `scrollToAndHighlight` était le seul écrivain non nul et que rien ne lisait.
///
/// Ce n'est pas seulement du gaspillage. `conversation.view.reply.count.{one,many}`
/// a voyagé de report en report depuis 240i (« l'arabe y est lésé, six formes
/// pour deux branches Swift »), et TROIS itérations l'ont recopié sans jamais
/// demander qui l'affichait. La description d'un défaut se propage seule ; sa
/// vérification, non.
///
/// > **Une chaîne localisée dans une fonction morte est invisible aux DEUX
/// > gardes existantes.** `LocalizationConsistencyTests` vérifie que toute clé
/// > du catalogue est citée en code (elle l'était) et que toute clé citée existe
/// > au catalogue. Aucune ne demande si le code qui la cite s'exécute. Le
/// > chaînon manquant est ici : la fonction est-elle appelée ?
///
/// ## Ce que la garde N'ATTRAPE PAS
///
/// L'atteignabilité par référence est une approximation, choisie parce qu'elle
/// est DÉCIDABLE hors compilateur. Une fonction citée une seule fois depuis une
/// autre fonction elle-même morte reste verte ici. La garde attrape la feuille
/// de l'arbre mort, pas l'arbre — c'est déjà ce qui manquait, et c'est vérifiable
/// sans toolchain Swift (aucune n'existe sous Linux, cf. leçons 238i / 242i).
///
/// Les conformances de protocole sont appelées PAR LE FRAMEWORK et par rien
/// d'autre : `makeUIViewController` / `updateUIViewController` rougiraient à
/// tort — elles rougissaient à la première mesure. Elles sortent par
/// `frameworkInvoked`, un ensemble de NOMS DE CONTRAT et non la liste des
/// exceptions : le jour où une septième extension conformera à
/// `UIViewControllerRepresentable`, elle sera couverte sans que personne y pense.
@MainActor
final class ConversationSurfaceReachabilityGuardTests: XCTestCase {

    /// Les surfaces couvertes, par PRÉFIXE de nom de fichier — un
    /// `ConversationView+…` ou un `StoryViewerView+…` de plus naît couvert, sans
    /// que personne ait à penser à l'ajouter ici.
    ///
    /// 243i n'en couvrait qu'une (`ConversationView`). 244i y ajoute le FIL et
    /// la STORY, chacune ayant d'abord été MESURÉE : c'est cette mesure qui a
    /// rendu les six fonctions retirées et les trois exceptions ci-dessous.
    private static let surfacePrefixes = ["ConversationView", "FeedView", "StoryViewerView"]
    private static let surfaceDirectories = [
        "apps/ios/Meeshy/Features/Main/Views",
        "apps/ios/Meeshy/Features/Main/ViewModels",
    ]

    /// Les exceptions, chacune avec la raison qui la rend légitime.
    ///
    /// `buildNativeMessageMenu(for:)` : `private`, jamais appelée, et pourtant
    /// tenue VERTE par `ConversationMenuSystemDesignGuardTests`, qui l'inspecte
    /// à la source — le motif « code mort testé vert » que ce dépôt connaît.
    /// Son doc-comment dit « le menu natif n'existe que sur iOS 26 » : c'est
    /// peut-être un chemin monté plus tard, pas un vestige. Trancher demande
    /// l'arbitrage produit du menu contextuel natif, pas une passe de nettoyage
    /// — inscrite ici NOMMÉMENT pour qu'elle reste une dette VUE.
    private static let unreachableAllowlist: Set<String> = [
        "buildNativeMessageMenu",

        // ── 2026-09-06 · la reprise d'un post bloqué DORT, et sa dette est NOMMÉE ──
        //
        // `recoverStuckPostDraftIfNeeded` pré-remplissait le composer avec le
        // dernier post ou réel resté hors ligne. Son appelant unique était
        // `.task { … }` sur `composerOverlay`, que `70598711d9` a remplacé par
        // le MEUBLE sur le fil iPad — l'appel est parti avec l'overlay.
        //
        // Ce n'est pas un débranchement passé inaperçu : `DocumentComposerDoor`
        // le dit dans son doc-comment, au paragraphe « ce qu'elle ne fait PAS,
        // et qu'il ne faut pas lire comme tenu » — le meuble n'a pas de canal de
        // graine pour un DOCUMENT (`moodSeed` est le seul), et lui en ouvrir un
        // déplacerait l'`init` que le lot 5.5 a déjà réservé. « Dette NOMMÉE,
        // non refermée ici — elle ne perd rien aujourd'hui, la ligne bloquée
        // partant seule à la reconnexion. »
        //
        // > Ce qui est perdu n'est donc pas l'ENVOI mais la RÉOUVERTURE en
        // > brouillon : le post bloqué part quand même au retour du réseau, il
        // > ne revient simplement plus sous les yeux de son auteur pour être
        // > repris. La supprimer serait jeter le code qu'il faudra réécrire à
        // > l'ouverture de ce canal ; la laisser sans l'inscrire ici la rendrait
        // > indiscernable d'un vestige.
        //
        // **CORRECTION 2026-09-09 (#5830) — « la ligne bloquée part seule à la
        // reconnexion » était FAUX, et un réel du porteur en est la preuve.**
        // Mesuré sur son appareil : `createPost`/REEL, `attempts = 5`,
        // `status = exhausted`, ses trois fichiers encore sur le disque, et la
        // passerelle acceptant parfaitement les mêmes octets. Une ligne
        // ÉPUISÉE ne repart JAMAIS seule — c'est la définition de cet état. La
        // dette a donc été consentie sur une prémisse que la mesure
        // contredit, ce qu'aucun témoin ne pouvait dire : l'allowlist prouve
        // qu'un appelant manque, pas que sa JUSTIFICATION tient.
        //
        // La réouverture existe désormais, ailleurs et mieux : la pastille
        // « Réel non publié » RELANCE la ligne (#5830). Mieux, parce que le
        // brouillon restauré ici aurait perdu ce que `RecoveredOfflinePost` ne
        // porte pas — `storyEffects`, `mediaObjectIds`, les légendes : pour un
        // réel à trois scènes, une « reprise » qui rend la composition à plat.
        "recoverStuckPostDraftIfNeeded",

        // ── 2026-09-10 (#6016) · l'AUTRE moitié de la même reprise dormante ──
        //
        // `supersedeRecoveredPost` remplace la ligne bloquée quand l'auteur
        // renvoie le brouillon restauré, au lieu de la dupliquer à la
        // reconnexion. C'est le PARTENAIRE de `recoverStuckPostDraftIfNeeded`
        // ci-dessus : l'une rouvre, l'autre solde.
        //
        // Elle apparaît ici le jour où #6016 a retiré le composer inline du
        // fil, qui portait sa seule citation. **Mais elle était déjà
        // inatteignable, et la mesure le dit** : son garde d'entrée est
        // `if let cmid = recoveredPostCmid`, et le SEUL site qui posait
        // `recoveredPostCmid` à une valeur non nulle était
        // `recoverStuckPostDraftIfNeeded` — cette liste atteste qu'elle n'a
        // aucun appelant. La branche ne pouvait donc jamais s'ouvrir.
        //
        // > **Le retrait n'a pas TUÉ cette fonction, il l'a RENDUE VISIBLE.**
        // > C'est exactement la limite que le doc-comment de cette garde
        // > annonce — « une fonction citée une seule fois depuis une autre
        // > fonction elle-même morte reste verte ici ». Retirer la feuille fait
        // > descendre la mesure d'un cran dans l'arbre, et ce cran-là était
        // > mort depuis le même commit que le premier.
        //
        // Elle reste, pour la raison qui garde sa partenaire : le canal de
        // graine du meuble n'existe pas encore, et le jour où il s'ouvrira,
        // rouvrir un brouillon SANS solder la ligne d'origine la publierait
        // deux fois. La jeter serait jeter la moitié qu'on remarquerait le
        // moins à la réécriture.
        //
        // `FeedViewModelTests` l'exerce — donc « code testé, jamais expédié »,
        // la même forme que `likePost` / `bookmarkPost` plus bas, et le même
        // coût : une suite verte qui n'atteste rien du produit.
        "supersedeRecoveredPost",

        // ── 244i · le fil : trois méthodes dont le SEUL appelant est la SUITE ──
        //
        // `likePost`, `bookmarkPost` et `clearTranslationOverride` sont
        // déclarées sur `FeedViewModel`, largement couvertes par
        // `FeedViewModelTests` — et appelées par AUCUN code de production.
        //
        // Ce n'est pas du code oublié : `FeedView` a RÉÉCRIT leur logique en
        // ligne. Ses propres commentaires le disent — « Mirrors the
        // SocialSocketManager call », « same one `FeedViewModel.likePost`
        // already uses », « Mirror the pre-fix behaviour from
        // FeedViewModel.bookmarkPost ». La vue porte donc le toggle optimiste,
        // l'appel socket, le repli REST, la mise en file hors-ligne et
        // l'observation d'issue, pendant que l'implémentation canonique — celle
        // que les tests exercent — ne tourne jamais.
        //
        // > **Le code TESTÉ et le code EXPÉDIÉ ne sont pas le même.** Une suite
        // > verte n'atteste alors plus rien du produit : elle mesure une
        // > deuxième implémentation que personne ne rend. C'est la forme la plus
        // > coûteuse de « code mort testé vert », parce qu'elle achète de la
        // > confiance au lieu d'en retirer.
        //
        // Les RETIRER casserait les tests ; les CÂBLER est un refactor porteur
        // de comportement sur le like / favori / file hors-ligne du fil, qui
        // demande un simulateur (leçon 238i : découper par NIVEAU DE DOUTE).
        // Inscrites NOMMÉMENT pour rester une dette VUE, avec le correctif
        // proposé dans l'analyse 244i.
        "likePost",
        "bookmarkPost",
        "clearTranslationOverride",

        // ── 244i · la conversation : quatre méthodes que seule la suite appelle ──
        //
        // Même famille que les trois ci-dessus. `_testSetAudioCoordinator` est un
        // SIÈGE DE TEST assumé (son préfixe le dit) et restera légitimement ici ;
        // les trois autres sont du code de production dont plus rien, en
        // production, ne dépend.
        "_testSetAudioCoordinator",
        "clearMentionSuggestions",
        "handleMentionQuery",
        "removeExpiredMessages",

        // ── 244i · deux méthodes ENTANGLÉES avec de l'état vivant ──
        //
        // Elles n'ont AUCUN appelant, pas même un test — mais les retirer ne
        // serait pas neutre, et c'est pourquoi elles sont inscrites plutôt que
        // supprimées.
        //
        // `markProgrammaticScroll()` était l'unique site posant
        // `isProgrammaticScroll = true`. Son seul appelant était
        // `scrollToAndHighlight`, retirée en **243i** — mais celle-ci n'avait
        // elle-même aucun site d'appel, donc le drapeau n'a JAMAIS été vrai.
        // Conséquence à signaler, pas à corriger ici : le `guard … ,
        // !isProgrammaticScroll` de la pagination (`ConversationViewModel:4132`)
        // ne bloque rien, et la « réinitialisation défensive » (:1869) non plus.
        // Retirer la méthode laisserait un drapeau LU que rien n'écrit — la
        // vraie question (cette garde doit-elle fonctionner ?) appartient à la
        // piste conversation et demande un simulateur.
        //
        // `fetchReactionDetails(messageId:)` peuple `reactionDetails` /
        // `isLoadingReactions`, deux `@Published` que `ConversationStateStore`
        // déclare AUSSI, pendant que `MessageReactionsDetailView` porte son
        // PROPRE `@State isLoadingReactions`. Trois copies d'un même état, une
        // seule alimentée. Démêler cela est un lot en soi.
        "markProgrammaticScroll",
        "fetchReactionDetails",
    ]

    /// Les exigences de protocole que le FRAMEWORK appelle. Elles ne sont
    /// jamais nommées par du code du dépôt, et leur absence de référence ne dit
    /// donc rien de leur atteignabilité. Ce sont des noms de CONTRAT : les
    /// exclure ici couvre d'avance toute conformance future, là où une liste
    /// d'exceptions attendrait qu'on y pense.
    private static let frameworkInvoked: Set<String> = [
        // UIViewControllerRepresentable / UIViewRepresentable
        "makeUIViewController", "updateUIViewController", "dismantleUIViewController",
        "makeUIView", "updateUIView", "dismantleUIView", "makeCoordinator",
        // UIViewController & app lifecycle
        "viewDidLoad", "viewWillAppear", "viewDidAppear",
        "viewWillDisappear", "viewDidDisappear",
    ]

    // MARK: - Le corpus, lu UNE fois

    /// Les cinq tests de cette classe interrogent le MÊME corpus : ~1250
    /// fichiers Swift, lus, dépouillés de leurs commentaires puis concaténés.
    /// Le faire par test, c'était cinq balayages complets de l'arbre pour un
    /// résultat identique — quelques dizaines de secondes de MainActor, sur une
    /// suite qui en compte 8229 et dont le rapport CI signale déjà les
    /// « longest test runs » comme 43 % de la durée.
    ///
    /// `static let` : Swift l'initialise paresseusement, une fois, à la
    /// première lecture.
    /// Les membres statiques sont nommés PAR LEUR TYPE et non par `Self` :
    /// dans l'initialiseur d'une propriété stockée statique, `Self` n'a pas de
    /// type dynamique à désigner.
    private static let sourceCorpus: String = {
        ConversationSurfaceReachabilityGuardTests.allSourceFiles()
            .compactMap { ConversationSurfaceReachabilityGuardTests.code(of: $0) }
            .joined(separator: "\n")
    }()

    /// Idem pour la surface : nom + code dépouillé, lus une fois.
    private static let surfaceSources: [(name: String, code: String)] = {
        ConversationSurfaceReachabilityGuardTests.surfaceFiles()
            .compactMap { url -> (name: String, code: String)? in
                guard let stripped = ConversationSurfaceReachabilityGuardTests.code(of: url) else { return nil }
                return (name: url.lastPathComponent, code: stripped)
            }
    }()

    private static func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .deletingLastPathComponent()  // …/apps
            .deletingLastPathComponent()  // racine du dépôt
    }

    /// Le balayage des RÉFÉRENCES couvre l'app, ses quatre extensions et le SDK :
    /// une extension peut très bien appeler un helper de la surface.
    private static func allSourceFiles() -> [URL] {
        let root = repoRoot()
        let roots = [
            "apps/ios/Meeshy",
            "apps/ios/MeeshyShareExtension",
            "apps/ios/MeeshyNotificationExtension",
            "apps/ios/MeeshyWidgets",
            "packages/MeeshySDK/Sources",
        ].map { root.appendingPathComponent($0) }

        var found: [URL] = []
        for dir in roots {
            guard let walker = FileManager.default.enumerator(
                at: dir, includingPropertiesForKeys: nil
            ) else { continue }
            for case let url as URL in walker where url.pathExtension == "swift" {
                found.append(url)
            }
        }
        return found
    }

    private static func surfaceFiles() -> [URL] {
        let root = repoRoot()
        let contents = surfaceDirectories.flatMap { dir -> [URL] in
            (try? FileManager.default.contentsOfDirectory(
                at: root.appendingPathComponent(dir), includingPropertiesForKeys: nil
            )) ?? []
        }
        return contents
            .filter { $0.pathExtension == "swift" }
            .filter { url in surfacePrefixes.contains { url.lastPathComponent.hasPrefix($0) } }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    /// Le dépouillement des commentaires est ce qui donne son sens au test : une
    /// pierre tombale qui NOMME la fonction retirée — c'est le style de ce
    /// dépôt — ne doit pas la ressusciter en la faisant compter pour une
    /// référence.
    private static func code(of url: URL) -> String? {
        guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        return AppSourceGuard.stripComments(raw)
    }

    /// Les noms de fonction déclarés par un fichier. `func` suivi d'un
    /// identifiant : les initialiseurs et les `subscript` n'en sont pas, et
    /// c'est voulu — leur atteignabilité ne se lit pas au nom.
    private func declaredFunctionNames(in code: String) -> Set<String> {
        Self.matches(of: #"\bfunc\s+([A-Za-z_]\w*)"#, in: code)
    }

    private static func matches(of pattern: String, in text: String) -> Set<String> {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        var out = Set<String>()
        for match in regex.matches(in: text, range: range) {
            guard match.numberOfRanges > 1,
                  let r = Range(match.range(at: 1), in: text) else { continue }
            out.insert(String(text[r]))
        }
        return out
    }

    /// Combien de fois `name` apparaît en code, DÉCLARATIONS DÉDUITES. Zéro
    /// signifie : rien, nulle part, ne nomme cette fonction hors de sa propre
    /// signature.
    private func referenceCount(of name: String, in corpus: String) -> Int {
        let uses = Self.occurrences(of: #"\b\#(name)\b"#, in: corpus)
        let declarations = Self.occurrences(of: #"\bfunc\s+\#(name)\b"#, in: corpus)
        return uses - declarations
    }

    private static func occurrences(of pattern: String, in text: String) -> Int {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return 0 }
        return regex.numberOfMatches(in: text, range: NSRange(text.startIndex..., in: text))
    }

    // MARK: - Le versant atteignabilité

    func test_touteFonctionDeLaSurfaceConversationEstAtteignable() {
        let corpus = Self.sourceCorpus
        XCTAssertFalse(corpus.isEmpty, "Le balayage ne lit aucune source — la garde n'inspecterait rien.")

        var unreachable: [String] = []
        for file in Self.surfaceSources {
            for name in declaredFunctionNames(in: file.code).sorted() {
                guard !Self.unreachableAllowlist.contains(name),
                      !Self.frameworkInvoked.contains(name) else { continue }
                if referenceCount(of: name, in: corpus) == 0 {
                    unreachable.append("\(file.name) → \(name)")
                }
            }
        }

        XCTAssertTrue(
            unreachable.isEmpty,
            """
            Fonction déclarée dans la surface conversation et référencée NULLE PART. \
            Une vue qu'on ne monte pas ne rend aucun pixel — mais ses chaînes \
            localisées, ses libellés VoiceOver et ses cibles tactiles ont l'air \
            présents à la relecture, et ses clés de catalogue partent en traduction. \
            La retirer, ou la monter :
            \(unreachable.joined(separator: "\n"))
            """
        )
    }

    // MARK: - La garde se garde elle-même

    /// Sans ce versant, le test ci-dessus passerait au vert pour la mauvaise
    /// raison le jour où le balayage, le dépouillement ou la regex casserait :
    /// il n'inspecterait plus rien.
    func test_leBalayageVoitLaSurfaceEtSesFonctions() {
        let files = Self.surfaceSources
        XCTAssertGreaterThanOrEqual(
            files.count, 10,
            "Les trois surfaces (conversation, fil, story) comptent ensemble au moins dix fichiers"
        )

        let declared = files.reduce(into: Set<String>()) {
            $0.formUnion(declaredFunctionNames(in: $1.code))
        }
        XCTAssertGreaterThan(declared.count, 200, "Le dépouillement mange les déclarations")
        XCTAssertTrue(
            declared.contains("triggerReply"),
            "`triggerReply(for:)` est un helper vivant de la surface — s'il n'est plus vu, la détection est cassée"
        )
    }

    /// Le cœur du test est une SOUSTRACTION (usages − déclarations). Si elle
    /// dérivait, une fonction morte compterait sa propre signature comme un
    /// appel et la garde ne détecterait plus rien.
    func test_laSoustractionSépareUnAppelDUneDéclaration() {
        let deadOnly = "func widgetOrphanHelper() -> Int { 0 }"
        XCTAssertEqual(
            referenceCount(of: "widgetOrphanHelper", in: deadOnly), 0,
            "Une déclaration seule doit compter ZÉRO référence"
        )

        let declaredAndCalled = deadOnly + "\nlet x = widgetOrphanHelper()"
        XCTAssertEqual(
            referenceCount(of: "widgetOrphanHelper", in: declaredAndCalled), 1,
            "Un appel doit compter pour une référence"
        )
    }

    /// La pierre tombale de 243i nomme les deux fonctions retirées. Si le
    /// dépouillement des commentaires devenait timide, ces noms compteraient
    /// pour des références et la garde deviendrait aveugle à son propre défaut.
    func test_unePierreTombaleNeRessuscitePasSaFonction() {
        let stripped = AppSourceGuard.stripComments(
            "// `replyCountPill(count:)` a vécu ici jusqu'en 243i\nlet keep = 1\n"
        )
        XCTAssertFalse(
            stripped.contains("replyCountPill"),
            "Le dépouillement laisse passer les commentaires — une fonction retirée resterait « référencée » par son épitaphe"
        )
        XCTAssertTrue(stripped.contains("keep"), "Le dépouillement avale le code")
    }

    /// Le défaut de 243i, figé : ces deux fonctions ne doivent pas revenir sans
    /// site d'appel. Le test ci-dessus les attraperait — celui-ci le dit par
    /// leur nom, pour que la recherche `git log -S` les retrouve.
    func test_lesDeuxFonctionsRetiréesEn243iNeSontPasRevenues() {
        let corpus = Self.surfaceSources.map { $0.code }.joined(separator: "\n")
        for name in ["replyCountPill", "scrollToAndHighlight"] {
            XCTAssertFalse(
                corpus.contains(name),
                "\(name) est revenue dans la surface conversation. Elle n'a jamais eu de site d'appel : la monter, ou ne pas la réécrire."
            )
        }
    }
}

// MARK: - #7452 — le chrome de protection, dans les cinq modes de lecture
//
// Cette garde vit dans CE fichier, et non dans le sien, pour une raison
// d'outillage : `check_test_registration.sh` exige qu'un fichier de test soit
// inscrit dans le `project.pbxproj` COMMITTÉ, et cette inscription se produit
// par `xcodegen generate` — indisponible hors d'un Mac. Un fichier neuf ne
// s'exécuterait donc nulle part. Le voisinage n'est pas arbitraire : les deux
// gardes interrogent la même surface, « ce que la conversation rend vraiment ».

/// **La garde du « tout autre affichage plus tard »** (#7452).
///
/// ## Ce qu'elle empêche, et pourquoi une garde plutôt qu'un correctif
///
/// Relevé sur `dev` 3ff99d3aa3 : la conversation se lit de CINQ façons, et le
/// décompte d'un message éphémère n'existait que dans trois d'entre elles —
/// Focal et Script (`FocalEphemeralBadge`), Bulle (`BubbleEphemeralBadge`).
/// **Rivière et Résumé n'affichaient rien** : un message qui allait disparaître
/// dans trente secondes ne le disait pas à deux lecteurs sur cinq.
///
/// Ce n'était pas une négligence, c'était structurel. Rivière et Résumé sont
/// nés APRÈS la bulle, et rien, en les écrivant, n'obligeait à déclarer ce
/// qu'ils faisaient des messages protégés. Ajouter deux badges aujourd'hui
/// referme le trou d'aujourd'hui ; le sixième mode le rouvrira, exactement
/// comme les deux précédents. La directive porteur nomme ce risque : « il est
/// important de s'assurer que cette feature a un décompte en Script, Focal ou
/// bulle **ou tout autre affichage plus tard** ».
///
/// La garde parcourt donc `ConversationReadingMode.allCases` — jamais une
/// liste recopiée — et exige, pour CHAQUE cas, un fichier qui monte
/// `MessageProtectionChrome` avec un descripteur RÉSOLU. Un sixième mode ne
/// peut naître ni sans entrée dans `ReadingModeProtectionChrome` (le `switch`
/// ne compilerait pas), ni sans rendre le chrome (ce test rougirait).
final class ReadingModeProtectionChromeGuardTests: XCTestCase {

    private func appRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func source(at relativePath: String) throws -> String {
        let url = appRoot().appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Les cinq modes, et le sixième

    func test_chaqueModeDeLecture_rendLeChromeDeProtection() throws {
        for mode in ReadingModeOrchestrator.ConversationReadingMode.allCases {
            let path = ReadingModeProtectionChrome.rendererPath(for: mode)
            let code = try source(at: path)
            XCTAssertTrue(
                code.contains("MessageProtectionChrome(descriptor:"),
                """
                Le mode « \(mode.rawValue) » ne rend PAS le chrome de protection. \
                `\(path)` doit monter `MessageProtectionChrome(descriptor:…)` — le \
                décompte d'un éphémère ET la désignation d'une vue unique en \
                dépendent. C'est la garde du « tout autre affichage plus tard » : \
                deux modes sur cinq (Rivière, Résumé) étaient muets avant #7452, \
                et un badge peint à la main ici rouvrirait la divergence.
                """
            )
        }
    }

    /// Le descripteur monté ne doit pas être FABRIQUÉ par la vue : il vient de
    /// la résolution unique (`MeeshyMessage.protection`), directement ou via la
    /// projection du mode (`BubbleContent.protection`, `RiverBubbleContent
    /// .protection`, `SummaryProtectionEntry.descriptor`).
    func test_chaqueModeDeLecture_consommeUnDescripteurRésolu() throws {
        let resolvedSources = [
            ".protection",          // BubbleContent / RiverBubbleContent / MeeshyMessage
            "entry.descriptor",     // SummaryProtectionEntry
        ]
        for mode in ReadingModeOrchestrator.ConversationReadingMode.allCases {
            let path = ReadingModeProtectionChrome.rendererPath(for: mode)
            let code = try source(at: path)
            XCTAssertTrue(
                resolvedSources.contains(where: code.contains),
                """
                Le mode « \(mode.rawValue) » monte un chrome dont le descripteur \
                n'est pas résolu par le site unique. `\(path)` doit lire la \
                projection de `MeeshyMessage.protection` — une vue qui compose \
                son propre descripteur réécrit la règle d'échéance du contrat \
                #7451, et c'est précisément ainsi que trois lectures différentes \
                de `expiresAt` ont coexisté.
                """
            )
        }
    }

    // MARK: - La destruction se voit, dans les cinq modes (#7467)

    func test_chaqueModeDeLecture_monteLaCombustionDUnÉphémère() throws {
        // Un message qui disparaît d'une liste sans transition ne se lit pas
        // comme une destruction : il se lit comme un SAUT — la liste se
        // réorganise et le lecteur croit avoir raté un défilement. L'effet est
        // donc une INFORMATION, pas un ornement, et il se doit d'exister
        // partout où le message s'affiche.
        for mode in ReadingModeOrchestrator.ConversationReadingMode.allCases {
            let path = ReadingModeProtectionChrome.burnHostPath(for: mode)
            let code = try source(at: path)
            XCTAssertTrue(
                code.contains(".ephemeralBurn(isBurning:"),
                "Le mode « \(mode.rawValue) » retire un éphémère échu SANS le montrer. "
                    + "`\(path)` doit poser `.ephemeralBurn(isBurning:…)` — le modificateur "
                    + "lit lui-même « Réduire les animations », il n'y a rien d'autre à câbler."
            )
        }
    }

    /// La combustion ne se pose JAMAIS deux fois sur le même message : elle
    /// doublerait l'opacité et l'échelle. En peau bulle, l'hôte est
    /// `ThemedMessageBubble` (sticker compris) et non `BubbleStandardLayout`,
    /// où vit le chrome — c'est pourquoi les deux tables existent.
    func test_laCombustion_nEstPoséeQuUneFoisParPeau() throws {
        for mode in ReadingModeOrchestrator.ConversationReadingMode.allCases {
            let chromePath = ReadingModeProtectionChrome.rendererPath(for: mode)
            let burnPath = ReadingModeProtectionChrome.burnHostPath(for: mode)
            guard chromePath != burnPath else { continue }
            let chromeCode = try source(at: chromePath)
            XCTAssertFalse(
                chromeCode.contains(".ephemeralBurn(isBurning:"),
                "`\(chromePath)` ne doit pas poser la combustion : `\(burnPath)` la pose déjà "
                    + "pour le mode « \(mode.rawValue) », et deux poses se multiplient."
            )
        }
    }

    // MARK: - Plus aucun minuteur par cellule

    func test_aucuneCelluleNeFaitTournerSonPropreMinuteurÉphémère() throws {
        // Le décompte bat côté système (`Text(timerInterval:)`) et la
        // disparition est ordonnancée UNE fois pour tout le fil
        // (`EphemeralExpiryCoordinator`). Un `Timer.publish` réintroduit dans
        // une cellule de message ferait exactement ce que ce lot a retiré :
        // un réveil du MainActor par seconde et par éphémère à l'écran.
        let watched = [
            "Features/Main/Views/Bubble/BubbleStandardLayout.swift",
            "Features/Main/Views/ThemedMessageBubble.swift",
            "Features/Main/Focal/Row/FocalRow.swift",
            "Features/Main/Riviere/View/RiverBubbleView.swift",
            "Features/Main/Focal/Summary/SummaryProtectionsView.swift",
        ]
        for path in watched {
            let code = try source(at: path)
            XCTAssertFalse(
                code.contains("Timer.publish"),
                "`\(path)` fait tourner un minuteur de cellule. Le décompte est rendu par "
                    + "`Text(timerInterval:)` et la disparition par `EphemeralExpiryCoordinator`."
            )
        }
    }

    // MARK: - Un pictogramme par sens

    /// **La table des trois protections, arrêtée par le porteur le 2026-09-22 :**
    /// « vue unique c'est "1" cerclé plutôt, et l'œil représente le flou ! »,
    /// l'éphémère restant la flamme.
    ///
    /// Le défaut réel n'était pas qu'un pictogramme soit laid : c'est que
    /// `flame` désignait la VUE UNIQUE dans la ligne de liste pendant qu'il
    /// désignait l'ÉPHÉMÈRE dans la bulle — un même dessin pour deux sens
    /// opposés. Et le COMPOSEUR lui-même se contredisait : sa barre montrait
    /// `flame.fill`, sa feuille d'effets `hourglass`, son état inactif
    /// `timer.circle`. Trois images pour un sens, dans l'écran où
    /// l'utilisateur apprend le vocabulaire.
    func test_lesPictogrammesDeProtection_suiventLaTableDuPorteur() throws {
        XCTAssertEqual(MessageProtectionSymbols.ephemeral, "flame")
        XCTAssertEqual(MessageProtectionSymbols.viewOnce, "1.circle")
        XCTAssertEqual(MessageProtectionSymbols.blurred, "eye.slash")
    }

    /// Les DEUX surfaces de CHOIX lisent la table, plutôt que de la recopier.
    /// Un littéral y reviendrait sans rien faire rougir — c'est exactement
    /// ainsi que la barre et la feuille ont divergé.
    func test_lesSurfacesDeChoix_lisentLaTableEtNePeignentAucunLittéral() throws {
        let surfaces = [
            "Features/Main/Components/EffectsPickerView.swift",
            "Features/Main/Components/UniversalComposerBar+Protections.swift",
        ]
        let bannedLiterals = ["\"flame\"", "\"flame.fill\"", "\"1.circle\"", "\"1.circle.fill\"",
                              "\"eye.slash\"", "\"eye.slash.fill\"", "\"hourglass\"", "\"timer.circle\""]
        for path in surfaces {
            let code = try source(at: path)
            XCTAssertTrue(
                code.contains("MessageProtectionSymbols."),
                "`\(path)` doit lire `MessageProtectionSymbols` : c'est là que l'utilisateur "
                    + "APPREND le vocabulaire, et l'affichage doit dire la même chose."
            )
            for literal in bannedLiterals {
                XCTAssertFalse(
                    code.contains(literal),
                    "`\(path)` peint \(literal) à la main. La table est la source unique — "
                        + "un littéral y revient sans rien faire rougir, et c'est ainsi que la "
                        + "barre et la feuille du composeur ont fini par se contredire."
                )
            }
        }
    }
}


/// **Un contrôle monté derrière un drapeau qu'aucun écran de production n'arme
/// est un contrôle ABSENT** (#7472).
///
/// Il ne rougit nulle part : il compile, il se teste en isolation, il s'affiche
/// en aperçu. Seul un témoin qui regarde le SITE DE MONTAGE peut le voir — d'où
/// la place de cette suite, à côté de la garde d'atteignabilité des fonctions
/// de la surface conversation, qui ferme la même famille de défaut un cran plus
/// bas.
final class ComposerViewOnceReachabilityGuardTests: XCTestCase {

    private func appRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Architecture
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func source(at relativePath: String) throws -> String {
        try String(contentsOf: appRoot().appendingPathComponent(relativePath), encoding: .utf8)
    }

    // MARK: - #7472 — la vue unique se pose d'un seul geste, à côté du flou

    /// **Le bouton existait, à la bonne place, et personne ne pouvait le voir.**
    ///
    /// > « Il faut mettre "1" cerclé à côté du flou dans l'universal composer
    /// > bar ! afin de facilement envoyer des vues unique ! »
    ///
    /// `viewOnceToggleButton` était écrit, stylé, localisé et monté dans la
    /// rangée haute juste après `blurToggleButton` — mais derrière
    /// `if showViewOnce`, un drapeau qu'un SEUL site d'appel arme, et pour
    /// l'aperçu de notification : `showViewOnce: previewMode`. Dans le
    /// composeur de conversation, il valait `false` depuis toujours.
    ///
    /// La vue unique se choisissait donc par la feuille des effets — trois
    /// gestes — pendant que le flou, sa jumelle de masquage, s'armait d'un tap
    /// à dix points de là. Ce n'est pas un bouton à écrire, c'est une porte à
    /// ouvrir : d'où la bascule d'un drapeau d'OPT-IN vers un drapeau
    /// d'OPT-OUT, `hideViewOnce`, exactement celui du flou.
    ///
    /// > Un contrôle monté derrière un drapeau qu'aucun écran de production
    /// > n'arme est un contrôle absent — et il ne rougit nulle part, puisqu'il
    /// > compile, se teste en isolation et s'affiche en aperçu.
    func test_leComposeur_exposeLaBasculeDeVueUniqueParDéfaut() throws {
        let composer = try source(at: "Features/Main/Components/UniversalComposerBar.swift")
        XCTAssertTrue(
            composer.contains("var hideViewOnce: Bool = false"),
            "La vue unique doit s'afficher PAR DÉFAUT, comme le flou : un drapeau "
                + "d'opt-in la laissait invisible dans le composeur de conversation."
        )
        XCTAssertFalse(
            composer.contains("var showViewOnce"),
            "`showViewOnce` était le drapeau d'OPT-IN. Le garder à côté de "
                + "`hideViewOnce` rouvrirait la porte par deux sens contraires."
        )
    }

    /// Les deux protections de masquage sont VOISINES dans la rangée, et
    /// gardées par le même genre de drapeau. Le voisinage est la moitié de la
    /// demande : « à côté du flou ».
    func test_lesDeuxBasculesDeMasquage_sontVoisinesEtGardéesPareil() throws {
        let toolbar = try source(at: "Features/Main/Components/UniversalComposerBar+Toolbar.swift")
        guard let blur = toolbar.range(of: "blurToggleButton"),
              let viewOnce = toolbar.range(of: "viewOnceToggleButton") else {
            return XCTFail("Les deux bascules de masquage ont quitté la rangée haute.")
        }
        XCTAssertTrue(blur.lowerBound < viewOnce.lowerBound,
                      "La vue unique se pose À CÔTÉ du flou, après lui.")
        let between = String(toolbar[blur.upperBound..<viewOnce.lowerBound])
        XCTAssertFalse(
            between.contains("ToggleButton"),
            "Aucune autre bascule ne doit s'insérer entre le flou et la vue unique : "
                + "« à côté » est la moitié de la demande."
        )
        XCTAssertTrue(toolbar.contains("if !hideViewOnce"),
                      "La vue unique se cache par opt-OUT, comme le flou (`if !hideBlur`).")
    }

    /// L'ÉTAT armé part bien dans le message. Sans ce versant, la bascule
    /// pourrait s'afficher et ne rien envoyer — loi 4 : un contrôle existe
    /// s'il a un effet.
    func test_lÉtatArmé_atteintLEnvoi() throws {
        let mount = try source(at: "Features/Main/Views/ConversationView+Composer.swift")
        XCTAssertTrue(mount.contains("isViewOnceEnabled: $viewModel.isViewOnceEnabled"),
                      "La bascule doit écrire dans l'état du ViewModel, pas dans un `@State` local.")
        let send = try source(at: "Features/Main/ViewModels/ConversationViewModel+Send.swift")
        XCTAssertTrue(send.contains("isViewOnceEnabled"),
                      "L'envoi doit LIRE l'état armé — sinon la bascule est une cible morte.")
    }
}

// MARK: - #7498 — la protection armée voyage avec TOUT ce qu'on envoie

/// « Cela ne fonctionne que sur les textes » (recette 1.1.0).
///
/// Un tap produit souvent PLUSIEURS messages : un par groupe de pièces
/// jointes, plus le texte en dernier. Les trois bascules étaient relues à
/// chaque envoi et désarmées au PREMIER acquittement — tout ce qui suivait
/// partait donc sans protection, la rangée pourtant allumée au tap.
///
/// Les témoins ci-dessous gardent la FORME qui rend ce défaut impossible,
/// parce que la seule autre façon de le voir demande deux simulateurs et un
/// envoi multi-pièces : une valeur saisie une fois, passée à chaque message,
/// et une bulle optimiste qui la porte.
final class ComposerProtectionTravelsGuardTests: XCTestCase {

    private func source(at relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent("Meeshy/\(relativePath)"), encoding: .utf8)
    }

    /// Le désarmement se fait AU TAP, jamais à l'acquittement d'un message.
    ///
    /// C'est la moitié du défaut qui ne se voit dans aucune vue : à
    /// l'acquittement, on est au bout d'UN message, et il en reste à partir.
    func test_leDésarmement_seFaitAuTapEtPasÀLAcquittement() throws {
        let send = try source(at: "Features/Main/ViewModels/ConversationViewModel+Send.swift")
        XCTAssertTrue(send.contains("func consumeArmedProtection()"),
                      "La saisie-et-désarmement doit être UNE fonction nommée, appelée par le tap.")

        guard let finalize = send.range(of: "func finalizeSuccessfulSend") else {
            return XCTFail("Impossible de localiser la finalisation d'un envoi acquitté.")
        }
        let après = String(send[finalize.upperBound...].prefix(3000))
        XCTAssertFalse(après.contains("isViewOnceEnabled = false"),
                       "Désarmer à l'acquittement laisse partir sans protection tout ce qui suit "
                           + "le premier message du même tap.")
        XCTAssertFalse(après.contains("isBlurEnabled = false"),
                       "Idem pour le flou : un tap, un désarmement.")
    }

    /// La bulle optimiste PORTE la protection. Sans cela l'expéditeur envoie un
    /// éphémère et voit un message ordinaire — ni flamme, ni décompte, ni
    /// voile — jusqu'à la réconciliation serveur, ce qui se lit comme « la
    /// protection n'a pas été appliquée ».
    /// **La sonde est BORNÉE au corps de `insertOptimisticMediaMessage`**, et
    /// c'est le correctif d'un défaut de cette garde elle-même : écrite en
    /// balayage de FICHIER, elle interdisait le littéral
    /// `expiresAt: nil, effectFlags: 0` partout — alors que sa phrase ne parle
    /// que de la bulle d'un MÉDIA. Le chemin HORS LIGNE porte le même littéral,
    /// légitimement (voir plus bas), et la garde tombait donc sur du code
    /// qu'elle n'a jamais prétendu décrire.
    ///
    /// > Une garde dont la SONDE est plus large que sa PHRASE finit par rougir
    /// > pour du code qu'elle ne gouverne pas — et le réflexe est alors
    /// > d'élargir le code au lieu de resserrer la sonde.
    ///
    /// **Pourquoi la ligne hors ligne reste telle quelle** : sa protection ne
    /// voyage pas encore sur le fil (`OfflineQueueItem` ne porte aucun champ de
    /// protection — #7507). Lui faire porter la flamme ici afficherait une
    /// protection que le drain n'applique pas : « une protection annoncée et
    /// non appliquée est pire que pas de protection » (relevé porteur). Les
    /// deux moitiés partent ENSEMBLE, dans #7507, ou pas du tout.
    func test_laBulleOptimiste_porteLaProtection() throws {
        let send = try source(at: "Features/Main/ViewModels/ConversationViewModel+Send.swift")
        guard let insert = send.range(of: "func insertOptimisticMediaMessage") else {
            return XCTFail("`insertOptimisticMediaMessage` introuvable — la pose optimiste d'un média a changé de nom")
        }
        let corps = String(send[insert.lowerBound...])
        XCTAssertFalse(corps.contains("expiresAt: nil, effectFlags: 0"),
                       "La ligne optimiste d'un média ne doit plus naître sans protection.")
        XCTAssertTrue(corps.contains("expiresAt: protection.expiresAt(from: now)"),
                      "Elle doit dater son échéance depuis l'intention saisie au tap.")
        XCTAssertTrue(corps.contains("effectFlags: protection.lifecycleFlags.rawValue"),
                      "Et porter les bits de cycle de vie correspondants.")
    }

    /// La ligne optimiste d'un TEXTE porte les DEUX axes, unis.
    ///
    /// Le serveur recompose ses bits depuis les colonnes déclarées ; la ligne
    /// locale, elle, est lue telle quelle, et `MessageProtectionDescriptor` lit
    /// les BITS pour la vue unique et le flou. Un texte armé « ① » n'avait donc
    /// ni puce ni voile jusqu'à la réponse serveur. L'éphémère s'en sortait par
    /// la porte de derrière — `expiresAt` suffit à le prouver — ce qui est
    /// exactement ce qui a rendu ses deux voisins invisibles au relevé.
    func test_laBulleOptimisteDUnTexte_unitLesDeuxAxes() throws {
        let send = try source(at: "Features/Main/ViewModels/ConversationViewModel+Send.swift")
        XCTAssertTrue(send.contains("func optimisticEffectFlags(_ intent: MessageProtectionIntent)"),
                      "L'union des deux axes doit être UNE fonction nommée, pas un ternaire recopié.")
        XCTAssertTrue(send.contains(".union(intent.lifecycleFlags)"),
                      "Elle doit UNIR le cycle de vie, jamais le remplacer par l'axe apparition.")
        XCTAssertFalse(send.contains("effectFlags: pendingEffects.hasAnyEffect ? pendingEffects.flags.rawValue : 0"),
                       "Un record optimiste qui ne lit QUE `pendingEffects` perd la vue unique et le flou.")
    }

    /// **Aucun `insertOptimisticMediaMessage` sans protection NOMMÉE.** Le
    /// paramètre n'a délibérément PAS de valeur par défaut : un défaut ferait
    /// qu'un nouveau chemin d'envoi hériterait de « rien de protégé » en
    /// silence, ce qui est exactement le défaut qu'on corrige.
    func test_chaqueBulleOptimiste_nommeSaProtection() throws {
        let send = try source(at: "Features/Main/ViewModels/ConversationViewModel+Send.swift")
        XCTAssertTrue(send.contains("protection: MessageProtectionIntent\n"),
                      "Le paramètre doit être NON optionnel et sans défaut.")

        for chemin in ["Features/Main/Views/ConversationView+AttachmentHandlers.swift",
                       "Features/Main/Views/ConversationView+Sticker.swift"] {
            let src = try source(at: chemin)
            let poses = src.components(separatedBy: "insertOptimisticMediaMessage(").count - 1
            guard poses > 0 else { continue }
            let nommées = src.components(separatedBy: "protection: protection").count - 1
            XCTAssertGreaterThanOrEqual(
                nommées, poses,
                "\(chemin) pose \(poses) bulle(s) optimiste(s) : chacune doit nommer la protection "
                    + "saisie au tap."
            )
        }
    }

    /// Le tap saisit la protection UNE fois, et chaque groupe de cet envoi la
    /// reçoit. Le témoin compte : autant d'envois que de passages.
    func test_leTap_saisitUneFoisEtSertTousLesGroupes() throws {
        let src = try source(at: "Features/Main/Views/ConversationView+AttachmentHandlers.swift")
        XCTAssertEqual(
            src.components(separatedBy: "viewModel.consumeArmedProtection()").count - 1, 1,
            "Une seule saisie par tap : deux saisies rendraient la seconde vide."
        )
        let envois = src.components(separatedBy: "viewModel.sendMessage(").count - 1
        let servis = src.components(separatedBy: "protection: protection").count - 1
        XCTAssertGreaterThanOrEqual(
            servis, envois - 1,
            "Chaque envoi de ce tap — média comme texte — doit recevoir la protection saisie. "
                + "Le -1 tolère l'envoi de repli qui ne part pas d'un tap."
        )
    }
}


// MARK: - #7499 — toucher un média à vue unique l'OUVRE ; la fermeture consomme

/// « lorsqu'on tap pour afficher, ça supprime directement au lieu d'afficher le
/// contenu en plein écran ! » — relevé du porteur, recette 1.1.0.
///
/// La garde est de FORME parce que l'autre façon de voir ce défaut est de
/// perdre un média pour de bon : la consommation est irréversible, et un témoin
/// qui l'exerce vraiment détruirait ce qu'il vérifie.
final class ViewOnceOpensBeforeConsumingGuardTests: XCTestCase {

    private func source(at relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent("Meeshy/\(relativePath)"), encoding: .utf8)
    }

    /// La révélation d'un média n'APPELLE PLUS la consommation.
    ///
    /// C'est le défaut lui-même : `handleReveal` appelait `onConsumeViewOnce`
    /// avant d'afficher quoi que ce soit, puis révélait cinq secondes en
    /// vignette. Le contenu était détruit sans avoir été montré.
    func test_laRévélation_nAppellePlusLaConsommation() throws {
        let grille = try source(at: "Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift")
        guard let reveal = grille.range(of: "private func handleReveal()") else {
            return XCTFail("Impossible de localiser la révélation d'un média.")
        }
        let corps = String(grille[reveal.upperBound...].prefix(1200))
        XCTAssertFalse(corps.contains("onConsumeViewOnce?("),
                       "Toucher un média à vue unique doit l'OUVRIR, pas le consommer.")
        XCTAssertTrue(corps.contains("openFullscreen()"),
                      "La révélation doit ouvrir le plein écran dans le même geste.")
    }

    /// Et la consommation part bien de la FERMETURE, depuis le seul site qui la
    /// voie : l'hôte de la galerie. La bulle sait qu'on ouvre ; elle ne sait
    /// pas quand on sort.
    func test_laFermeture_consommeCeQuiAÉtéOuvert() throws {
        let galerie = try source(at: "Features/Main/Views/ConversationView+MediaGallery.swift")
        XCTAssertTrue(galerie.contains("onDismiss: handleGalleryDismiss"),
                      "La fermeture du plein écran doit être observée par l'hôte.")
        XCTAssertTrue(galerie.contains("pendingViewOnceConsumption.takeAll()"),
                      "Elle doit consommer ce qui a été ouvert, et VIDER dans le même geste.")
        XCTAssertTrue(galerie.contains("viewModel.consumeViewOnce(messageId:"),
                      "La consommation reste l'appel serveur existant, déplacé — pas réécrit.")

        let hôte = try source(at: "Features/Main/Views/ConversationView.swift")
        XCTAssertTrue(hôte.contains("pendingViewOnceConsumption.arm(attachment.messageId)"),
                      "L'ouverture arme la consommation, sur le chemin qui ouvre la galerie.")
    }

    /// **L'idempotence est la garde centrale**, et elle est portée par le type,
    /// pas par la discipline des sites : le serveur COMPTE les ouvertures, donc
    /// deux fermetures ne doivent brûler qu'un crédit.
    func test_lAttente_estVidéeParLaLecture() throws {
        var pending = ViewOnceConsumption.Pending()
        pending.arm("msg-1")
        pending.arm("msg-1")
        XCTAssertEqual(pending.takeAll(), ["msg-1"])
        XCTAssertTrue(pending.isEmpty, "La lecture vide l'attente — sinon la seconde sortie reconsomme.")
    }
}


// MARK: - #7500 — un texte à vue unique se consomme en QUITTANT la conversation

/// > « pour le texte, le faire disparaître lorsqu'on quitte la conversation
/// > uniquement » — directive porteur, recette 1.1.0.
///
/// Un texte n'a pas de plein écran : sa consommation ne peut partir ni du
/// toucher — qui le détruisait avant lecture — ni d'un minuteur de cinq
/// secondes, qui décide à la place du lecteur combien de temps il lui faut
/// pour comprendre une phrase.
final class ViewOnceTextConsumedOnExitGuardTests: XCTestCase {

    private func source(at relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent("Meeshy/\(relativePath)"), encoding: .utf8)
    }

    /// Une vue unique révélée RESTE lisible : elle ne repasse pas par le
    /// minuteur de disparition, qui appartient au FLOU (on révèle, on regarde,
    /// ça se referme — et rien n'est consommé, on peut recommencer).
    func test_uneVueUniqueRévélée_neSeReferméPasTouteSeule() throws {
        let cycle = try source(at: "Features/Main/Views/Bubble/BubbleBlurRevealLifecycle.swift")
        XCTAssertTrue(cycle.contains("private func revealUntilLeaving()"),
                      "Une vue unique doit avoir sa propre révélation, SANS disparition programmée.")
        guard let demande = cycle.range(of: "func requestReveal(") else {
            return XCTFail("Impossible de localiser la demande de révélation.")
        }
        let corps = String(cycle[demande.upperBound...].prefix(600))
        XCTAssertTrue(corps.contains("revealUntilLeaving()"),
                      "Le chemin vue unique doit révéler sans programmer la disparition.")
        XCTAssertTrue(corps.contains("guard request.requiresConsume else"),
                      "Le flou garde son va-et-vient : seul le chemin vue unique change.")
    }

    /// Le canal de consommation OUVRE au lieu de détruire. C'est le défaut
    /// lui-même : la révélation dépendait d'un aller-retour serveur pour
    /// afficher ce que ce même aller-retour venait de détruire.
    ///
    /// Depuis #7618, le canal délègue à `openViewOnce(messageId:)` (fichier
    /// d'extension — l'hôte est dans la dette héritée du cliquet de taille) :
    /// un média ARME sa consommation et ouvre le plein écran, un texte se
    /// révèle et confirme. Les DEUX canaux de l'hôte (fil et Rivière) passent
    /// par lui ; la Rivière consommait au toucher.
    func test_leCanalDeConsommation_armeAuLieuDeDétruire() throws {
        let hôte = try source(at: "Features/Main/Views/ConversationView.swift")
        let canaux = hôte.components(separatedBy: "onConsumeViewOnce: { messageId, completion in").dropFirst()
        XCTAssertEqual(canaux.count, 2, "Le fil et la Rivière ont chacun leur canal.")
        for canal in canaux {
            let corps = String(canal.prefix(600))
            XCTAssertTrue(corps.contains("completion(openViewOnce(messageId: messageId))"),
                          "Le canal délègue à l'ouverture de la vue unique.")
            XCTAssertFalse(corps.contains("await viewModel.consumeViewOnce"),
                           "Le serveur n'est plus appelé au moment de la révélation.")
        }
        let ouverture = try source(at: "Features/Main/Views/ConversationView+ViewOnceExit.swift")
        XCTAssertTrue(ouverture.contains("pendingViewOnceConsumption.arm(messageId)"),
                      "Le média ouvert ARME la consommation, qui part à la fermeture.")
        XCTAssertFalse(ouverture.contains("await viewModel.consumeViewOnce"),
                       "L'ouverture ne consomme jamais elle-même.")
    }

    /// **Les DEUX portes de sortie**, et elles sont jumelles : « quitter, c'est
    /// quitter ». N'en câbler qu'une laisse une vue unique survivre à un
    /// verrouillage d'écran, c'est-à-dire au cas le plus probable.
    func test_lesDeuxSorties_consommentToutesLesDeux() throws {
        let hôte = try source(at: "Features/Main/Views/ConversationView.swift")
        XCTAssertEqual(
            hôte.components(separatedBy: "consumeOpenedViewOnceOnExit()").count - 1, 2,
            "La navigation (`onDisappear`) ET l'arrière-plan (`scenePhase`) doivent consommer."
        )

        guard let fond = hôte.range(of: "if phase == .background {") else {
            return XCTFail("Impossible de localiser la sortie par arrière-plan.")
        }
        let corpsFond = String(hôte[fond.upperBound...].prefix(700))
        XCTAssertTrue(corpsFond.contains("consumeOpenedViewOnceOnExit()"),
                      "Le passage en arrière-plan est une sortie au même titre que le retour.")
    }

    /// Le geste vit HORS de l'hôte : `ConversationView.swift` est dans la dette
    /// héritée du cliquet de taille, où ajouter est interdit — on extrait
    /// d'abord, on ajoute ensuite.
    func test_leGesteDeSortie_vitHorsDeLHôte() throws {
        let extension_ = try source(at: "Features/Main/Views/ConversationView+ViewOnceExit.swift")
        XCTAssertTrue(extension_.contains("func consumeOpenedViewOnceOnExit()"),
                      "Le geste appartient à son fichier d'extension.")
        XCTAssertTrue(extension_.contains("pendingViewOnceConsumption.takeAll()"),
                      "Il vide l'attente en la lisant — la seconde porte ne trouve plus rien.")
    }
}
