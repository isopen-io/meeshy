import Testing
import Foundation
@testable import MeeshySDK

/// La loi de sortie (#9572, #9573) — la table reprend CAS POUR CAS celle du
/// témoin de la loi jumelle TS (`packages/shared/utils/content-exit-law.test.ts`) :
/// mêmes entrées, mêmes verdicts, mêmes libellés. Une ligne ajoutée d'un côté
/// s'ajoute de l'autre.
@Suite("ContentExitLaw — un contenu qui disparaît ne sort pas de Meeshy")
struct ContentExitLawTests {

    private typealias Subject = ContentExitLaw.Subject
    private typealias Piece = ContentExitLaw.Piece
    private typealias CopyRequest = ContentExitLaw.CopyRequest
    private typealias CopyProtection = ContentExitLaw.CopyProtection

    private static let ephemeral = MessageEffectFlags.ephemeral.rawValue
    private static let blurred = MessageEffectFlags.blurred.rawValue
    private static let viewOnce = MessageEffectFlags.viewOnce.rawValue
    private static let afterRead = MessageEffectFlags.ephemeralAfterRead.rawValue
    private static let shake = MessageEffectFlags.shake.rawValue
    private static let glow = MessageEffectFlags.glow.rawValue

    private static func date(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso) ?? Date(timeIntervalSince1970: 0)
    }

    struct Row: Sendable {
        let label: String
        let subject: ContentExitLaw.Subject?
        let expected: ContentExitLaw
    }

    private static func row(_ label: String, _ subject: Subject?, _ expected: ContentExitLaw) -> Row {
        Row(label: label, subject: subject, expected: expected)
    }

    static let table: [Row] = [
        // « sujet indéfini » de la table TS se confond ici avec « aucun sujet » : Swift n'a qu'un `nil`.
        row("aucun sujet", nil, .ordinary),
        row("aucun drapeau", Subject(), .ordinary),
        row("des effets décoratifs seuls", Subject(effectFlags: shake | glow), .ordinary),
        row("le flou seul, que la loi ne remplace pas", Subject(isBlurred: true, effectFlags: blurred), .ordinary),
        row("une durée nulle, qui n’est pas une durée", Subject(ephemeralDuration: 0), .ordinary),
        row("des pièces ordinaires", Subject(attachments: [Piece(), Piece(isViewOnce: false, effectFlags: 0)]), .ordinary),

        row("EPHEMERAL avec sa durée", Subject(effectFlags: ephemeral, ephemeralDuration: 30), .timedFlame(seconds: 30)),
        row("la durée seule, sans le bit", Subject(ephemeralDuration: 3600), .timedFlame(seconds: 3600)),
        row("une durée fractionnaire, arrondie vers le bas", Subject(ephemeralDuration: 30.9), .timedFlame(seconds: 30)),
        row("une flamme à durée floutée",
            Subject(isBlurred: true, effectFlags: ephemeral | blurred, ephemeralDuration: 60), .timedFlame(seconds: 60)),
        row("la colonne fait foi, quelle que soit l’heure interne de destruction",
            Subject(ephemeralDuration: 30, expiresAt: date("2026-10-14T10:00:00Z")), .timedFlame(seconds: 30)),

        row("le bit après lecture", Subject(effectFlags: ephemeral | afterRead), .afterReadFlame),
        row("le bit après lecture voyageant seul", Subject(effectFlags: afterRead), .afterReadFlame),
        row("durée ET après lecture — la copie transférée",
            Subject(effectFlags: ephemeral | afterRead, ephemeralDuration: 30), .afterReadFlame),
        row("EPHEMERAL sans durée connue — fermé", Subject(effectFlags: ephemeral), .afterReadFlame),
        row("une échéance sans durée — fermé : `expiresAt` est l’heure INTERNE de destruction, jamais une durée",
            Subject(effectFlags: ephemeral, expiresAt: date("2026-10-14T10:00:00Z")), .afterReadFlame),
        row("une échéance nue, sans bit ni durée — fermé", Subject(expiresAt: date("2026-10-07T10:05:00Z")), .afterReadFlame),
        row("une pièce qui porte le bit après lecture", Subject(attachments: [Piece(effectFlags: afterRead)]), .afterReadFlame),
        row("une pièce après lecture sous une flamme à durée — la plus restrictive",
            Subject(effectFlags: ephemeral, ephemeralDuration: 30, attachments: [Piece(), Piece(effectFlags: afterRead)]),
            .afterReadFlame),

        row("la colonne vue unique", Subject(isViewOnce: true), .viewOnce),
        row("le bit VIEW_ONCE seul", Subject(effectFlags: viewOnce), .viewOnce),
        row("une pièce en vue unique sous un message ordinaire", Subject(attachments: [Piece(), Piece(isViewOnce: true)]), .viewOnce),
        row("le bit VIEW_ONCE d’une pièce", Subject(attachments: [Piece(effectFlags: viewOnce)]), .viewOnce),
        row("vue unique ET flamme à durée", Subject(isViewOnce: true, effectFlags: ephemeral, ephemeralDuration: 30), .viewOnce),
        row("vue unique ET après lecture", Subject(effectFlags: viewOnce | ephemeral | afterRead), .viewOnce),
        row("une pièce en vue unique sous une flamme après lecture",
            Subject(effectFlags: afterRead, attachments: [Piece(isViewOnce: true)]), .viewOnce),
        row("la grâce d’une vue unique consommée n’en fait pas une flamme",
            Subject(isViewOnce: true, expiresAt: date("2026-10-07T10:05:00Z")), .viewOnce),
    ]

    @Test("la table de la spec, ligne par ligne")
    func test_of_tableDeLaSpec() {
        for row in Self.table {
            #expect(ContentExitLaw.of(row.subject) == row.expected, "\(row.label)")
        }
    }

    @Test("la table couvre les quatre natures")
    func test_of_tableCouvreLesQuatreNatures() {
        #expect(Set(Self.table.map(\.expected.nature)) == Set(ContentExitLaw.Nature.allCases))
    }

    @Test("ne lit pas le flou d’une pièce comme une nature de disparition")
    func test_of_flouDUnePièce_resteOrdinaire() {
        #expect(ContentExitLaw.of(Subject(attachments: [Piece(isBlurred: true, effectFlags: Self.blurred)])) == .ordinary)
    }

    @Test("une pièce nulle ne déclare rien")
    func test_of_pièceNulle_resteOrdinaire() {
        #expect(ContentExitLaw.of(Subject(attachments: [nil, Piece()])) == .ordinary)
    }

    @Test("les quatre natures rendent exactement les verdicts de la table")
    func test_verdicts_parNature() {
        #expect(ContentExitLaw.ordinary.forward == .allowed(maxDurationSeconds: nil))
        #expect(ContentExitLaw.ordinary.exportable)
        #expect(ContentExitLaw.ordinary.capture == .free)

        let timed = ContentExitLaw.timedFlame(seconds: 30)
        #expect(timed.forward == .allowed(maxDurationSeconds: 30))
        #expect(!timed.exportable)
        #expect(timed.capture == .announced)

        #expect(ContentExitLaw.afterReadFlame.forward == .refused(.afterRead))
        #expect(!ContentExitLaw.afterReadFlame.exportable)
        #expect(ContentExitLaw.afterReadFlame.capture == .announced)

        #expect(ContentExitLaw.viewOnce.forward == .refused(.viewOnce))
        #expect(!ContentExitLaw.viewOnce.exportable)
        #expect(ContentExitLaw.viewOnce.capture == .blocked)
    }

    @Test("les noms de nature et de refus sont ceux du fil TypeScript")
    func test_rawValues_sontCeuxDeLaLoiTS() {
        #expect(ContentExitLaw.Nature.allCases.map(\.rawValue) == ["ordinary", "timed-flame", "after-read-flame", "view-once"])
        #expect(ContentExitLaw.ForwardRefusal.viewOnce.rawValue == "view-once")
        #expect(ContentExitLaw.ForwardRefusal.afterRead.rawValue == "after-read")
        #expect(ContentExitLaw.CaptureVerdict.allCases.map(\.rawValue) == ["free", "announced", "blocked"])
    }

    /// Jumeau du témoin TS « la capture : noire pour la vue unique, annoncée
    /// pour les deux flammes, libre sinon » (porteur 2026-10-07, #9617).
    @Test("la capture : noire pour la vue unique, annoncée pour les deux flammes, libre sinon")
    func test_capture_noireVueUnique_annonceeFlammes_libreSinon() {
        #expect(ContentExitLaw.of(Subject(isViewOnce: true)).capture == .blocked)
        #expect(ContentExitLaw.of(Subject(effectFlags: Self.ephemeral, ephemeralDuration: 30)).capture == .announced)
        #expect(ContentExitLaw.of(Subject(effectFlags: Self.ephemeral | Self.afterRead)).capture == .announced)
        #expect(ContentExitLaw.of(Subject(effectFlags: Self.ephemeral | Self.afterRead, ephemeralDuration: 30)).capture == .announced)
        #expect(ContentExitLaw.of(Subject()).capture == .free)
    }

    @Test("seule une capture libre ne se déclare pas")
    func test_captureVerdict_isDeclared() {
        #expect(!ContentExitLaw.CaptureVerdict.free.isDeclared)
        #expect(ContentExitLaw.CaptureVerdict.announced.isDeclared)
        #expect(ContentExitLaw.CaptureVerdict.blocked.isDeclared)
    }

    // MARK: - forwardedCopyProtection

    private var flame: Subject { Subject(effectFlags: Self.ephemeral, ephemeralDuration: 300) }
    private var flameBits: UInt32 { Self.ephemeral | Self.afterRead }

    @Test("rend nil quand la source ne se transfère pas")
    func test_copy_sourceNonTransférable_rendNil() {
        #expect(ContentExitLaw.forwardedCopyProtection(source: Subject(isViewOnce: true), requested: CopyRequest()) == nil)
        #expect(ContentExitLaw.forwardedCopyProtection(source: Subject(effectFlags: Self.afterRead), requested: CopyRequest()) == nil)
        #expect(ContentExitLaw.forwardedCopyProtection(
            source: Subject(attachments: [Piece(isViewOnce: true)]), requested: CopyRequest()
        ) == nil)
    }

    @Test("laisse la requête entière sur une source ordinaire")
    func test_copy_sourceOrdinaire_laRequêtePasse() {
        let copy = ContentExitLaw.forwardedCopyProtection(
            source: Subject(),
            requested: CopyRequest(effectFlags: Self.shake | Self.ephemeral, isBlurred: false, ephemeralDuration: 60)
        )
        #expect(copy == CopyProtection(effectFlags: Self.shake | Self.ephemeral, isBlurred: false, ephemeralDuration: 60))
    }

    @Test("rend des colonnes neutres quand ni la source ni la requête ne déclarent rien")
    func test_copy_rienDéclaré_colonnesNeutres() {
        #expect(ContentExitLaw.forwardedCopyProtection(source: Subject(), requested: nil)
            == CopyProtection(effectFlags: 0, isBlurred: false, ephemeralDuration: nil))
    }

    @Test("fait hériter la durée de la source à qui n’en demande pas, avec le bit après lecture")
    func test_copy_sansDuréeDemandée_hériteDeLaSource() {
        #expect(ContentExitLaw.forwardedCopyProtection(source: flame, requested: CopyRequest())
            == CopyProtection(effectFlags: flameBits, isBlurred: false, ephemeralDuration: 300))
    }

    struct DurationRow: Sendable {
        let label: String
        let requested: Double
        let expected: Int
    }

    static let durations: [DurationRow] = [
        DurationRow(label: "plus courte : gardée", requested: 30, expected: 30),
        DurationRow(label: "égale : gardée", requested: 300, expected: 300),
        DurationRow(label: "plus longue : ramenée à la source", requested: 86_400, expected: 300),
        DurationRow(label: "nulle : celle de la source", requested: 0, expected: 300),
        DurationRow(label: "négative : celle de la source", requested: -5, expected: 300),
        DurationRow(label: "non finie : celle de la source", requested: .infinity, expected: 300),
        DurationRow(label: "fractionnaire : arrondie vers le bas", requested: 30.7, expected: 30),
        DurationRow(label: "sous la seconde : celle de la source", requested: 0.4, expected: 300),
        DurationRow(label: "gigantesque : ramenée à la source", requested: 9_007_199_254_740_991, expected: 300),
        DurationRow(label: "NaN : celle de la source", requested: .nan, expected: 300),
    ]

    @Test("durée demandée")
    func test_copy_duréeDemandée() {
        for row in Self.durations {
            let copy = ContentExitLaw.forwardedCopyProtection(
                source: flame, requested: CopyRequest(ephemeralDuration: row.requested)
            )
            #expect(copy?.ephemeralDuration == row.expected, "\(row.label)")
        }
    }

    @Test("retire à la requête tout ce qui desserrerait la flamme, et garde ses effets décoratifs")
    func test_copy_requêtePlusLâche_estResserrée() {
        let copy = ContentExitLaw.forwardedCopyProtection(
            source: flame,
            requested: CopyRequest(effectFlags: Self.shake, isBlurred: false, ephemeralDuration: 86_400)
        )
        #expect(copy == CopyProtection(effectFlags: Self.shake | flameBits, isBlurred: false, ephemeralDuration: 300))
    }

    @Test("impose le flou de la source, colonne ou bit, sur toute nature")
    func test_copy_flouDeLaSource_estImposé() {
        #expect(ContentExitLaw.forwardedCopyProtection(source: Subject(isBlurred: true), requested: CopyRequest(isBlurred: false))
            == CopyProtection(effectFlags: Self.blurred, isBlurred: true, ephemeralDuration: nil))
        #expect(ContentExitLaw.forwardedCopyProtection(
            source: Subject(effectFlags: Self.ephemeral | Self.blurred, ephemeralDuration: 300), requested: CopyRequest()
        ) == CopyProtection(effectFlags: flameBits | Self.blurred, isBlurred: true, ephemeralDuration: 300))
    }

    @Test("impose le flou quand seule une PIÈCE de la source est floutée, colonne ou bit")
    func test_copy_flouDUnePièce_estImposé() {
        #expect(ContentExitLaw.forwardedCopyProtection(
            source: Subject(attachments: [Piece(), Piece(isBlurred: true)]), requested: CopyRequest()
        ) == CopyProtection(effectFlags: Self.blurred, isBlurred: true, ephemeralDuration: nil))
        #expect(ContentExitLaw.forwardedCopyProtection(
            source: Subject(effectFlags: Self.ephemeral, ephemeralDuration: 300, attachments: [Piece(effectFlags: Self.blurred)]),
            requested: CopyRequest()
        ) == CopyProtection(effectFlags: flameBits | Self.blurred, isBlurred: true, ephemeralDuration: 300))
    }

    @Test("laisse la requête AJOUTER un flou que la source ne portait pas")
    func test_copy_flouDemandé_sAjoute() {
        #expect(ContentExitLaw.forwardedCopyProtection(source: flame, requested: CopyRequest(isBlurred: true))
            == CopyProtection(effectFlags: flameBits | Self.blurred, isBlurred: true, ephemeralDuration: 300))
    }

    @Test("produit une copie qui ne se retransfère pas")
    func test_copy_neSeRetransfèrePas() throws {
        let copy = try #require(ContentExitLaw.forwardedCopyProtection(source: flame, requested: CopyRequest()))
        #expect(ContentExitLaw.of(copy.subject) == .afterReadFlame)
    }

    // MARK: - Les durées que la feuille de transfert offre

    @Test("une source ordinaire ou refusée n'offre aucune durée")
    func test_durationChoices_sansBorne_estVide() {
        #expect(ContentExitLaw.ordinary.forward.durationChoices.isEmpty)
        #expect(ContentExitLaw.afterReadFlame.forward.durationChoices.isEmpty)
        #expect(ContentExitLaw.viewOnce.forward.durationChoices.isEmpty)
    }

    @Test("seuls les paliers inférieurs ou égaux à la source sont offerts")
    func test_durationChoices_paliersInférieursOuÉgaux() {
        #expect(ContentExitLaw.timedFlame(seconds: 300).forward.durationChoices.map(\.seconds) == [15, 30, 60, 300])
        #expect(ContentExitLaw.timedFlame(seconds: 15).forward.durationChoices.map(\.seconds) == [15])
        #expect(ContentExitLaw.timedFlame(seconds: 86_400).forward.durationChoices.map(\.seconds) == [15, 30, 60, 300, 3600, 86_400])
    }

    @Test("une durée source hors palier s'affiche telle quelle, en tête")
    func test_durationChoices_horsPalier_enTête() {
        #expect(ContentExitLaw.timedFlame(seconds: 45).forward.durationChoices.map(\.seconds) == [45, 15, 30])
        #expect(ContentExitLaw.timedFlame(seconds: 10).forward.durationChoices.map(\.seconds) == [10])
        #expect(ContentExitLaw.timedFlame(seconds: 100_000).forward.durationChoices.map(\.seconds)
            == [100_000, 15, 30, 60, 300, 3600, 86_400])
    }

    @Test("la durée de la source est présélectionnée, et fait toujours partie des choix")
    func test_defaultDuration_estCelleDeLaSource() {
        for seconds in [10, 15, 45, 300, 86_400, 100_000] {
            let forward = ContentExitLaw.timedFlame(seconds: seconds).forward
            #expect(forward.defaultDurationSeconds == seconds)
            #expect(forward.durationChoices.map(\.seconds).contains(seconds))
        }
        #expect(ContentExitLaw.ordinary.forward.defaultDurationSeconds == nil)
    }

    @Test("la durée qui part est le choix, jamais plus que la source ; rien sur une source sans borne")
    func test_requestedDuration_bornéeParLaSource() {
        let forward = ContentExitLaw.timedFlame(seconds: 300).forward
        #expect(forward.requestedDuration(chosen: 30) == 30)
        #expect(forward.requestedDuration(chosen: 300) == 300)
        #expect(forward.requestedDuration(chosen: 3600) == 300)
        #expect(forward.requestedDuration(chosen: nil) == 300)
        #expect(forward.requestedDuration(chosen: 0) == 300)
        #expect(ContentExitLaw.ordinary.forward.requestedDuration(chosen: 30) == nil)
        #expect(ContentExitLaw.viewOnce.forward.requestedDuration(chosen: 30) == nil)
    }

    @Test("un lot est refusé dès qu'un message l'est, sinon borné par sa plus longue flamme")
    func test_batch() {
        typealias Verdict = ContentExitLaw.ForwardVerdict
        #expect(Verdict.batch([]) == .allowed(maxDurationSeconds: nil))
        #expect(Verdict.batch([.allowed(maxDurationSeconds: nil), .allowed(maxDurationSeconds: nil)]) == .allowed(maxDurationSeconds: nil))
        #expect(Verdict.batch([.allowed(maxDurationSeconds: 30), .allowed(maxDurationSeconds: nil), .allowed(maxDurationSeconds: 300)])
            == .allowed(maxDurationSeconds: 300))
        #expect(Verdict.batch([.allowed(maxDurationSeconds: 30), .refused(.viewOnce)]) == .refused(.viewOnce))
        #expect(Verdict.batch([.refused(.afterRead), .allowed(maxDurationSeconds: nil)]) == .refused(.afterRead))
    }

    @Test("dans un lot, chaque flamme reste ramenée à sa propre durée")
    func test_batch_chaqueMessageGardeSaBorne() {
        let short = ContentExitLaw.timedFlame(seconds: 30).forward
        let long = ContentExitLaw.timedFlame(seconds: 300).forward
        let batch = ContentExitLaw.ForwardVerdict.batch([short, long, ContentExitLaw.ordinary.forward])
        #expect(batch.durationChoices.map(\.seconds) == [15, 30, 60, 300])
        #expect(short.requestedDuration(chosen: nil) == 30)
        #expect(long.requestedDuration(chosen: nil) == 300)
        #expect(short.requestedDuration(chosen: 60) == 30)
        #expect(long.requestedDuration(chosen: 60) == 60)
        #expect(ContentExitLaw.ordinary.forward.requestedDuration(chosen: 60) == nil)
    }

    // MARK: - Le portillon des visionneuses

    @Test("ouvert, tout sort ; scellé, rien ne sort")
    func test_gate_ouvertEtScellé() {
        #expect(ContentExitGate.open.mayLeave())
        #expect(ContentExitGate.open.mayLeave("a1"))
        #expect(!ContentExitGate.sealed.mayLeave())
        #expect(!ContentExitGate.sealed.mayLeave("a1"))
    }

    @Test("une liste est fermée par défaut : un contenu absent ou sans identifiant ne sort pas")
    func test_gate_listeFerméeParDéfaut() {
        let gate = ContentExitGate.only(["a1"])
        #expect(gate.mayLeave("a1"))
        #expect(!gate.mayLeave("a2"))
        #expect(!gate.mayLeave())
        #expect(!ContentExitGate.only([]).mayLeave("a1"))
    }

    @Test("un gestionnaire de sortie ne fait RIEN sous un portillon fermé — le geste, pas seulement le bouton")
    func test_gate_perform_nExécuteQueCeQuiPeutSortir() {
        var ran: [String] = []
        #expect(ContentExitGate.open.perform { ran.append("open") })
        #expect(!ContentExitGate.sealed.perform { ran.append("sealed") })
        #expect(!ContentExitGate.sealed.perform("a1") { ran.append("sealed-id") })
        #expect(ContentExitGate.only(["a1"]).perform("a1") { ran.append("listed") })
        #expect(!ContentExitGate.only(["a1"]).perform("a2") { ran.append("unlisted") })
        #expect(!ContentExitGate.only(["a1"]).perform { ran.append("no-id") })
        #expect(ran == ["open", "listed"])
    }

    @Test("un palier porte son libellé de palier, une durée libre se compose")
    func test_choiceLabel() {
        #expect(ForwardDurationChoice(seconds: 15).label == "15s")
        #expect(ForwardDurationChoice(seconds: 3600).label == "1h")
        #expect(ForwardDurationChoice(seconds: 45).label == "45s")
        #expect(ForwardDurationChoice(seconds: 90).label == "1min 30s")
        #expect(ForwardDurationChoice(seconds: 7200).label == "2h")
        #expect(ForwardDurationChoice(seconds: 3661).label == "1h 1min 1s")
    }

    // MARK: - Projection du message

    private func message(
        flags: MessageEffectFlags = [],
        duration: Int? = nil,
        expiresAt: Date? = nil,
        attachments: [MeeshyMessageAttachment] = [],
        viewOnceOpenedAt: Date? = nil
    ) -> MeeshyMessage {
        var message = MeeshyMessage(
            id: "m1", conversationId: "c1", senderId: "u1", content: "salut",
            createdAt: Date(timeIntervalSince1970: 0), updatedAt: Date(timeIntervalSince1970: 0)
        )
        message.effects = MessageEffects(flags: flags, ephemeralDuration: duration)
        message.expiresAt = expiresAt
        message.attachments = attachments
        message.viewOnceOpenedAt = viewOnceOpenedAt
        return message
    }

    private func photo(isViewOnce: Bool = false, isBlurred: Bool = false, effectFlags: UInt32? = nil) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: "a1", fileName: "p.jpg", mimeType: "image/jpeg", fileUrl: "https://cdn/p.jpg",
            isViewOnce: isViewOnce, isBlurred: isBlurred, effectFlags: effectFlags
        )
    }

    @Test("un message lit sa nature sur ses effets, sa durée et ses pièces")
    func test_message_contentExitLaw() {
        #expect(message().contentExitLaw == .ordinary)
        #expect(message(flags: .blurred).contentExitLaw == .ordinary)
        #expect(message(flags: .ephemeral, duration: 30).contentExitLaw == .timedFlame(seconds: 30))
        #expect(message(flags: [.ephemeral, .ephemeralAfterRead]).contentExitLaw == .afterReadFlame)
        #expect(message(flags: [.ephemeral, .ephemeralAfterRead], duration: 30).contentExitLaw == .afterReadFlame)
        #expect(message(flags: .ephemeral, expiresAt: Date(timeIntervalSince1970: 60)).contentExitLaw == .afterReadFlame)
        #expect(message(flags: .viewOnce).contentExitLaw == .viewOnce)
        #expect(message(attachments: [photo(isViewOnce: true)]).contentExitLaw == .viewOnce)
        #expect(message(attachments: [photo(effectFlags: Self.afterRead)]).contentExitLaw == .afterReadFlame)
        #expect(message(attachments: [photo(isBlurred: true)]).contentExitLaw == .ordinary)
    }

    @Test("une vue unique déjà ouverte par ce lecteur reste une vue unique")
    func test_message_vueUniqueOuverte_resteVueUnique() {
        #expect(message(viewOnceOpenedAt: Date(timeIntervalSince1970: 10)).contentExitLaw == .viewOnce)
    }
}
