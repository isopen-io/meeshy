import CoreGraphics

/// **Ce qu'il faut pour qu'une rangée d'entrées TIENNE dans la largeur qu'on
/// lui donne** (#4379, et la « loi de tenue unique » de #4582).
///
/// ## Le défaut qui la fait naître
///
/// La rangée canonique de l'atelier porte sept entrées de 44 pt séparées de
/// 16 pt : `7 × 44 + 6 × 16 + 2 × 16 = 436 pt`, pour un iPhone 16 Pro qui en
/// offre 402. La septième — la timeline — ne rendait **aucun pixel**, pas même
/// un liseré, à taille de texte NOMINALE sur un écran COURANT.
///
/// Elle n'était pourtant pas injoignable : `ComposerToolRow` est un
/// `ScrollView`, et un balayage l'amenait sous le doigt. La loi 4 était tenue —
/// **ce qui manquait était le SIGNAL**. Et c'est ce qui a laissé le défaut
/// vivre : un défilement n'a pas d'état d'échec. Rien ne pouvait rougir.
///
/// > **Un `ScrollView` posé pour un cas accessible finit par masquer une entrée
/// > dans le cas nominal.** Le raisonnement d'origine mesurait six entrées à
/// > `accessibility-XXXL` ; personne n'a remesuré le jour où une septième est
/// > entrée par le slot de tête.
///
/// ## Pourquoi une RÈGLE, et pourquoi dans le SDK
///
/// `ComposerDocumentToolRowFit` portait déjà exactement ce raisonnement — et ne
/// gouvernait qu'**une** des rangées du composer. C'est le motif que #4582
/// condamne :
///
/// > *« Une loi qui ne couvre qu'un site n'est pas une loi, c'est un correctif
/// > local. Et elle est pire qu'absente pour le lecteur suivant : sa présence
/// > donne l'impression que la question est traitée. »*
///
/// La règle vit donc là où les deux rangées peuvent la lire — la rangée de
/// l'atelier est une vue du SDK, celle du document une vue de l'app — et elle
/// prend **tous ses nombres en paramètres**. Les deux rangées n'ont ni la même
/// tuile, ni le même écart, ni la même marge ; ce qu'elles partagent est
/// l'arithmétique, pas les valeurs. Une règle qui figerait les valeurs
/// n'aurait pas pu servir les deux, et on aurait réécrit la boucle.
///
/// ## Ce qu'elle décide, en une phrase
///
/// **L'écart se resserre tant que tout tient, jamais sous son plancher ; au-delà,
/// la rangée défile et la dernière entrée doit au moins DÉPASSER du bord.**
///
/// C'est la réponse 2 de #4379, avec la 1 en filet. La compression est une
/// RÉPONSE à un débordement, jamais un réglage permanent : une rangée courte
/// garde son air.
public nonisolated enum ComposerRowFit {

    /// **L'écart RENDU entre deux entrées.**
    ///
    /// - Parameter count: le nombre d'entrées, slot de tête compris.
    /// - Parameter tileWidth: la cible tactile d'une entrée — un plancher HIG,
    ///   jamais une variable d'ajustement. C'est l'écart qui cède, pas la cible.
    /// - Parameter nominalSpacing: l'air voulu quand la rangée tient.
    /// - Parameter minimumSpacing: le plus serré qu'on accepte avant de laisser
    ///   défiler. Sous ce seuil les glyphes se collent, et une rangée illisible
    ///   n'est pas une rangée qui tient.
    /// - Parameter margin: la marge horizontale de la rangée, comptée des DEUX
    ///   côtés — elle fait partie de ce qu'il faut loger.
    /// - Parameter available: la largeur MESURÉE de la rangée. `0` ou négatif ⇒
    ///   inconnue.
    ///
    /// **Une largeur inconnue rend le nominal, jamais une estimation.** Au
    /// premier rendu, avant que la mesure ne soit remontée, une rangée qui
    /// naîtrait tassée puis se détendrait ferait sauter les glyphes sous le
    /// doigt — un mouvement qui n'explique rien, donc pire que l'absence de
    /// mouvement (dimension 8).
    public static func spacing(count: Int,
                               tileWidth: CGFloat,
                               nominalSpacing: CGFloat,
                               minimumSpacing: CGFloat,
                               margin: CGFloat,
                               available: CGFloat) -> CGFloat {
        // Une entrée seule n'a aucun écart à distribuer : la division par
        // `count - 1` rendrait un infini, et l'infini se propagerait en `NaN`
        // dans la frame. Le cas se ferme ici, à la source.
        guard count > 1, available > 0 else { return nominalSpacing }
        let requise = rowWidth(count: count, tileWidth: tileWidth,
                               spacing: nominalSpacing, margin: margin)
        guard requise > available else { return nominalSpacing }
        let restant = available - CGFloat(count) * tileWidth - 2 * margin
        return max(minimumSpacing, restant / CGFloat(count - 1))
    }

    /// La largeur qu'occupe la rangée à cet écart, marges comprises.
    ///
    /// **Zéro entrée n'occupe rien — pas même ses marges** : une rangée absente
    /// ne réserve pas de place (loi 4).
    public static func rowWidth(count: Int,
                                tileWidth: CGFloat,
                                spacing: CGFloat,
                                margin: CGFloat) -> CGFloat {
        guard count > 0 else { return 0 }
        return CGFloat(count) * tileWidth
            + CGFloat(count - 1) * spacing
            + 2 * margin
    }

    /// **La dernière entrée montre-t-elle quelque chose ?**
    ///
    /// Le témoin porte sur le DÉBUT de la dernière entrée, jamais sur sa fin :
    /// c'est le premier pixel qui fait le signal. Une entrée coupée en deux dit
    /// « il y en a d'autres » ; une entrée entièrement hors champ ne dit rien.
    public static func lastTilePeeks(count: Int,
                                     tileWidth: CGFloat,
                                     spacing: CGFloat,
                                     margin: CGFloat,
                                     available: CGFloat) -> Bool {
        guard count > 0, available > 0 else { return false }
        let debutDeLaDerniere = margin + CGFloat(count - 1) * (tileWidth + spacing)
        return debutDeLaDerniere < available
    }
}
