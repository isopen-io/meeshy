import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #18873 — la fiche d'un autre rend UN écran par ce qu'elle sait : squelette sur cache vide seulement (loi 8),
/// erreur avec « Réessayer », hors ligne le cache répond, introuvable et privé se confondent (loi 9).
final class ProfileSheetPhaseTests: XCTestCase {

    private func phase(blockedByMe: Bool = false,
                       unavailable: Bool = false,
                       hasProfile: Bool = false,
                       loading: Bool = false,
                       failure: ProfileLoadFailure? = nil,
                       cachedAge: TimeInterval? = nil) -> ProfileSheetPhase {
        ProfileSheetPhase.resolve(isBlockedByMe: blockedByMe, isUnavailable: unavailable, hasProfile: hasProfile,
                                  isLoading: loading, failure: failure, cachedAge: cachedAge)
    }

    func test_resolve_emptyCacheWhileLoading_isTheSkeleton() {
        XCTAssertEqual(phase(loading: true), .skeleton)
    }

    func test_resolve_aCachedProfileWhileLoading_isNeverTheSkeleton() {
        XCTAssertEqual(phase(hasProfile: true, loading: true), .shown(fallback: nil))
    }

    func test_resolve_emptyCacheAndAFailure_isTheErrorWithItsCause() {
        XCTAssertEqual(phase(failure: .offline), .failed(.offline))
        XCTAssertEqual(phase(failure: .unreachable), .failed(.unreachable))
    }

    func test_resolve_aCachedProfileAndAFailure_servesTheCacheAndSaysItsAge() {
        XCTAssertEqual(phase(hasProfile: true, failure: .offline, cachedAge: 10_800),
                       .shown(fallback: ProfileCacheFallback(failure: .offline, age: 10_800)))
    }

    func test_resolve_unavailableWins_overACacheOrAFailure() {
        XCTAssertEqual(phase(unavailable: true, hasProfile: true, failure: .offline), .unavailable)
        XCTAssertEqual(phase(unavailable: true, loading: true), .unavailable)
    }

    func test_resolve_myOwnBlock_isTheReducedSheet() {
        XCTAssertEqual(phase(blockedByMe: true, hasProfile: true), .blockedByMe)
        XCTAssertEqual(phase(blockedByMe: true, unavailable: true), .blockedByMe)
    }

    func test_resolve_theSeedWithoutCacheNorFailure_isShown() {
        XCTAssertEqual(phase(), .shown(fallback: nil))
    }

    func test_faceSelector_onlySitsOnASheet_readOrBeingPainted() {
        XCTAssertTrue(ProfileSheetPhase.shown(fallback: nil).showsFaceSelector)
        XCTAssertTrue(ProfileSheetPhase.shown(fallback: ProfileCacheFallback(failure: .offline, age: 1)).showsFaceSelector)
        XCTAssertTrue(ProfileSheetPhase.skeleton.showsFaceSelector)
        XCTAssertFalse(ProfileSheetPhase.failed(.offline).showsFaceSelector)
        XCTAssertFalse(ProfileSheetPhase.unavailable.showsFaceSelector)
        XCTAssertFalse(ProfileSheetPhase.blockedByMe.showsFaceSelector)
    }

    func test_isOffline_onlyWhenTheNetworkIsMissing() {
        XCTAssertTrue(ProfileSheetPhase.shown(fallback: ProfileCacheFallback(failure: .offline, age: 1)).isOffline)
        XCTAssertTrue(ProfileSheetPhase.failed(.offline).isOffline)
        XCTAssertFalse(ProfileSheetPhase.shown(fallback: ProfileCacheFallback(failure: .unreachable, age: 1)).isOffline)
        XCTAssertFalse(ProfileSheetPhase.shown(fallback: nil).isOffline)
    }

    func test_fallback_neverCarriesANegativeAge() {
        XCTAssertEqual(ProfileCacheFallback(failure: .offline, age: -5).age, 0)
    }

    func test_classify_readsEveryShapeOfAMissingNetwork() {
        XCTAssertEqual(ProfileLoadFailure.classify(URLError(.notConnectedToInternet)), .offline)
        XCTAssertEqual(ProfileLoadFailure.classify(URLError(.timedOut)), .offline)
        XCTAssertEqual(ProfileLoadFailure.classify(MeeshyError.network(.noConnection)), .offline)
        XCTAssertEqual(ProfileLoadFailure.classify(MeeshyError.unknown(URLError(.networkConnectionLost))), .offline)
    }

    func test_classify_aServerThatAnswersBadly_isUnreachable() {
        XCTAssertEqual(ProfileLoadFailure.classify(MeeshyError.server(statusCode: 500, message: "boom")), .unreachable)
        XCTAssertEqual(ProfileLoadFailure.classify(MeeshyError.network(.serverUnreachable)), .unreachable)
        XCTAssertEqual(ProfileLoadFailure.classify(URLError(.badServerResponse)), .unreachable)
    }

    /// Planche `Etat-Erreur` vue 1 — une passerelle tombée dit « Serveur injoignable » par les deux chemins : l'erreur
    /// brute du transport et la même normalisée par le pipeline.
    func test_classify_aRawTransportErrorAndItsPipelineForm_agree() {
        XCTAssertEqual(ProfileLoadFailure.classify(URLError(.cannotConnectToHost)),
                       ProfileLoadFailure.classify(MeeshyError.network(.serverUnreachable)))
        XCTAssertEqual(ProfileLoadFailure.classify(URLError(.cannotFindHost)), .unreachable)
        XCTAssertEqual(ProfileLoadFailure.classify(URLError(.dnsLookupFailed)), .unreachable)
        XCTAssertEqual(ProfileLoadFailure.classify(URLError(.timedOut)),
                       ProfileLoadFailure.classify(MeeshyError.network(.timeout)))
    }

    /// Planche `Etat-Vide` — un vide a toujours une sortie quand il y en a une : « Envoyer un premier message » sous
    /// « Aucune conversation en commun », et chez un autre, « Léo n'a encore rien publié ». Le tout fait du kit (K38).
    func test_emptyStates_areStateBlocksOfTheKit_withAnExit() throws {
        let profile = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile")
        let common = try String(contentsOf: profile.appendingPathComponent("UserProfileSheet+ConversationsTab.swift"), encoding: .utf8)
        XCTAssertTrue(common.contains("MeeshyStateBlock("))
        XCTAssertTrue(common.contains("\"profile.conversations.firstMessage\""))
        let posts = try String(contentsOf: profile.appendingPathComponent("UserProfileSheet+PostsTab.swift"), encoding: .utf8)
        XCTAssertTrue(posts.contains("MeeshyStateBlock("))
        XCTAssertTrue(posts.contains("MeeshySkeleton("))
        XCTAssertFalse(posts.contains(".shimmer()"), "le squelette est celui du kit")
    }
}

/// #18873 — planche `Etat-Bloque` : nos conversations restent, en lecture seule, quand je l'ai bloqué ; il m'a bloqué
/// ou le profil est introuvable, elles ferment.
final class ProfileSharedConversationAccessTests: XCTestCase {

    func test_resolve_sansBlocage_ouvreLaConversation() {
        XCTAssertEqual(ProfileSharedConversationAccess.resolve(isBlockedByMe: false, isUnavailable: false), .open)
    }

    func test_resolve_jeLAiBloque_ouvreEnLectureSeule() {
        XCTAssertEqual(ProfileSharedConversationAccess.resolve(isBlockedByMe: true, isUnavailable: false), .readOnly)
    }

    func test_resolve_introuvableOuIlMABloque_ferme_memeSiJeLAiBloque() {
        XCTAssertEqual(ProfileSharedConversationAccess.resolve(isBlockedByMe: false, isUnavailable: true), .closed)
        XCTAssertEqual(ProfileSharedConversationAccess.resolve(isBlockedByMe: true, isUnavailable: true), .closed)
    }
}

/// #18873 — planche `Etat-Introuvable` : « Chercher quelqu'un » puis « Scanner un QR » quand l'app les offre, et
/// toujours « Retour » en dernier ; jamais un écran sans sortie.
final class ProfileUnavailableExitTests: XCTestCase {

    func test_resolve_lesDeuxOfferts_chercherScannerPuisRetour() {
        XCTAssertEqual(ProfileUnavailableExit.resolve(canSearch: true, canScan: true), [.search, .scan, .back])
    }

    func test_resolve_unSeulOffert_retourEnDernier() {
        XCTAssertEqual(ProfileUnavailableExit.resolve(canSearch: true, canScan: false), [.search, .back])
        XCTAssertEqual(ProfileUnavailableExit.resolve(canSearch: false, canScan: true), [.scan, .back])
    }

    func test_resolve_rienDOffert_retourSeulement() {
        XCTAssertEqual(ProfileUnavailableExit.resolve(canSearch: false, canScan: false), [.back])
    }

    /// « Tu cherchais peut-être » : la fiche se ferme d'abord, la suggestion s'ouvre ensuite — sinon la fermeture
    /// efface la personne qu'on vient de poser sur la même liaison (lien profond).
    @MainActor
    func test_suggestion_fermeDAbordPuisOuvreLaPersonneSuggeree() async throws {
        let router = SuggestionRouterSpy()
        let exits = ProfileUnavailableExits(openSuggestion: { router.shown = $0.username })
        let person = UserSearchResult(id: "u-leo", username: "leo.marchetti", displayName: "Léo")

        exits.openSuggestionClosingFirst(person, close: { router.shown = nil }, delay: .zero)
        let afterClose = router.shown
        try await Task.sleep(for: .milliseconds(50))

        XCTAssertNil(afterClose)
        XCTAssertEqual(router.shown, "leo.marchetti")
    }
}

@MainActor
private final class SuggestionRouterSpy {
    nonisolated deinit {}
    var shown: String? = "leo.m"
}

/// #18873 — planche `Etat-HorsLigne` : hors ligne, « Écrire » reste offert (le message part au retour du réseau),
/// « Appeler » et « Vidéo » se ferment et le disent ; en ligne, rien ne s'ajoute.
final class ProfileTalkReachTests: XCTestCase {

    func test_resolve_enLigne_aucuneMention() {
        XCTAssertEqual(ProfileTalkReach.resolve(.write, isOffline: false), .available)
        XCTAssertEqual(ProfileTalkReach.resolve(.call, isOffline: false), .available)
    }

    func test_resolve_horsLigne_ecrirePartiraAuRetour() {
        XCTAssertEqual(ProfileTalkReach.resolve(.write, isOffline: true), .queued)
    }

    func test_resolve_horsLigne_appelsFermes() {
        XCTAssertEqual(ProfileTalkReach.resolve(.call, isOffline: true), .needsNetwork)
        XCTAssertEqual(ProfileTalkReach.resolve(.video, isOffline: true), .needsNetwork)
    }

    /// Hors ligne, « Écrire » ne promet « sera envoyé » que pour une conversation directe déjà connue.
    func test_resolve_horsLigne_premiereConversation_attendLeReseau() {
        XCTAssertEqual(ProfileTalkReach.resolve(.write, isOffline: true, knowsDirect: true), .queued)
        XCTAssertEqual(ProfileTalkReach.resolve(.write, isOffline: true, knowsDirect: false), .needsNetwork)
        XCTAssertEqual(ProfileTalkReach.resolve(.write, isOffline: false, knowsDirect: false), .available)
    }

    /// La connectivité observée par l'app prime sur le dernier chargement : réseau rétabli ⇒ les appels rouvrent.
    func test_isOffline_suitLaConnectiviteObservee() {
        let offlineFallback = ProfileSheetPhase.shown(fallback: ProfileCacheFallback(failure: .offline, age: 60))

        XCTAssertEqual(ProfileTalkReach.resolve(.call, isOffline: ProfileTalkReach.isOffline(offlineFallback, network: false)),
                       .available)
        XCTAssertTrue(ProfileTalkReach.isOffline(.shown(fallback: nil), network: true))
        XCTAssertTrue(ProfileTalkReach.isOffline(offlineFallback, network: nil))
    }

    func test_reloadsOnReconnect_seulementAuRetourDuReseauSurUneFicheLueDuCache() {
        let offlineFallback = ProfileSheetPhase.shown(fallback: ProfileCacheFallback(failure: .offline, age: 60))

        XCTAssertTrue(ProfileTalkReach.reloadsOnReconnect(from: true, to: false, phase: offlineFallback))
        XCTAssertFalse(ProfileTalkReach.reloadsOnReconnect(from: false, to: true, phase: offlineFallback))
        XCTAssertFalse(ProfileTalkReach.reloadsOnReconnect(from: true, to: false, phase: .shown(fallback: nil)))
    }

    func test_isOffline_seulementQuandLaFicheVientDuCacheFauteDeReseau() {
        let offline = ProfileSheetPhase.shown(fallback: ProfileCacheFallback(failure: .offline, age: 60))
        let serverDown = ProfileSheetPhase.shown(fallback: ProfileCacheFallback(failure: .unreachable, age: 60))

        XCTAssertTrue(ProfileTalkReach.isOffline(offline))
        XCTAssertFalse(ProfileTalkReach.isOffline(serverDown))
        XCTAssertFalse(ProfileTalkReach.isOffline(.shown(fallback: nil)))
    }
}

/// #18873 — planche `Etat-Introuvable` : « Tu cherchais peut-être » propose un pseudo voisin de l'adresse demandée,
/// jamais celui-là même — introuvable et privé se confondent (loi 9), la suggestion ne doit pas trahir qu'il existe.
final class ProfileUnavailableSuggestionTests: XCTestCase {

    private func person(_ username: String, id: String? = nil) -> UserSearchResult {
        UserSearchResult(id: id ?? username, username: username, displayName: username.capitalized)
    }

    func test_pick_unPseudoAUneFauteDeFrappe_estPropose() {
        let picked = ProfileUnavailableSuggestion.pick(requested: "leo.marcheti",
                                                       among: [person("leo.marchetti"), person("sofia.b")])
        XCTAssertEqual(picked?.username, "leo.marchetti")
    }

    func test_pick_lePseudoDemandeLuiMeme_nEstJamaisPropose() {
        let picked = ProfileUnavailableSuggestion.pick(requested: "Leo.M", among: [person("leo.m"), person("leo.mm")])
        XCTAssertEqual(picked?.username, "leo.mm", "l'adresse demandée se tait, même servie par la recherche")
    }

    func test_pick_leTropLointain_nEstPasPropose() {
        XCTAssertNil(ProfileUnavailableSuggestion.pick(requested: "leo.m", among: [person("aissa"), person("rui.costa")]))
    }

    func test_pick_lePlusProche_gagne_puisLOrdreDeLaRecherche() {
        let picked = ProfileUnavailableSuggestion.pick(requested: "leom",
                                                       among: [person("leo.mx"), person("leo.m"), person("le.om")])
        XCTAssertEqual(picked?.username, "leo.m")
        let tie = ProfileUnavailableSuggestion.pick(requested: "abcd", among: [person("abce"), person("abcf")])
        XCTAssertEqual(tie?.username, "abce")
    }

    func test_pick_sansAdresseDemandee_rien() {
        XCTAssertNil(ProfileUnavailableSuggestion.pick(requested: "", among: [person("a")]))
    }
}
