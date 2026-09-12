/// **Le cadrage d'un fond de scène — ce qu'il vaut à l'arrivée, et ce que le
/// geste en fait** (#6125, directive porteur 2026-09-12).
///
/// > « le Meeshy Composer doit intégrer dans canvas la pièce pour fit dans le
/// > canvas par défaut, et l'auteur zoom ou dézoom pour rogner correctement
/// > dans le canvas »
///
/// ## Ce que ce type rassemble, et pourquoi il n'existait pas
///
/// Le cadrage d'un fond était décidé à TROIS endroits qui ne se connaissaient
/// pas :
///
/// - le **renderer** traduisait `nil` en `.resizeAspectFill`
///   (`StoryBackgroundLayer.resolveImageGravity` / `resolveVideoGravity`) ;
/// - l'**ingestion** ne posait rien — donc `nil`, donc remplir — sans que ce
///   silence soit jamais écrit comme un choix ;
/// - le **double-tap** cyclait `nil → "fit" → "fill" → nil` comme si les trois
///   valeurs étaient trois états.
///
/// Aucun des trois n'avait tort isolément. Ce qui manquait est le mot qui les
/// relie : **`nil` n'est pas un état, c'est un ALIAS de « remplir ».**
///
/// > Un cycle écrit autour d'une valeur ABSENTE qui signifie quelque chose se
/// > raccourcit sans prévenir le jour où ce quelque chose change de défaut.
/// > Passer le défaut à « ajusté » aurait rendu le cycle `fit → fill → fill` —
/// > deux appuis sur trois sans effet à l'écran, c'est-à-dire le contrôle inerte
/// > que la loi 4 interdit, introduit par un lot qui ne touchait pas au geste.
///
/// C'est pourquoi `rendersFilled` est PUBLIC et nommé : tant que l'équivalence
/// `nil == remplir` reste implicite chez chaque lecteur, tout raisonnement sur
/// les trois valeurs en compte trois là où l'écran n'en montre que deux.
///
/// ## Ce que le lot ne change pas
///
/// **Le défaut du RENDERER reste « remplir ».** Le changement est posé à
/// l'INGESTION : une composition neuve écrit `"fit"`, une story déjà publiée
/// garde le cadrage qu'elle porte. Déplacer le défaut du renderer aurait
/// recadré tout l'existant, ce qu'aucune directive ne demande.
///
/// ## Placement
///
/// Dans `MeeshySDK` et non `MeeshyUI`, pour la raison que `StoryLetterboxFill`
/// documente déjà : `MeeshyUI` compile sous `defaultIsolation: MainActor`, donc
/// un type qui y naît ne peut plus être comparé depuis une suite non isolée. Un
/// moteur de règles sans état est un atome — donc du SDK core.
public enum StoryBackgroundFraming {

    /// Le média est AJUSTÉ : il tient entier dans le canvas, et laisse voir les
    /// bandes que `StoryLetterboxFill` remplit avec son ThumbHash.
    public static let fit = "fit"

    /// Le média REMPLIT le canvas : il le couvre, et déborde de ce qui dépasse.
    public static let fill = "fill"

    /// **Ce que ce mode rend VRAIMENT à l'écran**, alias compris.
    ///
    /// Le renderer ne connaît que deux gravités. Tout ce qui n'est pas `"fit"`
    /// — l'absence, `"fill"`, et jusqu'à une valeur inconnue venue d'un client
    /// plus récent ou d'une charge bricolée — retombe sur `.resizeAspectFill`.
    /// La règle le dit ici plutôt que de le laisser déduire : c'est le
    /// prédicat qui rend le cycle décidable.
    public static func rendersFilled(_ mode: String?) -> Bool {
        mode != fit
    }

    /// **Le cadrage qu'un média reçoit en fondant une slide.**
    ///
    /// `declared` est ce que la slide porte DÉJÀ (`backgroundTransform.videoFitMode`).
    /// Un choix que l'auteur a posé sur cette scène la concerne, elle, pas le
    /// fichier qui l'occupe : le réécrire à chaque média posé lui ferait
    /// reprendre indéfiniment le même geste.
    public static func posedFitMode(declared: String?) -> String {
        declared ?? fit
    }

    /// **Le cadrage suivant, en DEUX états.**
    ///
    /// La règle ne se lit pas « quelle valeur vient après celle-ci » mais
    /// « quel cadrage rend AUTREMENT que celui qu'on voit » — et c'est ce
    /// glissement qui la rend juste quelle que soit l'entrée, alias et valeurs
    /// inconnues comprises. Elle ne rend jamais `nil` : un « remplir » écrit
    /// comme absence serait nettoyé par `StoryBackgroundTransform.isIdentity`,
    /// et la slide repartirait au défaut — qui est désormais AJUSTER. L'auteur
    /// verrait son choix s'annuler tout seul.
    public static func nextFitMode(current: String?) -> String {
        rendersFilled(current) ? fit : fill
    }
}
