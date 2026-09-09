import Foundation
import MeeshySDK

/// LES MOTS DES SUCCÈS GÉNÉRÉS (#5759) — miroir iOS de
/// `packages/shared/utils/achievement-labels.ts`.
///
/// UN gabarit par FAMILLE, `\(n)` portant le palier : huit clés rendent une
/// cinquantaine de succès, et ajouter un palier n'en coûte AUCUNE. C'est le
/// rapport qui rend « des milliers » tenable.
///
/// Le nombre est formaté selon la locale du LECTEUR — « 1 000 » en français,
/// « 1,000 » en anglais, « ١٬٠٠٠ » en arabe. Servir « 1000 » brut ferait lire
/// un catalogue traduit avec des chiffres qui ne le sont pas.
///
/// Une famille hors catalogue rend `nil`, jamais une clé affichée : c'est la
/// leçon du `first_content` servi tel quel sur un écran verrouillé (#5731).
enum AchievementCopy {
    private static func nombre(_ tier: Int) -> String {
        NumberFormatter.localizedString(from: NSNumber(value: tier), number: .decimal)
    }

    static func label(_ family: AchievementFamily, tier: Int) -> String? {
        let n = nombre(tier)
        if tier == 1, let singulier = labelOne(family.id, n: n) {
            return singulier
        }
        switch family.id {
        case "conversation.join.size":
            return String(localized: "achievement.conversation.join.size",
                          defaultValue: "Conversation de \(n) membres", bundle: .main)
        case "conversation.join.count":
            return String(localized: "achievement.conversation.join.count",
                          defaultValue: "\(n) conversations rejointes", bundle: .main)
        case "conversation.leave.count":
            return String(localized: "achievement.conversation.leave.count",
                          defaultValue: "\(n) conversations quittées", bundle: .main)
        case "conversation.create.count":
            return String(localized: "achievement.conversation.create.count",
                          defaultValue: "\(n) conversations créées", bundle: .main)
        case "community.join.size":
            return String(localized: "achievement.community.join.size",
                          defaultValue: "Communauté de \(n) membres", bundle: .main)
        case "community.join.count":
            return String(localized: "achievement.community.join.count",
                          defaultValue: "\(n) communautés rejointes", bundle: .main)
        case "community.create.size":
            return String(localized: "achievement.community.create.size",
                          defaultValue: "\(n) membres réunis", bundle: .main)
        case "community.create.count":
            return String(localized: "achievement.community.create.count",
                          defaultValue: "\(n) communautés créées", bundle: .main)
        case "message.send.count":
            return String(localized: "achievement.message.send.count",
                          defaultValue: "\(n) messages envoyés", bundle: .main)
        case "voice.send.count":
            return String(localized: "achievement.voice.send.count",
                          defaultValue: "\(n) vocaux envoyés", bundle: .main)
        case "image.send.count":
            return String(localized: "achievement.image.send.count",
                          defaultValue: "\(n) images envoyées", bundle: .main)
        case "video.send.count":
            return String(localized: "achievement.video.send.count",
                          defaultValue: "\(n) vidéos envoyées", bundle: .main)
        case "message.edit.count":
            return String(localized: "achievement.message.edit.count",
                          defaultValue: "\(n) messages corrigés", bundle: .main)
        case "message.delete.count":
            return String(localized: "achievement.message.delete.count",
                          defaultValue: "\(n) messages supprimés", bundle: .main)
        case "message.react.count":
            return String(localized: "achievement.message.react.count",
                          defaultValue: "\(n) réactions posées", bundle: .main)
        case "call.join.count":
            return String(localized: "achievement.call.join.count",
                          defaultValue: "\(n) appels rejoints", bundle: .main)
        case "call.start.count":
            return String(localized: "achievement.call.start.count",
                          defaultValue: "\(n) appels lancés", bundle: .main)
        case "call.start.size":
            return String(localized: "achievement.call.start.size",
                          defaultValue: "Appel à \(n) participants", bundle: .main)
        case "referral.complete.count":
            return String(localized: "achievement.referral.complete.count",
                          defaultValue: "\(n) filleuls arrivés", bundle: .main)
        case "link.click.count":
            return String(localized: "achievement.link.click.count",
                          defaultValue: "\(n) clics sur vos liens", bundle: .main)
        case "streak.hold.count":
            return String(localized: "achievement.streak.hold.count",
                          defaultValue: "Série de \(n) jours", bundle: .main)
        case "meesh.mint.count":
            return String(localized: "achievement.meesh.mint.count",
                          defaultValue: "\(n) Meeshes frappées", bundle: .main)
        default:
            return nil
        }
    }

    /// L'ACCORD AU SINGULIER du palier 1, pour les familles de VOLUME (#5859).
    ///
    /// `label(_:tier:)` porte UNE forme par famille, au pluriel — juste à
    /// partir du palier 10, faux au palier 1 (« 1 messages envoyés »). Ce
    /// gabarit ne couvre que ce que le pluriel ne peut pas porter seul : les
    /// dix-huit familles de VOLUME (`scale: "count"` — les familles d'AMPLEUR
    /// commencent à 10, jamais à 1, donc n'ont jamais besoin d'accord) dans
    /// les six langues qui fléchissent au singulier. `ar` en est absente : sa
    /// construction (nombre + nom singulier) est déjà juste à 1 — miroir exact
    /// de `ACHIEVEMENT_LABELS_ONE` (`packages/shared/utils/achievement-labels.ts`,
    /// #5846), qui pour la même raison ne déclare ni `ar` ni `zh-Hans`.
    ///
    /// Retourne `nil` pour toute famille hors de cette liste (les quatre
    /// familles d'AMPLEUR, ou une famille inconnue) — `label(_:tier:)` retombe
    /// alors sur le gabarit pluriel, sans changement de comportement.
    static func labelOne(_ familyId: String, n: String) -> String? {
        switch familyId {
        case "conversation.join.count":
            return String(localized: "achievement.conversation.join.count.one",
                          defaultValue: "\(n) conversation rejointe", bundle: .main)
        case "conversation.leave.count":
            return String(localized: "achievement.conversation.leave.count.one",
                          defaultValue: "\(n) conversation quittée", bundle: .main)
        case "conversation.create.count":
            return String(localized: "achievement.conversation.create.count.one",
                          defaultValue: "\(n) conversation créée", bundle: .main)
        case "community.join.count":
            return String(localized: "achievement.community.join.count.one",
                          defaultValue: "\(n) communauté rejointe", bundle: .main)
        case "community.create.count":
            return String(localized: "achievement.community.create.count.one",
                          defaultValue: "\(n) communauté créée", bundle: .main)
        case "message.send.count":
            return String(localized: "achievement.message.send.count.one",
                          defaultValue: "\(n) message envoyé", bundle: .main)
        case "voice.send.count":
            return String(localized: "achievement.voice.send.count.one",
                          defaultValue: "\(n) vocal envoyé", bundle: .main)
        case "image.send.count":
            return String(localized: "achievement.image.send.count.one",
                          defaultValue: "\(n) image envoyée", bundle: .main)
        case "video.send.count":
            return String(localized: "achievement.video.send.count.one",
                          defaultValue: "\(n) vidéo envoyée", bundle: .main)
        case "message.edit.count":
            return String(localized: "achievement.message.edit.count.one",
                          defaultValue: "\(n) message corrigé", bundle: .main)
        case "message.delete.count":
            return String(localized: "achievement.message.delete.count.one",
                          defaultValue: "\(n) message supprimé", bundle: .main)
        case "message.react.count":
            return String(localized: "achievement.message.react.count.one",
                          defaultValue: "\(n) réaction posée", bundle: .main)
        case "call.join.count":
            return String(localized: "achievement.call.join.count.one",
                          defaultValue: "\(n) appel rejoint", bundle: .main)
        case "call.start.count":
            return String(localized: "achievement.call.start.count.one",
                          defaultValue: "\(n) appel lancé", bundle: .main)
        case "referral.complete.count":
            return String(localized: "achievement.referral.complete.count.one",
                          defaultValue: "\(n) filleul arrivé", bundle: .main)
        case "link.click.count":
            return String(localized: "achievement.link.click.count.one",
                          defaultValue: "\(n) clic sur vos liens", bundle: .main)
        case "streak.hold.count":
            return String(localized: "achievement.streak.hold.count.one",
                          defaultValue: "Série de \(n) jour", bundle: .main)
        case "meesh.mint.count":
            return String(localized: "achievement.meesh.mint.count.one",
                          defaultValue: "\(n) Meesh frappée", bundle: .main)
        default:
            return nil
        }
    }

    /// Le titre d'une SECTION — il nomme un découpage d'écran, pas un fait de produit.
    static func sectionTitle(_ section: String) -> String {
        switch section {
        case "cercles": return String(localized: "achievement.section.cercles", defaultValue: "Cercles", bundle: .main)
        case "parole": return String(localized: "achievement.section.parole", defaultValue: "Parole", bundle: .main)
        case "retouche": return String(localized: "achievement.section.retouche", defaultValue: "Retouches", bundle: .main)
        case "appels": return String(localized: "achievement.section.appels", defaultValue: "Appels", bundle: .main)
        case "ambassade": return String(localized: "achievement.section.ambassade", defaultValue: "Ambassade", bundle: .main)
        case "constance": return String(localized: "achievement.section.constance", defaultValue: "Constance", bundle: .main)
        case "monnaie": return String(localized: "achievement.section.monnaie", defaultValue: "Monnaie", bundle: .main)
        case "decouverte": return String(localized: "achievement.section.decouverte", defaultValue: "Découverte", bundle: .main)
        default: return section
        }
    }

    static let sectionsHeader = String(localized: "achievement.header", defaultValue: "Défis", bundle: .main)
    static let earned = String(localized: "achievement.earned", defaultValue: "Obtenu", bundle: .main)
}
