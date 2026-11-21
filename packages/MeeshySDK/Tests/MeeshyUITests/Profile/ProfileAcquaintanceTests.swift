import Testing
import Foundation
import MeeshySDK
@testable import MeeshyUI

/// « Faire connaissance » sur la fiche d'un inconnu (#19456, planche `Autre-Inconnu`) : la demande se rédige sur place
/// en 300 signes, part de façon optimiste, se défait sur un refus ; la fiche ne pose rien sans le verdict de l'app.
@Suite("La fiche d'un inconnu rédige la demande de message sur place")
struct ProfileAcquaintanceTests {

    // MARK: Le brouillon

    @Test("le brouillon garde 300 signes au plus")
    func draft_clampsToLimit() {
        let draft = ProfileMessageRequestDraft(String(repeating: "a", count: 340))
        #expect(draft.count == 300)
        #expect(ProfileMessageRequestDraft.limit == 300)
    }

    @Test("le message qui part n'a pas les blancs du bord, et un brouillon vide n'a rien à dire")
    func draft_message_trims() {
        #expect(ProfileMessageRequestDraft("  Bonjour Rui  \n").message == "Bonjour Rui")
        #expect(ProfileMessageRequestDraft("   \n ").message == nil)
    }

    // MARK: L'envoi optimiste

    @Test("envoyer la demande la dit envoyée tout de suite et rend le message")
    func flow_submit_isOptimistic() {
        var flow = ProfileMessageRequestFlow()
        flow.edit("Bonjour Rui, j'ai une kora à faire réparer.")
        let message = flow.submit()
        #expect(message == "Bonjour Rui, j'ai une kora à faire réparer.")
        #expect(flow.stage == .sent)
        #expect(!flow.canSend)
    }

    @Test("sans texte, rien ne part")
    func flow_emptyDraft_sendsNothing() {
        var flow = ProfileMessageRequestFlow()
        flow.edit("   ")
        let message = flow.submit()
        #expect(message == nil)
        #expect(flow.stage == .composing)
    }

    @Test("une demande déjà partie ne repart pas")
    func flow_sent_doesNotResend() {
        var flow = ProfileMessageRequestFlow()
        flow.edit("Bonjour")
        _ = flow.submit()
        let again = flow.submit()
        #expect(again == nil)
    }

    @Test("un refus défait l'envoi et garde le brouillon pour réessayer")
    func flow_refusal_restoresDraft() {
        var flow = ProfileMessageRequestFlow()
        flow.edit("Bonjour")
        _ = flow.submit()
        flow.settle(delivered: false)
        #expect(flow.stage == .unsent)
        #expect(flow.draft.text == "Bonjour")
        #expect(flow.canSend)
    }

    @Test("une demande partie le reste, et corriger après un refus revient à la rédaction")
    func flow_delivered_staysSent_andEditAfterRefusal() {
        var sent = ProfileMessageRequestFlow()
        sent.edit("Bonjour")
        _ = sent.submit()
        sent.settle(delivered: true)
        #expect(sent.stage == .sent)

        var refused = ProfileMessageRequestFlow()
        refused.edit("Bonjour")
        _ = refused.submit()
        refused.settle(delivered: false)
        refused.edit("Bonjour Rui")
        #expect(refused.stage == .composing)
    }

    // MARK: La langue de lecture

    @Test("il le lira dans sa langue principale, nommée dans la langue de l'interface")
    func readingLanguage_namesTheServedLanguage() {
        let french = Locale(identifier: "fr_FR")
        #expect(ProfileReadingLanguage.name(of: "pt", in: french) == "portugais")
        #expect(ProfileReadingLanguage.name(of: "pt-BR", in: french) == "portugais")
    }

    @Test("sans langue servie, rien ne se dit", arguments: [nil, "", "  "] as [String?])
    func readingLanguage_absent_saysNothing(code: String?) {
        #expect(ProfileReadingLanguage.name(of: code, in: Locale(identifier: "fr_FR")) == nil)
    }
}

/// Le modèle de la fiche, contre une app doublée.
@MainActor
@Suite("Le verdict et l'envoi de la demande passent par l'app")
struct ProfileAcquaintanceModelTests {

    @Test("l'app dit que écrire part en demande : la carte se pose")
    func resolve_requestVerdict_showsTheCard() async {
        let host = AcquaintanceHostDouble(verdict: true)
        let model = ProfileAcquaintanceModel()
        await model.resolve(userId: "rui", host: host)
        #expect(model.writesARequest)
    }

    @Test("sans app, sans verdict ou sans personne, la fiche reste celle d'avant")
    func resolve_withoutVerdict_changesNothing() async {
        let model = ProfileAcquaintanceModel()
        await model.resolve(userId: "rui", host: nil)
        await model.resolve(userId: "rui", host: AcquaintanceHostDouble(verdict: nil))
        await model.resolve(userId: nil, host: AcquaintanceHostDouble(verdict: true))
        #expect(!model.writesARequest)
    }

    @Test("le verdict se lit une fois par personne")
    func resolve_oncePerPerson() async {
        let host = AcquaintanceHostDouble(verdict: true)
        let model = ProfileAcquaintanceModel()
        await model.resolve(userId: "rui", host: host)
        await model.resolve(userId: "rui", host: host)
        #expect(host.verdictCalls == 1)
    }

    @Test("la demande part chez l'app avec le message rédigé, et reste envoyée")
    func send_delivered_staysSent() async {
        let host = AcquaintanceHostDouble(verdict: true, delivers: true)
        let model = ProfileAcquaintanceModel()
        model.edit("  Bonjour Rui ")
        await model.send(to: "rui", host: host)
        #expect(host.sent.count == 1)
        #expect(host.sent.first?.userId == "rui")
        #expect(host.sent.first?.text == "Bonjour Rui")
        #expect(model.flow.stage == .sent)
    }

    @Test("un refus de l'app rend le brouillon")
    func send_refused_restoresDraft() async {
        let host = AcquaintanceHostDouble(verdict: true, delivers: false)
        let model = ProfileAcquaintanceModel()
        model.edit("Bonjour Rui")
        await model.send(to: "rui", host: host)
        #expect(model.flow.stage == .unsent)
        #expect(model.flow.draft.text == "Bonjour Rui")
    }

    @Test("sans app ni texte, rien ne part")
    func send_withoutHostOrText_sendsNothing() async {
        let host = AcquaintanceHostDouble(verdict: true)
        let model = ProfileAcquaintanceModel()
        await model.send(to: "rui", host: host)
        model.edit("Bonjour")
        await model.send(to: "rui", host: nil)
        #expect(host.sent.isEmpty)
        #expect(model.flow.stage == .composing)
    }
}

@MainActor
final class AcquaintanceHostDouble: ProfileAcquaintanceProviding {
    nonisolated deinit {}

    struct Sent: Equatable {
        let userId: String
        let text: String
    }

    let verdict: Bool?
    let delivers: Bool
    private(set) var verdictCalls = 0
    private(set) var sent: [Sent] = []

    init(verdict: Bool?, delivers: Bool = true) {
        self.verdict = verdict
        self.delivers = delivers
    }

    func writesARequest(to userId: String) async -> Bool? {
        verdictCalls += 1
        return verdict
    }

    func sendMessageRequest(to userId: String, text: String) async -> Bool {
        sent.append(Sent(userId: userId, text: text))
        return delivers
    }
}
