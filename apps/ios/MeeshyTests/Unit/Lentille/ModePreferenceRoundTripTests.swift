import XCTest
import MeeshySDK
@testable import Meeshy

/// Aller-retour Auto ⇆ forcé sur le store (contrat LWS-8/I-072, §LWS-8
/// « Un mode forcé débraye l'orchestrateur pour cette conversation ; revenir
/// sur 🪄 Auto le réengage — vérifié par aller-retour COMPLET sur le canal
/// préférences »).
///
/// **Suite COMPLÉTÉE par I-073** : couvre le round-trip lui-même
/// (`LentilleModeMenuActions.select` → le magasin de préférence) et sa
/// conséquence sur la décision affichée (`LentilleReadingModeContext
/// .decision`). La bascule multi-appareils réelle reste hors périmètre du
/// store LOCAL de M-048, qui devient un cache optimiste devant le canal
/// serveur seulement à LWS-3.
///
/// **I-073 ajoute** : les deux branches manquantes de
/// `resolveOrchestratorDecision` traversées bout en bout (`.staleAbsence`,
/// `.default` — les quatre branches non-`flagDisabled` sont désormais
/// toutes couvertes par ce fichier).
///
/// **REV-3/B2 met à jour** : le magasin de la liste n'est plus
/// `LocalReadingModePreferenceStore` (clé nue, retiré) mais
/// `LentilleScopedReadingModePreferenceStore`, adaptateur par-dessus le
/// magasin SCOPÉ de F-080. « Séparation par (scope, conversationId) », que
/// l'ancien §4 documentait comme non testable faute d'arbitrage, EST
/// désormais un fait — §5 le prouve, et §6 garde la source contre le retour
/// d'une clé sans identité.
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN`
/// (`apps/ios/meeshy.sh:1591`) : `ModePreferenceRoundTripTests`, phase 1
/// (nom repris tel quel du contrat §LWS-8).
final class ModePreferenceRoundTripTests: XCTestCase {

    // MARK: - Décor

    /// JAMAIS `.standard` (convention du dépôt, cf. `ProviderSubstitutionTests
    /// .withIsolatedDefaults`) : un test qui écrirait la vraie clé laisserait
    /// un résidu visible au lancement suivant, `MeeshyTests` étant hébergé
    /// dans `Meeshy.app`.
    private func withIsolatedStore(_ body: (ReadingModePreferenceStoring) async -> Void) async {
        await withIsolatedStores { center, _, _ in await body(center) }
    }

    /// REV-3/B2 — le magasin de la liste N'EST PLUS un second `UserDefaults`
    /// à clé nue : c'est `LentilleScopedReadingModePreferenceStore`, un
    /// adaptateur par-dessus le magasin scopé de F-080. Ce décor rend les
    /// TROIS pièces (l'adaptateur Lentille, le magasin Focal sous-jacent, le
    /// scope) pour que les témoins croisés puissent écrire d'un côté et lire
    /// de l'autre — la seule façon de prouver « un seul magasin » plutôt que
    /// de la reposter.
    private func withIsolatedStores(
        scope: ReadingModePreferenceScope = .registered(userId: "viewer-1"),
        _ body: (ReadingModePreferenceStoring, FocalReadingModePreferenceStoring, ReadingModePreferenceScope) async -> Void
    ) async {
        let suiteName = "ModePreferenceRoundTripTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        let focalStore = ReadingModePreferenceStore(defaults: defaults)
        let center = LentilleScopedReadingModePreferenceStore(
            store: focalStore,
            scopeProvider: { scope }
        )
        await body(center, focalStore, scope)
        defaults.removePersistentDomain(forName: suiteName)
    }

    private static let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(unreadCount: Int = 999, lastReadAt: Date? = nil) -> MeeshyConversation {
        MeeshyConversation(
            id: "conv-roundtrip",
            identifier: "conv-roundtrip",
            type: .group,
            title: "Equipe Produit",
            lastMessageAt: Self.now,
            createdAt: Self.now,
            updatedAt: Self.now,
            userState: ConversationUserState(unreadCount: unreadCount, lastReadAt: lastReadAt)
        )
    }

    // MARK: - 1. Le magasin lui-même — Auto ⇆ forcé

    /// Défaut `.auto` tant que rien n'est mémorisé (M-048, contrat
    /// `ReadingModePreferenceStoring.get` : « rend la main à l'orchestrateur,
    /// jamais un mode figé par défaut »).
    func test_store_defaultsToAuto_whenNothingMemorized() async {
        await withIsolatedStore { store in
            let value = await store.get(conversationId: "never-touched")
            XCTAssertEqual(value, .auto)
        }
    }

    /// Aller : Auto → forcé (`.script`), écriture optimiste immédiate.
    func test_store_writesAForcedMode_readBackImmediately() async {
        await withIsolatedStore { store in
            await store.set(conversationId: "conv-1", value: .script, optimistic: true)
            let value = await store.get(conversationId: "conv-1")
            XCTAssertEqual(value, .script)
        }
    }

    /// Retour : forcé → Auto — PAS un no-op, `.auto` doit être RÉÉCRIT et
    /// relu, exactement comme n'importe quelle autre valeur (contrat : « un
    /// mode forcé débraye… revenir sur Auto le réengage »).
    func test_store_roundTrip_forcedBackToAuto_isWrittenAndReadBack() async {
        await withIsolatedStore { store in
            await store.set(conversationId: "conv-1", value: .resume, optimistic: true)
            let forced = await store.get(conversationId: "conv-1")
            XCTAssertEqual(forced, .resume, "Prérequis : le forçage a pris.")

            await store.set(conversationId: "conv-1", value: .auto, optimistic: true)
            let backToAuto = await store.get(conversationId: "conv-1")
            XCTAssertEqual(
                backToAuto, .auto,
                "Revenir sur Auto doit être un aller-retour COMPLET, pas un état qui reste " +
                "coincé sur le dernier mode forcé."
            )
        }
    }

    /// Isolation par conversation : forcer le mode d'UNE conversation ne doit
    /// jamais affecter une autre — sinon « UNE préférence » (contrat) serait
    /// vraie par accident (une seule conversation testée) plutôt que par
    /// construction (clé `(conversationId)`).
    func test_store_isolatesPreferenceByConversation() async {
        await withIsolatedStore { store in
            await store.set(conversationId: "conv-a", value: .script, optimistic: true)
            let conversationA = await store.get(conversationId: "conv-a")
            XCTAssertEqual(conversationA, .script)
            let conversationB = await store.get(conversationId: "conv-b")
            XCTAssertEqual(
                conversationB, .auto,
                "Une conversation jamais touchée ne doit RIEN hériter du forçage d'une autre."
            )
        }
    }

    // MARK: - 2. `LentilleModeMenuActions.select` — le point d'écriture partagé

    /// Les trois points d'entrée (encoche, sous-menu, aperçu) passent tous
    /// par `LentilleModeMenuActions.select` : ce témoin prouve que cette
    /// fonction ATTEINT bien le magasin injecté (pas un `.shared` figé), et
    /// que l'écriture se propage même lancée en tâche détachée (comme au
    /// site d'appel réel, `LentilleModeMenu.onSelect`).
    func test_menuActionsSelect_reachesTheInjectedStore() async {
        await withIsolatedStore { store in
            LentilleModeMenuActions.select(.script, conversationId: "conv-1", store: store)

            // `select` lance une `Task` détachée (comme au site d'appel
            // réel) : quelques cessions de l'exécuteur suffisent à la laisser
            // courir sur une écriture `UserDefaults` synchrone en pratique.
            var observed: ReadingModeOrchestrator.ReadingModePreference = .auto
            for _ in 0..<50 {
                observed = await store.get(conversationId: "conv-1")
                if observed == .script { break }
                await Task.yield()
            }
            XCTAssertEqual(observed, .script)
        }
    }

    // MARK: - 3. Conséquence sur la décision — Auto réengage l'orchestrateur

    /// Bout en bout : forcer `.script` sur une conversation dont la loi
    /// numérique rendrait `.summary` (non-lus massifs) doit quand même
    /// afficher `.script` — puis revenir à `.auto` doit RENDRE LA MAIN à la
    /// loi numérique, qui retrouve `.summary`. Un seul témoin qui prouve que
    /// « Auto réengage l'orchestrateur » n'est pas qu'une écriture de
    /// magasin isolée : c'est la DÉCISION AFFICHÉE qui doit changer.
    func test_decision_reflectsTheRoundTrip_forcedThenBackToAuto() async {
        await withIsolatedStore { store in
            let conversation = makeConversation(unreadCount: ReadingModeOrchestrator.unreadCap + 5, lastReadAt: nil)

            await store.set(conversationId: conversation.id, value: .script, optimistic: true)
            let forced = await store.get(conversationId: conversation.id)
            let forcedDecision = LentilleReadingModeContext.decision(
                for: conversation, preference: forced, isAnonymous: false, isLentilleFlagEnabled: true, now: Self.now
            )
            XCTAssertEqual(forcedDecision.mode, .script)
            XCTAssertEqual(forcedDecision.reason, .sticky)

            await store.set(conversationId: conversation.id, value: .auto, optimistic: true)
            let backToAuto = await store.get(conversationId: conversation.id)
            let autoDecision = LentilleReadingModeContext.decision(
                for: conversation, preference: backToAuto, isAnonymous: false, isLentilleFlagEnabled: true, now: Self.now
            )
            XCTAssertEqual(
                autoDecision.mode, .summary,
                "Revenu sur Auto, la loi NUMÉRIQUE doit reprendre la main — ici le plafond " +
                "de non-lus, masqué pendant que `.script` était collant."
            )
            XCTAssertEqual(autoDecision.reason, .unreadOverCap)
            XCTAssertNotEqual(
                forcedDecision.mode, autoDecision.mode,
                "Discrimination (leçon 266) : si forcé et Auto rendaient le MÊME mode ici, " +
                "ce témoin ne prouverait rien — l'écart entre `.script` (collant) et " +
                "`.summary` (numérique) est ce qui rend le round-trip visible."
            )
        }
    }

    /// I-073 — même round-trip, branche `.staleAbsence` de
    /// `resolveOrchestratorDecision` (§ table du contrat, branche 4 : absence
    /// ET `unreadCount >= 10`). Avec le test précédent (branche 2 `.sticky` et
    /// branche 3 `.unreadOverCap`) et le suivant (branche 5 `.default`), les
    /// QUATRE branches non-`flagDisabled` sont désormais toutes traversées
    /// bout en bout via `LentilleReadingModeContext.decision` — la
    /// cinquième, `.flagDisabled`, est hors de propos ici : le menu de mode
    /// n'existe pas drapeau éteint (aucun des trois points d'entrée n'est
    /// monté, `ModeMenuModelTests`/`+Overlays.swift`).
    func test_decision_reflectsTheRoundTrip_forcedThenBackToAuto_staleAbsenceBranch() async {
        await withIsolatedStore { store in
            // `unreadCount` dans [absenceUnreadFloor, unreadCap] (10…25) et
            // `lastReadAt = nil` (jamais ouverte ⇒ absence VRAIE dès la
            // première condition d'`isReaderAbsent`, sans même consulter la
            // fenêtre de 24 h) : la seule combinaison qui active la branche 4
            // sans passer par la branche 3 (`unreadOverCap`, qui sature au-delà
            // de 25 et masquerait celle-ci).
            let conversation = makeConversation(unreadCount: 15, lastReadAt: nil)

            await store.set(conversationId: conversation.id, value: .focal, optimistic: true)
            let forced = await store.get(conversationId: conversation.id)
            let forcedDecision = LentilleReadingModeContext.decision(
                for: conversation, preference: forced, isAnonymous: false, isLentilleFlagEnabled: true, now: Self.now
            )
            XCTAssertEqual(forcedDecision.mode, .focal)
            XCTAssertEqual(forcedDecision.reason, .sticky)

            await store.set(conversationId: conversation.id, value: .auto, optimistic: true)
            let backToAuto = await store.get(conversationId: conversation.id)
            let autoDecision = LentilleReadingModeContext.decision(
                for: conversation, preference: backToAuto, isAnonymous: false, isLentilleFlagEnabled: true, now: Self.now
            )
            XCTAssertEqual(
                autoDecision.mode, .summary,
                "Revenu sur Auto, un lecteur absent avec ≥10 non-lus doit retrouver le " +
                "Résumé Vivant — la branche « absence » de l'orchestrateur, masquée pendant " +
                "que `.focal` était collant."
            )
            XCTAssertEqual(
                autoDecision.reason, .staleAbsence,
                "La RAISON doit distinguer cette branche de `.unreadOverCap` : même mode " +
                "rendu (`.summary`), motif différent — l'encoche « AUTO · Résumé » reste " +
                "identique dans les deux cas, mais un futur libellé de raison (hors " +
                "périmètre LWS-8) doit pouvoir les distinguer."
            )
            XCTAssertNotEqual(forcedDecision.mode, autoDecision.mode)
        }
    }

    /// I-073 — branche `.default` (§ branche 5, repli `.focal` numérique) :
    /// aucun forçage, aucun non-lu massif, aucune absence — l'orchestrateur
    /// rend son repli de base. Complète la matrice des quatre branches
    /// atteignables drapeau ON avec le test précédent et celui du haut de ce
    /// fichier.
    func test_decision_reflectsTheRoundTrip_forcedThenBackToAuto_defaultBranch() async {
        await withIsolatedStore { store in
            // `unreadCount = 0` : sous le plancher d'absence (10) ET sous le
            // plafond (25) — les branches 3 et 4 sont donc structurellement
            // hors jeu, quelle que soit `lastReadAt`. `lastReadAt = Self.now`
            // documente quand même une lecture récente : la branche par
            // défaut n'a besoin d'AUCUNE des deux conditions numériques, pas
            // seulement de l'absence d'un forçage.
            let conversation = makeConversation(unreadCount: 0, lastReadAt: Self.now)

            await store.set(conversationId: conversation.id, value: .script, optimistic: true)
            let forced = await store.get(conversationId: conversation.id)
            let forcedDecision = LentilleReadingModeContext.decision(
                for: conversation, preference: forced, isAnonymous: false, isLentilleFlagEnabled: true, now: Self.now
            )
            XCTAssertEqual(forcedDecision.mode, .script)
            XCTAssertEqual(forcedDecision.reason, .sticky)

            await store.set(conversationId: conversation.id, value: .auto, optimistic: true)
            let backToAuto = await store.get(conversationId: conversation.id)
            let autoDecision = LentilleReadingModeContext.decision(
                for: conversation, preference: backToAuto, isAnonymous: false, isLentilleFlagEnabled: true, now: Self.now
            )
            XCTAssertEqual(
                autoDecision.mode, .focal,
                "Revenu sur Auto sans aucun signal numérique, l'orchestrateur retombe sur " +
                "son repli de base — `.focal`, le plancher de la loi (§ commentaire " +
                "`clampFallbackMode`)."
            )
            XCTAssertEqual(autoDecision.reason, .default)
            XCTAssertNotEqual(
                forcedDecision.mode, autoDecision.mode,
                "Discrimination : `.script` forcé vs `.focal` par défaut — un round-trip qui " +
                "rendrait `.focal` dans les DEUX états ne prouverait rien (leçon 266)."
            )
        }
    }

    // MARK: - 4. UN SEUL magasin — aller-retour CROISÉ liste ⇄ fil (REV-3/B2)

    /// Écrit par le centre Lentille (la liste), relu par le magasin Focal (le
    /// fil ouvert) — même scope, même conversation. Avant l'arbitrage B2, ce
    /// témoin était IMPOSSIBLE : les deux côtés visaient des clés `UserDefaults`
    /// différentes (`meeshy_readmode_<scopeKey>_<id>` d'un côté, une clé nue de
    /// l'autre), et un mode choisi dans la liste n'existait tout simplement pas
    /// pour le fil.
    func test_crossRoundTrip_writtenByTheLentilleCenter_isReadByTheFocalStore() async {
        await withIsolatedStores { center, focalStore, scope in
            await center.set(conversationId: "conv-x", value: .riviere, optimistic: true)

            XCTAssertEqual(
                focalStore.mode(for: "conv-x", scope: scope), .river,
                "Le fil doit LIRE le choix fait dans la liste — c'est la définition de " +
                "« un seul magasin ». `.riviere` (préférence, mots du menu) est mémorisé " +
                "en `.river` (mode RENDU), la seule traduction que le magasin scopé connaisse."
            )
        }
    }

    /// Réciproque : écrit par le fil (`ReadingModePreferenceStore`, l'API que
    /// `ReadingModeController.select` utilise), relu par le centre Lentille.
    /// Les deux sens comptent — un adaptateur qui n'écrirait au bon endroit
    /// qu'à l'aller laisserait la liste afficher `.auto` sur une conversation
    /// que le lecteur a figée depuis le fil.
    func test_crossRoundTrip_writtenByTheFocalStore_isReadByTheLentilleCenter() async {
        await withIsolatedStores { center, focalStore, scope in
            focalStore.setMode(.summary, for: "conv-y", scope: scope)

            let observed = await center.get(conversationId: "conv-y")
            XCTAssertEqual(
                observed, .resume,
                "La liste doit LIRE le choix fait dans le fil. `.summary` (mode rendu) se " +
                "relit `.resume` (le mot du menu) — `ReadingModePreferenceMapping`, l'unique " +
                "table de traduction de l'app."
            )
        }
    }

    /// « Revenir en Auto » depuis la liste doit EFFACER la clé scopée, pas
    /// écrire un troisième état : le fil interprète `nil` comme « rendre la
    /// main à l'orchestrateur » (§WS-1), et un marqueur « auto » en dur y
    /// serait relu comme un mode inconnu.
    func test_crossRoundTrip_backToAuto_clearsTheScopedKeyForTheThread() async {
        await withIsolatedStores { center, focalStore, scope in
            await center.set(conversationId: "conv-z", value: .script, optimistic: true)
            XCTAssertEqual(focalStore.mode(for: "conv-z", scope: scope), .script, "Prérequis : le forçage a pris.")

            await center.set(conversationId: "conv-z", value: .auto, optimistic: true)
            XCTAssertNil(
                focalStore.mode(for: "conv-z", scope: scope),
                "Auto = ABSENCE de clé côté fil, jamais une valeur « auto » écrite en dur."
            )
        }
    }

    // MARK: - 5. Séparation par IDENTITÉ — deux scopes, deux valeurs (REV-3/B2)

    /// La raison d'être du préfixe d'identité (fuite privacy multi-comptes du
    /// 2026-05-26, `ReadingModePreferenceStore` §60-63) : deux lecteurs du
    /// MÊME appareil, sur la MÊME conversation, ne partagent pas leur mode.
    /// C'était exactement ce que la clé nue de l'ancien magasin de liste ne
    /// savait pas faire — ce témoin est le contre-poison.
    func test_identitySeparation_twoScopes_holdTwoDistinctPreferences() async {
        let suiteName = "ModePreferenceRoundTripTests-identity-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let focalStore = ReadingModePreferenceStore(defaults: defaults)
        let alice = LentilleScopedReadingModePreferenceStore(
            store: focalStore,
            scopeProvider: { .registered(userId: "alice") }
        )
        let bob = LentilleScopedReadingModePreferenceStore(
            store: focalStore,
            scopeProvider: { .registered(userId: "bob") }
        )

        await alice.set(conversationId: "shared-conv", value: .script, optimistic: true)
        await bob.set(conversationId: "shared-conv", value: .resume, optimistic: true)

        let aliceValue = await alice.get(conversationId: "shared-conv")
        let bobValue = await bob.get(conversationId: "shared-conv")

        XCTAssertEqual(aliceValue, .script)
        XCTAssertEqual(bobValue, .resume)
        XCTAssertNotEqual(
            aliceValue, bobValue,
            "Discrimination (leçon 266) : si les deux scopes rendaient la même valeur, ce " +
            "témoin serait vert avec une clé NON scopée — c'est-à-dire vert sur le défaut " +
            "qu'il est censé interdire."
        )
    }

    /// Un invité et un inscrit du même appareil sont eux aussi séparés — et
    /// l'identifiant anonyme n'apparaît JAMAIS en clair au repos (hash
    /// tronqué, `ReadingModePreferenceScope.storageKey`). Le troisième lecteur
    /// ci-dessous n'a jamais rien écrit : il doit voir `.auto`, pas l'héritage
    /// d'un autre compte.
    func test_identitySeparation_anonymousAndRegistered_doNotShareAPreference() async {
        let suiteName = "ModePreferenceRoundTripTests-identity-anon-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        let focalStore = ReadingModePreferenceStore(defaults: defaults)
        let guest = LentilleScopedReadingModePreferenceStore(
            store: focalStore,
            scopeProvider: { .anonymous(participantId: "participant-42") }
        )
        let member = LentilleScopedReadingModePreferenceStore(
            store: focalStore,
            scopeProvider: { .registered(userId: "participant-42") }
        )
        let otherGuest = LentilleScopedReadingModePreferenceStore(
            store: focalStore,
            scopeProvider: { .anonymous(participantId: "participant-99") }
        )

        await guest.set(conversationId: "c", value: .focal, optimistic: true)

        let guestValue = await guest.get(conversationId: "c")
        let memberValue = await member.get(conversationId: "c")
        let otherGuestValue = await otherGuest.get(conversationId: "c")

        XCTAssertEqual(guestValue, .focal)
        XCTAssertEqual(
            memberValue, .auto,
            "Un `userId` inscrit et un `participantId` anonyme de MÊME texte ne doivent pas " +
            "collider : les préfixes `u_`/`a_` du `storageKey` les séparent."
        )
        XCTAssertEqual(
            otherGuestValue, .auto,
            "Deux sessions invitées du même appareil restent étanches — le cas nommé par la " +
            "fuite du 2026-05-26."
        )

        let storedKeys = defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix("meeshy_readmode_") }
        XCTAssertEqual(storedKeys.count, 1, "Une seule écriture, une seule clé.")
        XCTAssertFalse(
            storedKeys.contains { $0.contains("participant-42") },
            "L'identifiant anonyme ne doit JAMAIS apparaître en clair au repos — hash SHA-256 " +
            "tronqué (`ReadingModePreferenceScope.truncatedHash`)."
        )
    }

    // MARK: - 6. Garde source — plus AUCUNE clé de mode sans scope (REV-3/B2)

    /// L'arbitrage B2 est tranché : le magasin scopé de F-080 est LE magasin.
    /// Cette garde verrouille l'état d'arrivée — plus aucune ligne de CODE de
    /// l'app ne nomme une clé `UserDefaults` de mode de lecture dépourvue de
    /// préfixe d'identité. Elle remplace le témoin précédent, qui verrouillait
    /// l'ABSENCE d'arbitrage (« deux scopes n'est un fait testable nulle part »)
    /// — une vérité qui a cessé de l'être.
    ///
    /// Commentaires exclus (`AppSourceGuard.stripComments`) : le commentaire
    /// pierre tombale de `LentilleProviders.swift` et la décision de
    /// non-migration de `LentilleReadingModeContext.swift` CITENT l'ancien
    /// préfixe pour expliquer sa disparition. Un texte n'écrit pas une clé ;
    /// c'est le code qui est gardé.
    func test_sourceGuard_noUnscopedReadingModeUserDefaultsKeyRemains() throws {
        let appRoot = Self.iosRoot.appendingPathComponent("Meeshy")
        var offenders: [String] = []

        let enumerator = try XCTUnwrap(
            FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        )
        var scanned = 0
        for case let url as URL in enumerator where url.pathExtension == "swift" {
            let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            scanned += 1
            if code.contains("meeshy.readingMode.") {
                offenders.append(url.lastPathComponent)
            }
        }

        XCTAssertGreaterThan(scanned, 100, "Prérequis : l'énumération doit avoir vu l'arborescence de l'app.")
        XCTAssertEqual(
            offenders, [],
            "Une clé de mode de lecture SANS préfixe d'identité est réapparue dans " +
            "\(offenders) — c'est la fuite privacy multi-comptes du 2026-05-26 qui revient, " +
            "et le second magasin disjoint que REV-3/B2 a fermé."
        )
    }

    /// Contre-épreuve de la garde ci-dessus (elle passerait toute seule sur une
    /// arborescence vide) : le préfixe SCOPÉ, lui, doit bien être présent — et
    /// dans un SEUL fichier, celui qui possède le calcul de clé.
    func test_sourceGuard_theScopedPrefixLivesInExactlyOneFile() throws {
        let appRoot = Self.iosRoot.appendingPathComponent("Meeshy")
        var holders: [String] = []

        let enumerator = try XCTUnwrap(
            FileManager.default.enumerator(at: appRoot, includingPropertiesForKeys: nil)
        )
        for case let url as URL in enumerator where url.pathExtension == "swift" {
            let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            if code.contains("meeshy_readmode_") {
                holders.append(url.lastPathComponent)
            }
        }

        XCTAssertEqual(
            holders, ["ReadingModePreferenceStore.swift"],
            "Le préfixe de clé scopé doit rester l'affaire exclusive du magasin qui le " +
            "calcule. L'adaptateur Lentille passe par lui, il ne recopie pas la clé."
        )
    }

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }
}
