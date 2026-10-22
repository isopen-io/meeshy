import Foundation
import Testing
@testable import MeeshySDK

/// CE QU'UN LECTEUR PEUT FAIRE D'UN MESSAGE (#11209) — le miroir Swift rejoue
/// `packages/shared/fixtures/action-policy/message-actions.vectors.json`, que
/// `messageActionsFor` a PRODUIT : type de contenu, drapeaux, verdicts et ORDRE
/// des groupes, vecteur pour vecteur. Les deux lois ne peuvent pas diverger sans
/// qu'un des deux côtés rougisse : `sdk-tests.yml` se déclenche sur les
/// vecteurs et les lois TypeScript qu'ils exécutent, et
/// `packages/shared/__tests__/ci/sdk-tests-shared-inputs.test.ts` exige que tout
/// fichier partagé relu ici figure dans ses filtres.
struct MessageActionPolicyVectorTests {

    private struct Vector: Decodable {
        let label: String
        let input: Input
        let expected: Expected

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    private struct Input: Decodable {
        let message: WireMessage
        let conversation: WireConversation
        let viewer: WireViewer
        let now: Double

        var policyInput: MessageActionPolicy.Input {
            MessageActionPolicy.Input(
                message: message.message,
                conversation: conversation.conversation,
                viewer: viewer.authority,
                now: ActionPolicyVectorFixtures.instant(milliseconds: now)
            )
        }
    }

    /// La sortie sous sa forme FILAIRE : chaînes et millisecondes, comme le fichier.
    private struct Expected: Decodable, Equatable {
        let content: Content
        let groups: Groups
        let verdicts: Verdicts

        struct Content: Decodable, Equatable {
            let kind: String
            let flags: Flags
        }

        struct Flags: Decodable, Equatable {
            let viewOnce: Bool
            let blurred: Bool
            let encrypted: Bool
            let ephemeral: Bool
            let optimistic: Bool
            let failed: Bool
            let captureNotice: Bool
        }

        struct Groups: Decodable, Equatable {
            let primary: [String]
            let organize: [String]
            let more: [String]
            let moderation: [String]
            let destructive: [String]
        }

        struct Edit: Decodable, Equatable {
            let asModerator: Bool
            let windowEndsAt: Int64?
        }

        struct Remove: Decodable, Equatable {
            let reasonRequired: Bool
        }

        struct Verdicts: Decodable, Equatable {
            let edit: Edit?
            let deleteForEveryone: Bool
            let deleteForMe: Bool
            let remove: Remove?
            let pin: String?
            let report: Bool
            let canReact: Bool
            let canReply: Bool
            let translate: String?
            let transcribe: Bool?
            let sentiment: Bool?
            let forward: Bool
            let copy: Bool
            let save: Bool
            let serverFeatureAbsence: String?
        }
    }

    private static func project(_ result: MessageActionPolicy.Result) -> Expected {
        let flags = result.content.flags
        let groups = result.groups
        let verdicts = result.verdicts
        let names: ([MessageActionPolicy.Action]) -> [String] = { $0.map(\.rawValue) }
        return Expected(
            content: Expected.Content(
                kind: result.content.kind.rawValue,
                flags: Expected.Flags(
                    viewOnce: flags.viewOnce,
                    blurred: flags.blurred,
                    encrypted: flags.encrypted,
                    ephemeral: flags.ephemeral,
                    optimistic: flags.optimistic,
                    failed: flags.failed,
                    captureNotice: flags.captureNotice
                )
            ),
            groups: Expected.Groups(
                primary: names(groups.primary),
                organize: names(groups.organize),
                more: names(groups.more),
                moderation: names(groups.moderation),
                destructive: names(groups.destructive)
            ),
            verdicts: Expected.Verdicts(
                edit: verdicts.edit.map {
                    Expected.Edit(asModerator: $0.asModerator, windowEndsAt: ActionPolicyVectorFixtures.milliseconds($0.windowEndsAt))
                },
                deleteForEveryone: verdicts.deleteForEveryone,
                deleteForMe: verdicts.deleteForMe,
                remove: verdicts.remove.map { Expected.Remove(reasonRequired: $0.reasonRequired) },
                pin: verdicts.pin?.rawValue,
                report: verdicts.report,
                canReact: verdicts.canReact,
                canReply: verdicts.canReply,
                translate: verdicts.translate?.rawValue,
                transcribe: verdicts.transcribe,
                sentiment: verdicts.sentiment,
                forward: verdicts.forward,
                copy: verdicts.copy,
                save: verdicts.save,
                serverFeatureAbsence: verdicts.serverFeatureAbsence?.rawValue
            )
        )
    }

    private func vectors() throws -> [Vector] {
        try ActionPolicyVectorFixtures.load("message-actions.vectors.json", as: Vector.self)
    }

    @Test func theSharedFileCarriesCases_neverZero() throws {
        #expect(try vectors().count > 20)
    }

    @Test func everySharedVectorGivesTheSameVerdictsKindAndGroupOrder() throws {
        for vector in try vectors() {
            let actual = Self.project(MessageActionPolicy.actions(for: vector.input.policyInput))
            #expect(actual == vector.expected, "\(vector.label)")
        }
    }

    @Test func theContentKindAloneMatchesEveryVector() throws {
        for vector in try vectors() {
            let shape = MessageContentKind.shape(of: vector.input.message.subject)
            #expect(shape.kind.rawValue == vector.expected.content.kind, "\(vector.label)")
        }
    }

    @Test func theCasesThatMatterAreInTheFile() throws {
        let labels = Set(try vectors().map(\.label))
        let required = [
            "groupe-auteur-23h59-encore-modifiable",
            "groupe-auteur-24h01-plus-modifiable",
            "groupe-moderator-plateforme-membre-sur-autrui",
            "groupe-audit-vaut-user",
            "global-mineur-auteur-ni-modifier-ni-repondre-mais-reagit",
            "e2ee-auteur-texte",
            "broadcast-membre-reagit-sans-repondre",
            "invite-sans-droit-d-envoi",
            "supprime-seul-supprimer-pour-moi",
            "ephemere-expire-seul-supprimer-pour-moi",
            "envoi-en-echec-reessayer-en-tete",
            "lieu-ouvrir-dans-plans",
            "lien-de-l-auteur-plafond-de-six",
            "groupe-ecriture-reservee-aux-membres-un-rang-illisible-ne-repond-pas",
            "groupe-ecriture-reservee-au-createur-un-admin-ne-repond-pas",
            "groupe-ecriture-reservee-au-createur-le-createur-repond",
            "photo-vue-unique-par-la-piece-seule",
            "photo-vue-unique-par-le-bit-de-la-piece",
            "deux-pieces-toutes-floutees-se-transferent-sans-s-exporter",
            "une-piece-floutee-sur-deux-s-exporte",
            "carte-de-visite-alias-text-x-vcf",
            "carte-de-visite-type-generique-extension-en-majuscules",
            "carte-de-visite-lue-sur-le-nom-de-fichier-sans-nom-d-origine",
            "serveur-photo-ne-se-transfere-pas",
            "hybride-photo-ne-se-transfere-pas",
            "serveur-photo-chiffree-par-le-message-ne-se-transfere-pas",
            "hybride-texte-se-transfere",
            "vocal-en-conversation-serveur-transcriptible",
            "e2ee-texte-d-autrui-se-traduit-sur-l-appareil",
            "non-membre-supprimer-pour-moi-refuse",
        ]
        for label in required {
            #expect(labels.contains(label), "\(label)")
        }
    }

    @Test func thePrimaryListHoldsAtMostSixEntries_withReplyFirstWhenOffered() throws {
        for vector in try vectors() {
            let result = MessageActionPolicy.actions(for: vector.input.policyInput)
            #expect(result.groups.primary.count <= MessageActionPolicy.maxPrimaryActions, "\(vector.label)")
            guard result.verdicts.canReply, !result.content.flags.failed else { continue }
            #expect(result.groups.primary.first == .reply, "\(vector.label)")
        }
    }

    @Test func pieceForwardingUnderAServerRegimeIsRefused_andDeleteForMeNeedsAnActiveMember() throws {
        let byLabel = Dictionary(uniqueKeysWithValues: try vectors().map { ($0.label, $0) })
        let verdicts = { (label: String) -> MessageActionPolicy.Verdicts? in
            byLabel[label].map { MessageActionPolicy.actions(for: $0.input.policyInput).verdicts }
        }
        #expect(verdicts("serveur-photo-ne-se-transfere-pas")?.forward == false)
        #expect(verdicts("hybride-photo-ne-se-transfere-pas")?.forward == false)
        #expect(verdicts("hybride-texte-se-transfere")?.forward == true)
        #expect(verdicts("vocal-en-conversation-serveur-transcriptible")?.transcribe == true)
        #expect(verdicts("non-membre-supprimer-pour-moi-refuse")?.deleteForMe == false)
    }
}
