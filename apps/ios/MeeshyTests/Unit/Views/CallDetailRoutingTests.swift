import XCTest
@testable import Meeshy

@MainActor
final class CallDetailRoutingTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **Le geste a bougé DEUX FOIS, et la seconde fois pour une raison que la
    /// première ignorait (directive 2026-08-24, second passage).**
    ///
    /// Le 2026-07-03, un audit « pocket-dial » avait protégé le tap. Au premier
    /// passage du 2026-08-24, le geste a été INVERSÉ — l'appui long rappelait,
    /// le tap ne faisait plus rien. Correct sur l'intention (l'appel est
    /// l'action la plus lourde du fil), FAUX sur le moyen : l'appui long
    /// n'était pas libre. C'est le geste qui ouvre, PARTOUT ailleurs dans le
    /// fil, les options habituelles d'un message — et une carte système qui se
    /// l'approprie ne « gagne » pas un geste, elle en VOLE un.
    ///
    /// Le double tap n'appartient, lui, à personne : il est délibéré (deux
    /// contacts, donc pas de déclenchement au défilement) sans rien confisquer.
    /// L'appui long RETOURNE donc à sa fonction universelle, et le double tap
    /// prend l'action propre à la carte.
    ///
    /// La garde est NÉGATIVE sur `onLongPressGesture` : sans elle, réintroduire
    /// un appui long ici redeviendrait invisible — la carte marcherait, et
    /// c'est le menu du message qui disparaîtrait en silence.
    func test_bubbleCallNoticeView_callsBackOnDoubleTap_andNeverStealsTheLongPress() throws {
        let view = try source("Features/Main/Views/Bubble/BubbleCallNoticeView.swift")
        XCTAssertTrue(
            view.contains(".onTapGesture(count: 2)"),
            "rappeler exige un double tap délibéré"
        )
        XCTAssertFalse(
            view.contains(".onLongPressGesture"),
            "l'appui long appartient au menu du message — la carte d'appel ne doit pas le capter"
        )
        XCTAssertFalse(
            view.contains("Button {\n                onCallBack?(summary)"),
            "aucun tap SIMPLE ne doit poser d'appel depuis la carte du fil"
        )
        XCTAssertFalse(
            view.contains("showDetails = true"),
            "BubbleCallNoticeView must no longer present its own local CallSummaryDetailSheet — " +
            "the gesture now routes through the shared decision point."
        )
    }

    /// L'avis d'arrivée suit la MÊME loi que la carte d'appel : double tap pour
    /// sa propre action (la fiche de participation — identité ET conditions
    /// d'entrée), appui long laissé au menu du message.
    func test_bubbleJoinNoticeView_opensTheParticipantSheetOnDoubleTap() throws {
        let view = try source("Features/Main/Views/Bubble/BubbleSystemViews.swift")
        XCTAssertTrue(
            view.contains(".onTapGesture(count: 2)"),
            "la fiche de participation s'ouvre au double tap"
        )
        XCTAssertFalse(
            view.contains(".onLongPressGesture"),
            "l'appui long appartient au menu du message — l'avis d'arrivée ne doit pas le capter"
        )
    }

    /// Extrait le corps d'une closure en équilibrant ses accolades.
    ///
    /// La version précédente coupait à 700 caractères après l'ouverture. Des
    /// commentaires ajoutés en tête de closure ont fini par occuper toute la
    /// fenêtre : le test dénonçait une régression de routage alors que le code
    /// cherché se trouvait juste après la limite. Une closure se délimite par
    /// ses accolades, pas par un nombre de caractères arbitraire.
    private func closureBody(after marker: String, in source: String) -> String? {
        guard let open = source.range(of: marker) else { return nil }
        var depth = 1
        var index = open.upperBound
        while index < source.endIndex {
            let ch = source[index]
            if ch == "{" { depth += 1 }
            if ch == "}" {
                depth -= 1
                if depth == 0 { return String(source[open.upperBound..<index]) }
            }
            index = source.index(after: index)
        }
        return nil
    }

    /// **Recalibré — déplacé par `f9eb73d3` (« l'appui long élève la CELLULE
    /// VIVANTE, plus jamais une bulle reconstruite »), l'invariant est
    /// inchangé : l'appui long branche sur `callSummary`, jamais sur le
    /// `messageSource == .system` d'avant.**
    ///
    /// Ce commit a donné un SECOND paramètre à la fermeture — `focalPreview`,
    /// les pixels de la cellule vivante que l'overlay élève au lieu d'en
    /// reconstruire une. Le marqueur `onLongPress: { messageId in` ne
    /// désignait donc plus rien : le témoin échouait sur son `guard`, sans
    /// même avoir regardé le routage qu'il protège.
    ///
    /// **Et ça vient de se reproduire, à l'envers, le 2026-08-23** : la
    /// capture Focal a été RETIRÉE (elle tranchait en deux l'identité et la
    /// barre de méta de la cellule, à cheval sur son cadre), la signature est
    /// revenue à un seul paramètre, et le marqueur a de nouveau cessé de
    /// désigner quoi que ce soit. La leçon vaut donc dans les deux sens : un
    /// témoin qui épingle une SIGNATURE se périme à chaque paramètre ajouté
    /// ET à chaque paramètre retiré, alors que le routage qu'il protège n'a
    /// pas bougé d'un signe.
    ///
    /// Le marqueur suit la signature ; le corps recherché, lui, est inchangé
    /// mot pour mot. Même leçon que le passage de la fenêtre de 700 caractères
    /// à l'équilibrage d'accolades, documenté juste au-dessus : une garde qui
    /// épingle la FORME de la déclaration se périme au premier paramètre
    /// ajouté, alors que ce qu'elle protège n'a pas bougé d'un signe.
    /// **Recalibré une TROISIÈME fois le 2026-08-24 — et cette fois l'invariant
    /// lui-même a changé.** Les deux recalibrages précédents (documentés
    /// ci-dessus) suivaient une SIGNATURE qui bougeait autour d'un routage
    /// immobile. Ici c'est le routage qui bouge : l'appui long n'aiguille plus
    /// du tout par type de message.
    ///
    /// Il n'aiguillait rien de bon. Un message système SANS résumé d'appel
    /// tombait dans un no-op silencieux : appuyer longuement sur « X a rejoint
    /// la conversation » ne faisait rien, nulle part. Un message système reste
    /// un message — épinglable, favorisable, signalable, supprimable — et le
    /// geste qui ouvre ces options est le même partout dans le fil.
    func test_conversationView_onLongPress_opensTheUsualOptions_forEveryMessage() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let body = closureBody(after: "onLongPress: { messageId in", in: view) else {
            XCTFail("ConversationView must define the onLongPress closure"); return
        }
        XCTAssertTrue(
            body.contains("overlayState.showOverlayMenu = true"),
            "l'appui long ouvre les options habituelles, quel que soit le message"
        )
        XCTAssertFalse(
            body.contains("msg.messageSource != .system"),
            "plus aucun no-op par type : un avis système a les mêmes options que les autres"
        )
        XCTAssertFalse(
            body.contains("overlayState.callDetailMessage = msg"),
            "les détails d'appel ne sont plus une BRANCHE de l'appui long — ils sont une " +
            "action DANS les options habituelles (voir le témoin du résolveur)"
        )
    }

    /// **Un geste retiré doit rendre sa destination, pas la perdre.** L'appui
    /// long ouvrait les détails d'appel ; il ouvre désormais les options
    /// habituelles. Sans cette entrée, la feuille de détail d'un appel (durée
    /// précise, données, qualité réseau, transcript) devenait inatteignable au
    /// doigt — seule l'action VoiceOver de la carte y menait encore.
    func test_callDetail_isReachable_fromTheUsualOptions() {
        let withCall = MessageMenuContext(
            isMine: false, canEdit: false, canDelete: false,
            hasText: true, hasMedia: false, hasTimebasedMedia: false,
            isPinned: false, isStarred: false, isEdited: false, hasEditRevisions: false,
            hasCallSummary: true
        )
        XCTAssertEqual(MessageActionResolver.primaryActions(withCall).first, .callDetail)

        let withoutCall = MessageMenuContext(
            isMine: false, canEdit: false, canDelete: false,
            hasText: true, hasMedia: false, hasTimebasedMedia: false,
            isPinned: false, isStarred: false, isEdited: false, hasEditRevisions: false
        )
        XCTAssertFalse(MessageActionResolver.primaryActions(withoutCall).contains(.callDetail))
    }
}
