import Foundation
import MeeshySDK

/// **Les légendes du composer, classées par MÉDIA** (#4890).
///
/// La clé est l'URL LOCALE du média, parce que c'est le seul identifiant qui
/// existe pendant la composition : l'id serveur (`PostMedia.id`) n'est attribué
/// qu'à l'upload. Le composer tient déjà ses médias sous cette clé
/// (`slideIdByMediaURL`, `mediaRoleByURL`) — en inventer une seconde ferait
/// diverger deux index du même fait.
typealias ComposerMediaCaptions = [URL: String]

/// **Ce que le texte d'une slide VEUT DIRE, selon le profil** (#4890).
///
/// `docs/product/meeshy-composer-modele.md` § 3 est l'autorité, et il porte la
/// table :
///
/// | | Story | Réel | Post | Mood |
/// |---|---|---|---|---|
/// | Une slide EST | une story entière | le réel entier | **UN média du post** | — |
/// | Le texte de la slide est | le contenu | le contenu | **la légende de ce média** | le contenu |
/// | `content` de la publication | = le texte de sa slide | idem | **propre au post** | le contenu |
///
/// ## Pourquoi ce type existe, et pourquoi il ne s'appelle pas « description »
///
/// Le mot « description » couvre les DEUX rôles. C'est ce recouvrement qui a
/// permis au défaut de vivre : `ComposerRailDoor.description` ÉNONCE la règle
/// correctement depuis #4045 — « en S/R cette description EST le contenu de la
/// publication ; en P c'est la légende du média courant » — pendant que le code
/// écrivait `currentSlide.content` dans les deux cas. Le document, lui, nommait
/// même le site :
///
/// > « Le champ posé par la Phase 2 (`sceneDescriptionField`) est aujourd'hui
/// > lié au `content` du document. **C'est juste en S/R et faux en P.** »
///
/// > **Un nom qui vaut pour deux rôles ne fait pas rougir quand on sert le
/// > mauvais.** « Description » redevient donc ce qu'il aurait dû rester : le
/// > libellé d'un champ à l'écran, jamais un nom de modèle.
///
/// ## La légende est par MÉDIA, pas par slide
///
/// Le modèle dit « légende de la slide » ; la directive porteur du 2026-09-02
/// dit « chaque IMAGE doit avoir sa légende ». En Post, une slide EST un média
/// (`MeeshyComposerHost+Intake` : « en Post, une slide est UN média »), donc les
/// deux coïncident **aujourd'hui**.
///
/// C'est une coïncidence de la forme actuelle, pas une identité. La source de
/// vérité côté fil est `PostMedia.caption` — **par média**. Le jour où un post
/// porte deux médias sur une slide, une légende rattachée à la slide servirait
/// le mauvais, et rien ne rougirait : les deux nombres restent égaux tant que la
/// coïncidence tient.
nonisolated enum ComposerSlideTextRole: Equatable {

    /// Le texte de la slide EST le contenu de la publication — Story, Réel,
    /// Mood. Il appartient à la publication, pas à un média.
    case content

    /// Le texte de la slide est la LÉGENDE du média de cette slide — Post. Il
    /// appartient au média, et voyage en `PostMedia.caption`.
    case caption

    /// Le `switch` est EXHAUSTIF : un cinquième profil ne compilera pas tant
    /// qu'il n'aura pas dit ce que le texte de sa slide VEUT DIRE — ce qui est
    /// exactement la question que la Phase 2 n'avait pas posée.
    static func role(for format: ComposerFormat) -> ComposerSlideTextRole {
        switch format {
        case .story, .reel, .status: return .content
        case .post:                  return .caption
        }
    }

    /// **Une légende a besoin d'un média À QUI appartenir ; un contenu, non.**
    ///
    /// C'est l'asymétrie qui décide si le champ peut être servi quand rien n'est
    /// sélectionné — et elle se dérive du rôle plutôt que d'être retestée au
    /// site d'appel, où elle serait réécrite à chaque nouvelle surface.
    var needsMediaTarget: Bool { self == .caption }

    /// **Écrire une légende, ou la retirer.**
    ///
    /// Un texte vide ou blanc RETIRE la clé au lieu d'y laisser `""` : une clé
    /// présente à valeur vide voyagerait jusqu'au fil et poserait une légende
    /// blanche sur le média — le contraire de « pas de légende ». C'est la même
    /// distinction que `text.isEmpty ? nil : text` sur `ComposerDocumentDraft`,
    /// appliquée à une carte.
    ///
    /// Le texte non vide est conservé TEL QUEL — ni rogné, ni normalisé : c'est
    /// la prose de l'auteur, pas un identifiant.
    ///
    /// `media == nil` ⇒ rien n'est écrit. Il n'y a pas de légende « de la
    /// publication », et fabriquer une clé de repli poserait le texte sur un
    /// média que l'auteur n'a pas désigné.
    static func applyCaption(_ text: String, to media: URL?, in captions: inout ComposerMediaCaptions) {
        guard let media else { return }
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            captions.removeValue(forKey: media)
        } else {
            captions[media] = text
        }
    }

    /// **La légende SORT du composer par la clé que le publieur sait traduire**
    /// (#4890, seconde moitié).
    ///
    /// ## Le défaut que ceci referme
    ///
    /// `applyCaption` ci-dessus est le seul ÉCRIVAIN de `documentMediaCaptions`,
    /// et jusqu'ici la carte n'avait qu'un seul LECTEUR : le getter de son
    /// propre binding. Mesuré le 2026-09-04 : aucun chemin de publication ne la
    /// consultait. L'auteur tapait une légende, la voyait à l'écran, la
    /// validait — et elle mourait à la fermeture du composer.
    ///
    /// > Un texte saisi qui n'atteint aucun destinataire est PIRE qu'un champ
    /// > absent : le champ absent ne promet rien, celui-là promet et ment. Et le
    /// > défaut est invisible depuis le site où il naît — `applyCaption` fait
    /// > exactement ce qu'il annonce ; c'est en aval que personne n'écoute.
    ///
    /// ## Pourquoi une TRADUCTION de clé, et pas une carte de plus
    ///
    /// Trois clés cohabitent sur la route d'une légende, et chacune est la seule
    /// disponible à son étage :
    ///
    /// | étage | clé | pourquoi celle-là |
    /// |---|---|---|
    /// | composition | `URL` locale | l'id serveur n'existe pas encore |
    /// | remise au publieur | `StoryMediaObject.id` | ce que `ComposerMediaAccessibility` transporte |
    /// | envoi | `PostMedia.id` | attribué par l'upload, traduit par `StoryMediaTextMapping.serverKeyed` |
    ///
    /// Cette fonction fait le PREMIER saut ; le SDK fait le second. Écrire
    /// directement en ids d'objet à la saisie aurait été plus court et FAUX :
    /// l'objet de canvas peut être remplacé (re-pose du même fichier, changement
    /// de fond) alors que le fichier, lui, ne bouge pas — la légende suivrait
    /// alors un objet mort.
    ///
    /// ## Quel objet porte la légende d'une slide
    ///
    /// Le FOND, jamais un objet de premier plan. `slideIdByMediaURL` n'indexe
    /// que les médias qui ont FONDÉ une slide (`role == .background`,
    /// `MeeshyComposerHost+Intake`) : une URL présente ici désigne donc le fond
    /// de sa slide. Le repli sur le premier objet média sert le cas où le
    /// drapeau `isBackground` n'est pas encore posé — sans lui, une légende
    /// disparaîtrait selon un détail d'ordonnancement plutôt que selon ce que
    /// l'auteur a fait.
    ///
    /// Un média sans slide, une slide sans objet, un texte vide : l'entrée est
    /// OMISE. Une clé fabriquée poserait la légende sur un média que l'auteur
    /// n'a pas désigné — la faute exacte que `applyCaption` refuse déjà quand
    /// `media == nil`.
    static func canvasKeyed(_ captions: ComposerMediaCaptions,
                            slideIdByMediaURL: [URL: String],
                            slides: [StorySlide]) -> [String: String] {
        captions.reduce(into: [:]) { keyed, entree in
            let (url, texte) = entree
            guard !texte.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let slideId = slideIdByMediaURL[url],
                  let slide = slides.first(where: { $0.id == slideId })
            else { return }
            let objets = slide.effects.mediaObjects ?? []
            guard let porteur = slide.effects.resolvedBackgroundMedia ?? objets.first
            else { return }
            keyed[porteur.id] = texte
        }
    }
}
