import Foundation

/// **Le `content` d'une story est-il une LÉGENDE, ou l'index dérivé de ses
/// overlays ?** (#4502)
///
/// ## Le défaut
///
/// Une story composée d'objets texte se restituait avec son texte rendu DEUX
/// fois : l'objet au centre du canvas, et le même texte en légende dessous —
/// sans qu'aucune description ait été saisie.
///
/// La cause n'est pas dans le client. C'est la passerelle qui écrit `content`,
/// et son intention est explicite
/// (`services/gateway/src/services/posts/storyContentComposition.ts`) :
///
/// > « Une story faite d'overlays n'a pas de légende : son `content` n'existe
/// > que comme **index de recherche**, produit par la concaténation des
/// > `textObjects`. »
///
/// Le fichier porte même le discriminant — `isContentDerivedFromTextObjects` —
/// dont le doc-comment pose la question mot pour mot. **Deux valeurs
/// correctement calculées, jamais consultées ensemble** : le serveur produit
/// l'index ET le moyen de le reconnaître, le lecteur ne lit que l'index.
///
/// Ce type est le miroir client de ce prédicat. Il est écrit ici, dans le SDK,
/// parce que les trois lecteurs de story — le viewer plein écran, le détail de
/// post, l'aperçu — poseront la même question, et qu'une seconde écriture
/// aurait divergé à la première évolution du séparateur.
///
/// ## Une valeur à DEUX natures pour un seul nom
///
/// `content` est tantôt une légende d'auteur, tantôt un dérivé. Le champ ne
/// porte pas sa PROVENANCE, donc chaque consommateur doit la redéduire — et le
/// premier qui oublie affiche deux fois le même texte. Le test est structurel,
/// exactement comme côté serveur : pas de drapeau à tenir en base, le dérivé
/// EST par construction la concaténation des overlays.
///
/// ## On décide sur l'ORIGINAL, on rend le RÉSOLU
///
/// La passerelle compose aussi l'index dans chaque langue
/// (`composeStoryContentForLanguage`), qui atterrit dans `translations`. Un
/// lecteur qui comparerait le contenu RÉSOLU — donc traduit — à la
/// concaténation des textes ORIGINAUX conclurait « ce n'est pas un index » dès
/// qu'il ne lit pas dans la langue d'écriture : **le doublon reviendrait pour
/// les seuls lecteurs d'une autre langue.** Le cas le plus difficile à voir et
/// le plus facile à provoquer.
///
/// ## Le fail-safe penche du côté de la LÉGENDE
///
/// Overlays absents du payload, story v1 sans `textObjects`, concaténation non
/// reconstituable : le verdict est « c'est une vraie légende », donc on
/// AFFICHE. Le choix n'est pas symétrique et c'est délibéré — montrer un
/// doublon est laid, taire la légende d'un auteur est une PERTE DE CONTENU.
/// Une garde qui hésite tombe du côté où l'on ne perd rien.
public nonisolated enum StoryDerivedContent {

    /// Le séparateur de la passerelle. Un simple espace — recopié ici parce
    /// qu'il fait partie du contrat de comparaison, pas de la mise en forme :
    /// s'il change d'un côté, l'égalité cesse et le doublon revient.
    public static let overlaySeparator = " "

    /// L'index tel que la passerelle le compose : les textes non vides, dans
    /// l'ordre, joints par un espace. Les overlays vides sont ÉCARTÉS — sans
    /// quoi la concaténation porterait des séparateurs en trop et ne serait
    /// jamais égale au contenu servi.
    public static func composed(_ overlayTexts: [String]) -> String {
        overlayTexts
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: overlaySeparator)
    }

    /// **Ce contenu est-il l'index dérivé ?**
    ///
    /// Le test est une ÉGALITÉ, jamais une inclusion : « Bonjour le monde
    /// entier » sur des overlays « Bonjour » et « le monde » est du texte que
    /// l'auteur a écrit, et le taire lui prendrait sa légende.
    public static func isDerivedIndex(content: String?, overlayTexts: [String]) -> Bool {
        guard let content else { return false }
        let normalise = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalise.isEmpty else { return false }
        let index = composed(overlayTexts)
        guard !index.isEmpty else { return false }
        return normalise == index
    }

    /// **Ce que le lecteur rend sous le canvas** — `nil` ⇒ rien, la scène le
    /// dit déjà.
    ///
    /// - Parameter original: le `content` tel qu'il a été écrit, JAMAIS le
    ///   résolu. C'est lui qui décide.
    /// - Parameter resolved: ce que le Prisme sert au lecteur. C'est lui qu'on
    ///   rend.
    public static func caption(original: String?,
                               resolved: String?,
                               overlayTexts: [String]) -> String? {
        guard !isDerivedIndex(content: original, overlayTexts: overlayTexts),
              let resolved,
              !resolved.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }
        return resolved
    }
}
