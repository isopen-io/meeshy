import Foundation

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
}
