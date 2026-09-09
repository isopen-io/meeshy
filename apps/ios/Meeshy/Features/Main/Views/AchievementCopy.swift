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
