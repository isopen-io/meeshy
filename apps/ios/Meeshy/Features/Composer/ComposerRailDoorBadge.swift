import Foundation
import MeeshySDK

/// **Ce qu'une porte du rail PORTE DÉJÀ** (#4994, directive porteur
/// 2026-09-03).
///
/// > « lorsqu'une donnée a été faite (mise) pour un des composants, il faut
/// > insérer le compteur par dessus le composant ! »
///
/// ## Le défaut que ça ferme
///
/// Le rail *leading* peint dix portes identiques. Rien à l'écran ne disait
/// qu'une scène portait déjà trois textes, deux stickers et un lieu : pour le
/// savoir, il fallait ouvrir chaque porte. La matière était bien là — sur le
/// canvas pour ce qui se voit, dans la publication pour ce qui la qualifie —
/// et le rail restait muet sur la moitié qu'on ne voit pas.
///
/// ## Pourquoi une VALEUR entre le modèle et la règle
///
/// Les dix portes ne comptent pas dans le même magasin : cinq lisent la
/// `StorySlide`, quatre la `MeeshyPublication`, une le fond. Faire lire ces
/// deux mondes à une seule fonction l'aurait obligée à connaître l'état du
/// meuble — donc à cesser d'être éprouvable sans monter une vue.
///
/// `ComposerRailMatter` est le RELEVÉ ; `count(_:in:)` est la LOI. Le meuble
/// remplit le premier, la seconde n'a plus qu'à répondre — et les deux se
/// testent séparément, ce qui est exactement ce qui manque quand une règle
/// lit son entrée elle-même.
nonisolated struct ComposerRailMatter: Equatable, Sendable {

    /// Les objets texte POSÉS sur la scène. Pas la description, qui appartient
    /// à la slide et a sa propre porte.
    var texts: Int = 0

    /// **Les images et vidéos de la scène — FOND COMPRIS** (#5014, directive
    /// porteur 2026-09-03).
    ///
    /// > « l'image de fond ou la vidéo de fond d'une scène compte comme un
    /// > élément dans outils image, pas seulement les éléments de foreground »
    ///
    /// Ce champ excluait le fond, et ce n'était pas une négligence : il suivait
    /// `ComposerSceneObjectCount`, qui l'exclut parce qu'un fond n'est pas un
    /// objet POSÉ — ni position, ni puce, ni sélection. Le raisonnement reste
    /// juste **pour cette règle-là**, qui répond à « combien d'objets le plan 2D
    /// permet-il de désigner ? ».
    ///
    /// La porte image ne pose pas cette question. Elle demande « combien
    /// d'images cette scène porte-t-elle ? », et un fond en est une.
    ///
    /// > Deux règles voisines peuvent compter la même famille et devoir
    /// > diverger : ce n'est pas la MATIÈRE qui décide du filtre, c'est la
    /// > QUESTION. Emprunter le filtre du voisin parce qu'il porte sur le même
    /// > tableau est la façon la plus discrète de répondre à côté.
    ///
    /// Un fond de COULEUR n'y entre pas : ce n'est pas une image, et la porte
    /// image ne le sert pas.
    var media: Int = 0

    /// Les pistes, fond COMPRIS — la porte `sound` ouvre la feuille des deux,
    /// et son placement (`.background` / premier plan) s'y choisit. Compter le
    /// seul premier plan laisserait un son de fond invisible sur la porte qui
    /// le sert.
    var sounds: Int = 0

    var stickers: Int = 0

    /// Le lieu de la PUBLICATION plus les pastilles posées sur la scène : la
    /// porte `place` sert les deux selon le format (`ComposerRailDoor.level`),
    /// donc son compte les additionne.
    var places: Int = 0

    /// Les balises de la publication — **REÇUES déjà comptées**, jamais
    /// re-dérivées ici (#5007).
    ///
    /// Ce champ a d'abord pris le TEXTE et appelé `ComposerHashtags.tags`
    /// lui-même. Le résultat était juste au chiffre près, et c'était quand
    /// même une **seconde dérivation du même fait** : `composerHashtags` est le
    /// site unique du meuble, et son doc-comment dit pourquoi — deux motifs
    /// voisins finissent par diverger sur un cas limite (`page#section`,
    /// `a#b`), et l'écran montrerait alors une balise que l'envoi n'emporte
    /// pas.
    ///
    /// > La garde qui interdit ce doublon (`test_lesBalises_neSontDeriveesQuUneFois`)
    /// > balaie l'unité du meuble. Ce fichier n'en faisait pas partie : la
    /// > faute était invisible **parce qu'elle vivait dans un fichier neuf**,
    /// > pas parce qu'elle était subtile. Il y est entré dans le même commit.
    ///
    /// Le champ est désormais SYMÉTRIQUE de `mentions`, qui recevait déjà son
    /// compte de `composerReferences` — c'est l'asymétrie entre les deux qui
    /// aurait dû se voir à la relecture.
    var hashtags: Int = 0

    /// Les personnes nommées — `composerReferences`, jamais les `@` relus dans
    /// le texte : le second chemin dériverait du premier et les deux
    /// divergeraient au premier désaccord (`ComposerMentionQuery.payload` porte
    /// déjà cette décision).
    var mentions: Int = 0

    /// Les traits du calque de dessin.
    var strokes: Int = 0

    // **`hasBackground` a été RETIRÉ au #5014**, et son retrait est la moitié
    // de la directive qu'on ne voit pas.
    //
    // Le fond comptant désormais sur la porte IMAGE, le garder ici aurait fait
    // afficher `1` sur deux icônes voisines du même rail pour un seul objet —
    // une scène qui n'a qu'un fond aurait dit « une image » ET « un fond », que
    // l'auteur lit comme deux images.
    //
    // Le signal n'est pas perdu pour autant, et c'est ce qui rend le retrait
    // sûr : **le fond est la seule matière qu'on ne peut pas manquer à
    // l'écran** — il remplit la carte, sous les yeux. Une pastille qui le
    // compte nomme ce que la scène montre déjà, et un signe qui n'apprend rien
    // occupe la place de ce qui apprend.
    //
    // Le champ part ENTIER plutôt que de rester inutilisé : une donnée sans
    // lecteur est exactement le défaut que ce fichier a déjà payé au #5007.

    /// La description de la slide, si elle est écrite.
    var hasDescription: Bool = false

    /// **Le CORPS du post, s'il est écrit** (#4890). Champ SÉPARÉ de
    /// `hasDescription`, parce que les deux textes existent en même temps sur un
    /// post : la description est la légende du média courant, le contenu est le
    /// corps de la publication. Un seul booléen aurait allumé les deux pastilles
    /// pour un seul texte écrit — un témoin qui affirme une matière absente.
    var hasContent: Bool = false
}

nonisolated enum ComposerRailDoorBadge {

    /// **Le relevé, composé des DEUX magasins.**
    ///
    /// Il est PUR : la slide et les faits du meuble entrent, un relevé sort.
    /// C'est ce qui permet d'éprouver « le fond compte sur la porte image, un
    /// fond de couleur non » sans monter le composer.
    ///
    /// `hasDocumentBackground` a disparu de la signature au #5014 : il ne
    /// servait qu'à la pastille du fond, qui n'existe plus. Le garder aurait
    /// laissé un paramètre que personne ne lit.
    static func matter(slide: StorySlide,
                       hashtags: Int,
                       description: String,
                       content: String,
                       mentions: Int,
                       hasDocumentLocation: Bool) -> ComposerRailMatter {
        let effets = slide.effects
        return ComposerRailMatter(
            texts: effets.textObjects.count,
            // Fond COMPRIS (#5014) — aucun filtre : la porte image compte les
            // images de la scène, et le fond en est une.
            media: (effets.mediaObjects ?? []).count,
            sounds: (effets.audioPlayerObjects ?? []).count,
            stickers: (effets.stickerObjects ?? []).count,
            places: effets.locationObjects.count + (hasDocumentLocation ? 1 : 0),
            hashtags: hashtags,
            mentions: mentions,
            strokes: (effets.drawingStrokes ?? []).count,
            hasDescription: !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            // Le MÊME prédicat que la description, et volontairement : un texte
            // blanc n'est pas un texte, ici comme là-bas
            // (`ComposerSlideTextRole.applyCaption`). Deux normalisations pour
            // une même question auraient divergé au premier réglage.
            hasContent: !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        )
    }

    /// **Ce que la pastille d'une porte affiche — `nil` quand il n'y a rien à
    /// dire.**
    ///
    /// Zéro ⇒ AUCUNE pastille, jamais un « 0 » grisé : c'est la loi 4 appliquée
    /// à un témoin plutôt qu'à un contrôle — un signe qui n'apprend rien occupe
    /// la place de ce qui apprend.
    ///
    /// Le `switch` est exhaustif : une onzième porte ne compile pas tant
    /// qu'elle n'a pas dit ce qu'elle porte. C'est très exactement la question
    /// qu'on oublie de se poser en ajoutant un bouton — et la porte `background`
    /// montre pourquoi elle mérite d'être posée : elle ne porte RIEN, et ce
    /// silence est une réponse (#5014), pas un oubli.
    static func count(_ door: ComposerRailDoor, in matter: ComposerRailMatter) -> Int? {
        let brut: Int
        switch door {
        case .description: brut = matter.hasDescription ? 1 : 0
        // Une pastille BINAIRE, comme la description : un corps de post est un
        // texte, pas une collection — « 1 » y dit « il y en a un », et compter
        // ses caractères ou ses lignes n'apprendrait rien sur ce que la porte
        // ouvre.
        case .content:     brut = matter.hasContent ? 1 : 0
        case .media:       brut = matter.media
        case .sound:       brut = matter.sounds
        case .text:        brut = matter.texts
        // **Aucune pastille sur le FOND** (#5014) : il est compté par la porte
        // image, et il remplit la carte sous les yeux de l'auteur. Le compter
        // ici l'annoncerait deux fois pour un seul objet.
        case .background:  brut = 0
        case .drawing:     brut = matter.strokes
        case .sticker:     brut = matter.stickers
        case .mention:     brut = matter.mentions
        case .hashtag:     brut = matter.hashtags
        case .place:       brut = matter.places
        }
        return brut > 0 ? brut : nil
    }

    /// Le relevé COMPLET, une entrée par porte servie — ce que le rail reçoit.
    ///
    /// Les portes sans matière n'y entrent pas : le rail lit une carte, et une
    /// entrée absente est la même réponse que `count` rend, sans qu'il ait à
    /// re-poser la question.
    static func badges(for doors: [ComposerRailDoor],
                       in matter: ComposerRailMatter) -> [ComposerRailDoor: Int] {
        var carte: [ComposerRailDoor: Int] = [:]
        for door in doors {
            if let n = count(door, in: matter) { carte[door] = n }
        }
        return carte
    }
}
