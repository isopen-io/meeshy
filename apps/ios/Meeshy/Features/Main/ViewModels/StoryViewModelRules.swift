/// Règles pures de `StoryViewModel`, sans état ni dépendance UI — déjà
/// testables telles quelles : garde « vu localement » (`shouldKeepLocalViewed`),
/// URLs média d'une story (`mediaURLStrings`), épinglage offline (store cible +
/// échéance de pin), mapping profil → interstitiel de groupe, et mentions
/// déclarées (publication/édition).
///
/// Extrait de `StoryViewModel.swift` (#4425).

import Foundation
import MeeshySDK
// `ComposerReference` / `ComposerReferences` vivent dans MeeshyUI, pas dans le
// SDK : `declaredMentions` les prend en entrée. Le découpage #4425 a sorti ces
// règles d'un fichier qui importait déjà MeeshyUI pour ses vues — l'import
// devait suivre les TYPES, pas rester avec le code qu'on laisse derrière.
import MeeshyUI

extension StoryViewModel {
    /// Garde « viewed monotone » raffinée (directive 2026-07-29) : une fois
    /// vue localement, une story RESTE vue même si le serveur (laggé) dit le
    /// contraire — SAUF quand son contenu a été édité APRÈS la vue locale :
    /// le serveur a alors volontairement effacé les vues (reset
    /// d'engagement), la story redevient légitimement non-vue.
    /// `contentEditedAt` est le SEUL horodatage fiable pour ce test —
    /// `updatedAt` bouge sur chaque écriture (compteurs de vues inclus).
    nonisolated static func shouldKeepLocalViewed(localViewedAt: Date?, contentEditedAt: Date?) -> Bool {
        guard let contentEditedAt else { return true }
        guard let localViewedAt else { return false }
        return localViewedAt >= contentEditedAt
    }

    /// Extraction pure des URLs média d'une story (background + foreground + audio),
    /// dédupliquées. Pure et testable, sans effet de bord.
    static func mediaURLStrings(for story: StoryItem) -> [String] {
        var urls: [String] = story.media.compactMap(\.url)

        if let mediaObjs = story.storyEffects?.mediaObjects {
            for obj in mediaObjs {
                if let urlStr = story.media.first(where: { $0.id == obj.postMediaId })?.url {
                    urls.append(urlStr)
                }
            }
        }

        if let audioObjs = story.storyEffects?.audioPlayerObjects {
            for obj in audioObjs {
                if let urlStr = story.media.first(where: { $0.id == obj.postMediaId })?.url {
                    urls.append(urlStr)
                }
            }
        }

        if let bgAudioId = story.storyEffects?.backgroundAudioId {
            if let urlStr = story.media.first(where: { $0.id == bgAudioId })?.url {
                urls.append(urlStr)
            }
        }

        return Array(Set(urls))
    }

    /// Données de l'interstitiel affiché au passage au groupe de story d'une
    /// AUTRE personne : identité complète (nom, bannière) + mood. La présence
    /// est lue par la vue directement (`PresenceManager.shared`, singleton).
    struct StoryGroupIntro: Equatable {
        let userId: String
        /// À la construction (placeholder), reçoit `StoryGroup.username` — qui
        /// porte en réalité `APIAuthor.name` (displayName ?? username). Le
        /// profil résolu l'écrase avec le VRAI handle (`applyIntroProfile`) :
        /// c'est lui que la carte rend après « @ » (directive user 2026-08-20).
        var username: String
        var displayName: String?
        var bannerURL: String?
        var bannerThumbHash: String?
        var moodEmoji: String?
        var moodMessage: String?
    }

    /// Mapping pur profil → intro (testable) : displayName explicite, sinon
    /// « Prénom Nom », sinon nil (la vue retombe sur le username).
    static func applyIntroProfile(_ user: MeeshyUser, to intro: inout StoryGroupIntro) {
        let fullName = [user.firstName, user.lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        intro.displayName = user.displayName ?? (fullName.isEmpty ? nil : fullName)
        // Le placeholder portait `StoryGroup.username` = `APIAuthor.name`
        // (displayName ?? username) : la ligne « @… » de la carte affichait le
        // display name. Le profil est la seule source qui connaît le handle.
        intro.username = user.username
        intro.bannerURL = user.banner
        intro.bannerThumbHash = user.bannerThumbHash
    }

    // MARK: - R5 Offline replay pin (story vue = médias non-évincables jusqu'à expiry)

    /// Store disque cible d'un pin de média story.
    enum StoryPinStore: Equatable {
        case video, audio, images
    }

    /// Échéance du pin : l'expiry de la story (le pin ne doit jamais lui
    /// survivre). Fallback aligné sur `toStoryGroups` : createdAt + fenêtre
    /// publique (`StoryItem.defaultExpiryInterval`, 20 h depuis 2026-08-12).
    static func pinDeadline(for story: StoryItem) -> Date {
        story.expiresAt ?? story.createdAt.addingTimeInterval(StoryItem.defaultExpiryInterval)
    }

    /// Plan de pin PUR (testable) : chaque URL média de la story routée vers
    /// son store disque — miroir exact du routage de `prefetchStoryMediaURLs`
    /// (par `FeedMedia.type`, inconnu → images). Le pin ne télécharge RIEN :
    /// il protège de l'éviction budget LRU ce que les chemins de lecture /
    /// prefetch ont déposé (ou déposeront — pin-avant-download supporté).
    static func pinTargets(for story: StoryItem) -> [(urlString: String, store: StoryPinStore)] {
        Self.mediaURLStrings(for: story).map { urlString in
            // R7 — même résolution de type que le prefetch : le pin doit
            // protéger le MÊME store que celui où le média est réellement rangé.
            let kind = StoryMediaStoreRouter.effectiveKind(
                declaredType: story.media.first(where: { $0.url == urlString })?.type,
                urlString: urlString
            )
            switch kind {
            case .video: return (urlString, .video)
            case .audio: return (urlString, .audio)
            default: return (urlString, .images)
            }
        }
    }

    /// Ce qu'une publication ou une édition DÉCLARE au serveur : les modes que
    /// l'auteur a choisis, PLUS les badges posés sur le canevas.
    ///
    /// On ne dérive plus les `@handle` des objets texte : le serveur les relit
    /// lui-même (`content` ET `storyEffects.textObjects[].text`), et deux
    /// dériveurs finiraient par ne plus dire la même chose.
    ///
    /// Les badges, eux, ne peuvent venir que d'ici : le serveur les EXCLUT de
    /// sa relecture — `referenceUserId` est ce qui distingue un badge d'une
    /// phrase — et ils survivent à ce que la liste déclarée ne traverse pas
    /// toujours (reprise de brouillon, édition d'une story publiée). Sans cette
    /// union, une pastille visible sur la slide ne préviendrait personne.
    static func declaredMentions(
        declared: [PostMentionInput],
        effects: StoryEffects
    ) -> [PostMentionInput] {
        var seen = Set(declared.compactMap(\.userId))
        let badges = effects.textObjects.compactMap { object -> PostMentionInput? in
            guard let userId = object.referenceUserId,
                  seen.insert(userId).inserted else { return nil }
            return PostMentionInput.id(userId, display: .pinned)
        }
        return declared + badges
    }

    /// Variante prenant l'état VIVANT du composer plutôt que sa charge utile —
    /// le chemin d'édition n'a pas de `StoryUploadState` où la figer.
    static func declaredMentions(
        references: [ComposerReference],
        effects: StoryEffects
    ) -> [PostMentionInput] {
        declaredMentions(declared: ComposerReferences.payload(references), effects: effects)
    }
}
