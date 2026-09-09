import Foundation
import MeeshySDK

/// CE QUE L'ÉCRAN « PROGRESSION » DIT (#5698) — les libellés, les symboles et
/// les phrases de palier, à côté de la loi de progression (`EngagementProgressResolver`)
/// qui, elle, ne connaît aucun mot : elle rend des clés et des nombres, ce
/// fichier les fait parler. Les mots sont ceux de la v3.1 web
/// (`apps/web-v3/src/lib/view/progression.ts`, #5547) — « même mot, même
/// icône » (dimension 6) — et vivent dans `Localizable.xcstrings` en sept langues.
///
/// Les `switch` sont EXHAUSTIFS sur les énumérations du catalogue : un axe ou
/// un succès ajouté à `EngagementCatalog.swift` sans libellé ici ne compile
/// plus — c'est le témoin d'exhaustivité que le compilateur tient gratuitement.
enum ProgressionCopy {
    // MARK: - Axes

    static func title(for axis: EngagementAxisKey) -> String {
        switch axis {
        case .audioMessage:
            return String(localized: "progression.axis.content.audio_message", defaultValue: "Messages vocaux", bundle: .main)
        case .textMessage:
            return String(localized: "progression.axis.content.text_message", defaultValue: "Messages texte", bundle: .main)
        case .post:
            return String(localized: "progression.axis.content.post", defaultValue: "Publications", bundle: .main)
        case .story:
            return String(localized: "progression.axis.content.story", defaultValue: "Stories", bundle: .main)
        case .reel:
            return String(localized: "progression.axis.content.reel", defaultValue: "Réels", bundle: .main)
        case .audioComment:
            return String(localized: "progression.axis.comment.audio", defaultValue: "Commentaires vocaux", bundle: .main)
        case .textComment:
            return String(localized: "progression.axis.comment.text", defaultValue: "Commentaires écrits", bundle: .main)
        case .privateConversation:
            return String(localized: "progression.axis.conversation.private", defaultValue: "Conversations privées", bundle: .main)
        case .publicConversation:
            return String(localized: "progression.axis.conversation.public", defaultValue: "Conversations publiques", bundle: .main)
        case .communityConversation:
            return String(localized: "progression.axis.conversation.community", defaultValue: "Conversations de communauté", bundle: .main)
        case .sticker:
            return String(localized: "progression.axis.tool.sticker", defaultValue: "Stickers posés", bundle: .main)
        case .inAppEdit:
            return String(localized: "progression.axis.tool.in_app_edit", defaultValue: "Montages dans l’app", bundle: .main)
        case .trackedLink:
            return String(localized: "progression.axis.social.tracked_link", defaultValue: "Liens créés", bundle: .main)
        case .share:
            return String(localized: "progression.axis.social.share", defaultValue: "Contenus partagés", bundle: .main)
        case .inviteJoined:
            return String(localized: "progression.axis.social.invite_joined", defaultValue: "Invités venus", bundle: .main)
        case .friendship:
            return String(localized: "progression.axis.social.friendship", defaultValue: "Amitiés nouées", bundle: .main)
        case .directPublish:
            return String(localized: "progression.axis.tool.direct_publish", defaultValue: "Publications directes", bundle: .main)
        }
    }

    /// SF Symbol — le même vocabulaire iconographique que le reste de l'app
    /// (`NotificationModels.systemIcon`, `UserStatsView`).
    static func symbol(for axis: EngagementAxisKey) -> String {
        switch axis {
        case .audioMessage: return "mic.fill"
        case .textMessage: return "text.bubble.fill"
        case .post: return "doc.text.fill"
        case .story: return "camera.fill"
        case .reel: return "film.fill"
        case .audioComment: return "waveform"
        case .textComment: return "text.quote"
        case .privateConversation: return "person.fill"
        case .publicConversation: return "globe"
        case .communityConversation: return "person.3.fill"
        case .sticker: return "face.smiling.fill"
        case .inAppEdit: return "wand.and.stars"
        case .trackedLink: return "link.badge.plus"
        case .share: return "square.and.arrow.up.fill"
        case .inviteJoined: return "person.badge.plus.fill"
        case .friendship: return "person.2.fill"
        case .directPublish: return "paperplane.fill"
        }
    }

    static func title(for family: EngagementAxisFamily) -> String {
        switch family {
        case .content:
            return String(localized: "progression.family.content", defaultValue: "Contenu produit", bundle: .main)
        case .comment:
            return String(localized: "progression.family.comment", defaultValue: "Commentaires", bundle: .main)
        case .conversation:
            return String(localized: "progression.family.conversation", defaultValue: "Conversations", bundle: .main)
        case .tool:
            return String(localized: "progression.family.tool", defaultValue: "Outils", bundle: .main)
        case .social:
            return String(localized: "progression.family.social", defaultValue: "Liens tissés", bundle: .main)
        }
    }

    // MARK: - Succès

    static func title(for achievement: EngagementAchievementKey) -> String {
        switch achievement {
        case .firstContent:
            return String(localized: "progression.achievement.first_content.title", defaultValue: "Premier pas", bundle: .main)
        case .allContentTypes:
            return String(localized: "progression.achievement.all_content_types.title", defaultValue: "Touche-à-tout", bundle: .main)
        case .firstVoice:
            return String(localized: "progression.achievement.first_voice.title", defaultValue: "Première voix", bundle: .main)
        case .editor:
            return String(localized: "progression.achievement.editor.title", defaultValue: "Monteur", bundle: .main)
        case .threeConversationKinds:
            return String(localized: "progression.achievement.three_conversation_kinds.title", defaultValue: "Trois cercles", bundle: .main)
        }
    }

    /// La CONDITION, lisible verrouillée — ce qu'il reste à faire, jamais un mystère.
    static func condition(for achievement: EngagementAchievementKey) -> String {
        switch achievement {
        case .firstContent:
            return String(localized: "progression.achievement.first_content.condition", defaultValue: "Publier un premier contenu, quel qu’il soit", bundle: .main)
        case .allContentTypes:
            return String(localized: "progression.achievement.all_content_types.condition", defaultValue: "Un message vocal, un message texte, une publication, une story et un réel", bundle: .main)
        case .firstVoice:
            return String(localized: "progression.achievement.first_voice.condition", defaultValue: "Un premier message ou commentaire vocal", bundle: .main)
        case .editor:
            return String(localized: "progression.achievement.editor.condition", defaultValue: "Un premier montage dans l’app avant de publier", bundle: .main)
        case .threeConversationKinds:
            return String(localized: "progression.achievement.three_conversation_kinds.condition", defaultValue: "Écrire dans une conversation privée, une publique et une de communauté", bundle: .main)
        }
    }

    // MARK: - Échelles

    enum ScaleKind {
        case badge, level, streak
    }

    /// « Niveau 3 » — le niveau courant, 0 avant le premier palier.
    static func levelTitle(_ level: Int) -> String {
        String(localized: "progression.level", defaultValue: "Niveau \(level)", bundle: .main)
    }

    /// « 350 points » — le score qui porte le niveau.
    static func score(_ score: Int) -> String {
        String(localized: "progression.points", defaultValue: "\(score) points", bundle: .main)
    }

    /// L'élan courant, et CE QUI LE PORTE (#5749) — un multiplicateur dont on
    /// ignore la cause ne se pilote pas, il se subit.
    static func elan(factor: Double, families: Int, windowDays: Int, hasStanding: Bool) -> String {
        // Le facteur est entier par construction (1 + crans) ; on l'affiche tel
        // quel plutôt qu'en « ×2,0 », qui suggérerait une précision inexistante.
        let f = Int(factor.rounded())
        let familles = families == 1
            ? String(localized: "progression.elan.family.one", defaultValue: "1 famille active", bundle: .main)
            : String(localized: "progression.elan.family.many", defaultValue: "\(families) familles actives", bundle: .main)
        let base = String(
            localized: "progression.elan.base",
            defaultValue: "Élan ×\(f) — \(familles) sur \(windowDays) jours",
            bundle: .main
        )
        let assise = hasStanding
            ? String(localized: "progression.elan.standing", defaultValue: ", plus votre assise", bundle: .main)
            : ""
        let effet = String(
            localized: "progression.elan.effect",
            defaultValue: "Vos prochains gestes rapportent \(f) fois plus.",
            bundle: .main
        )
        return "\(base)\(assise). \(effet)"
    }

    /// « 2 Meeshes » / « 1 Meesh » / « Aucune Meesh » — le solde (#5743).
    /// Le singulier est traité à part : « 1 Meeshes » se lirait comme un bogue.
    static func meeshBalance(_ balance: Int) -> String {
        if balance <= 0 {
            return String(localized: "progression.meesh.none", defaultValue: "Aucune Meesh", bundle: .main)
        }
        if balance == 1 {
            return String(localized: "progression.meesh.one", defaultValue: "1 Meesh", bundle: .main)
        }
        return String(localized: "progression.meesh.many", defaultValue: "\(balance) Meeshes", bundle: .main)
    }

    /// « 5 frappées depuis toujours » — le compteur À VIE, jamais le solde.
    static func meeshMintedLifetime(_ minted: Int) -> String {
        minted == 1
            ? String(localized: "progression.meesh.minted.one", defaultValue: "1 frappée depuis toujours", bundle: .main)
            : String(localized: "progression.meesh.minted.many", defaultValue: "\(minted) frappées depuis toujours", bundle: .main)
    }

    /// L'action de conversion — le prix vient du SERVEUR, jamais d'une constante locale.
    static func meeshMintAction(_ cost: Int) -> String {
        String(
            localized: "progression.meesh.mint",
            defaultValue: "Convertir \(cost) points en une Meesh",
            bundle: .main
        )
    }

    /// Ce qui manque, et pourquoi le plancher n'y répond pas.
    static func meeshMissing(missing: Int, floor: Int) -> String {
        let manque = String(
            localized: "progression.meesh.missing",
            defaultValue: "Encore \(missing) points convertibles avant une Meesh.",
            bundle: .main
        )
        guard floor > 0 else { return manque }
        let plancher = String(
            localized: "progression.meesh.floor",
            defaultValue: "Vos \(floor) points de conversation seront repris en dernier, sans éteindre aucun badge.",
            bundle: .main
        )
        return "\(manque) \(plancher)"
    }

    /// « 5 jours d’affilée » / « Aucune série en cours ».
    static func streak(_ currentDays: Int) -> String {
        guard currentDays > 0 else {
            return String(localized: "progression.streak.none", defaultValue: "Aucune série en cours", bundle: .main)
        }
        return String(localized: "progression.streak.days", defaultValue: "\(currentDays) jours d’affilée", bundle: .main)
    }

    /// « Record : 12 jours » — la série la plus longue, qui tient les jalons pour atteints.
    static func streakRecord(_ longestDays: Int) -> String {
        String(localized: "progression.streak.record", defaultValue: "Record : \(longestDays) jours", bundle: .main)
    }

    /// La phrase de la barre — ce qu'il reste AVANT le prochain palier, depuis
    /// le dernier franchi, ou l'échelle complète. Une barre sans phrase dit une
    /// fraction ; la phrase dit le pas.
    /// Le niveau NOMME son RANG (« niveau 4 »), jamais son seuil de points
    /// (« niveau 400 ») — le défaut de la notification `level_up` relevé en
    /// production, que la carte de niveau aurait rejoué.
    static func nextStep(for scale: EngagementScaleProgress, kind: ScaleKind, level: Int? = nil) -> String {
        guard let next = scale.nextThreshold, let remaining = scale.remainingToNext else {
            return String(localized: "progression.scale.complete", defaultValue: "Échelle complète", bundle: .main)
        }
        switch kind {
        case .badge:
            return String(localized: "progression.next.badge", defaultValue: "Encore \(remaining) avant le palier \(next)", bundle: .main)
        case .level:
            let nextLevel = (level ?? scale.reachedCount) + 1
            return String(localized: "progression.next.level", defaultValue: "Encore \(remaining) points avant le niveau \(nextLevel)", bundle: .main)
        case .streak:
            return String(localized: "progression.next.streak", defaultValue: "Encore \(remaining) jours avant le jalon de \(next)", bundle: .main)
        }
    }

    /// « Obtenu le 3 septembre 2026 », ou `nil` quand aucune trace gravée ne date le palier.
    static func obtained(_ reachedAt: String?) -> String? {
        guard let date = EngagementProgressResolver.reachedDate(reachedAt) else { return nil }
        let formatted = date.formatted(date: .long, time: .omitted)
        return String(localized: "progression.obtained", defaultValue: "Obtenu le \(formatted)", bundle: .main)
    }

    static func tierAccessibilityLabel(_ tier: EngagementTier) -> String {
        if tier.reached {
            let base = String(localized: "progression.a11y.tier.reached", defaultValue: "Palier \(tier.threshold) atteint", bundle: .main)
            if let dated = obtained(tier.reachedAt) { return "\(base) — \(dated)" }
            return base
        }
        return String(localized: "progression.a11y.tier.pending", defaultValue: "Palier \(tier.threshold) à atteindre", bundle: .main)
    }
}
