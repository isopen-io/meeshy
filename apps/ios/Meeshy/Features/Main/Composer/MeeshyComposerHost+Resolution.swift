import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce que le meuble RÉSOUT de sa composition et de sa porte** — les deux
/// gates, le profil, le format qui GOUVERNE, la surface MONTÉE, qui peint le
/// chrome, où l'éventail se peint et quelles audiences sont offertes.
///
/// Extrait de `MeeshyComposerHost.swift` le 2026-09-02 — RELOCALISATION pure,
/// même forme qu'aux #4084 et #4102 : le fichier principal franchissait le
/// plafond de 1 100 lignes (1 144 mesurées par `FileSizeBudgetGuardTests`), et
/// la liste `legacyOverBudget` est un cliquet FERMÉ — pas de 43ᵉ. Le
/// découpage suit une responsabilité, pas une tranche : ces onze propriétés
/// répondent toutes à la même question — « étant donné ce qui est COMPOSÉ et
/// la porte qui a OUVERT, que monte-t-on, et qui peint ? » — et aucune n'est
/// un état ni une vue. Le `body` continue de les LIRE ; il ne les recopie pas,
/// et c'est ce que ses gardes mesurent (`if paintsFormatFan { plateauTools }`,
/// `if !chromeOwner.assembles(.publish) && !paintedSocleZones.isEmpty`).
///
/// Chacune est la LECTURE d'une règle pure — `ComposerReelGate`,
/// `ComposerMoodGate`, `ComposerProfile`, `ComposerFormatFanPolicy`,
/// `ComposerSurfaceRouting`, `ComposerChromeOwnership`,
/// `ComposerFormatFanPlacement`, `ComposerAudienceOffer` — jamais une
/// condition écrite dans le corps : une condition posée dans un `body` est
/// invisible aux tests, et c'est ainsi qu'une règle produit se met à exister
/// en deux exemplaires. Ce qui reste dans le fichier principal est le TYPE :
/// ses entrées, son état, son `init`, son `body`, ses amorces et l'aiguillage
/// des surfaces.
///
/// Le nom suit le motif `MeeshyComposerHost+*` : c'est ce qui garde le fichier
/// DANS l'unité que `AppSourceGuard.composerHostSource()` lit, donc les gardes
/// qui ancrent sur `var reelGate`, `var mountedSurface`,
/// `ComposerChromeOwnership.owner(for: mountedSurface)` ou
/// `Binding(get: { self.selectedFormat }, set: { self.currentFormat = $0 })`
/// restent vivantes sans qu'aucune n'ait à être repointée. Rien n'est
/// `private` ici, et rien ne l'était avant : ces membres étaient déjà lus
/// depuis `+Surfaces`, `+Socle`, `+Audience` et `+Intake`.
extension MeeshyComposerHost {

    // MARK: - Les gates et le profil — ce que la composition QUALIFIE
    /// L'éventail RESPIRE : il est recalculé à chaque passe de rendu sur la
    /// composition du moment. Poser deux images puis en retirer une retire le
    /// réel de l'offre — c'est ce que V1 avait écrit et débranché.
    ///
    /// **B3 (#3926) — il respire sur les DEUX compositions.** Le média peut
    /// vivre dans le document (`documentLocalMedia`, avant la bascule) OU dans
    /// l'atelier (`currentEffects`, après que B1 l'y a porté). L'éventail doit
    /// offrir RÉEL dans les deux états — sur le document, c'est
    /// `documentComposesReel` qui qualifie, exactement le gate que le sélecteur
    /// de destination retiré lisait déjà. Sans le premier terme, le fan
    /// n'offrirait jamais RÉEL tant qu'on n'a pas déjà basculé — l'offre
    /// arriverait trop tard pour servir à basculer.
    var reelGate: Bool {
        documentComposesReel
            || ComposerReelGate.compositionQualifiesAsReel(viewModel.currentEffects)
    }
    /// **#4030 — le gate du mood, nourri de la MÊME composition que celui du
    /// réel.** Le mood est une carte SANS scène et SANS média : il ne regarde
    /// donc pas `currentEffects` objet par objet comme le fait le réel, mais
    /// les deux faits que le meuble tient déjà — ce que l'auteur a ingéré
    /// (`documentLocalMedia`) et si une scène existe (`documentHasScene`, qui
    /// couvre autant le fond de couleur que les médias montés en slides).
    ///
    /// `moodEmoji` entre dans le prédicat pour la raison écrite sur
    /// `ComposerMoodGate` : sans lui, effacer sa phrase pour la réécrire
    /// retirerait le format sous les doigts de l'auteur.
    var moodGate: Bool {
        ComposerMoodGate.compositionQualifiesAsMood(
            text: documentText,
            hasMedia: !documentLocalMedia.isEmpty,
            hasScene: documentHasScene,
            moodEmoji: moodEmoji
        )
    }

    var profile: ComposerProfile {
        ComposerProfile.profile(
            for: intent.origin,
            compositionQualifiesAsReel: reelGate,
            compositionQualifiesAsMood: moodGate
        )
    }


    // MARK: - Le format qui gouverne, et la surface qu'il monte
    /// Le format qui GOUVERNE — surface montée et type publié.
    ///
    /// Il n'est pas `currentFormat` : l'offre respire (le réel n'est offert que
    /// tant que la composition qualifie), et retirer une image sous une
    /// sélection `.reel` laisserait le meuble sur un format que la porte
    /// n'offre plus. `resolvedSelection` le ramène au premier format offert,
    /// qui est toujours celui de la porte (invariant de C1). C'est la règle
    /// écrite avec l'éventail, et jusqu'ici jamais exercée hors de son test.
    var selectedFormat: ComposerFormat {
        ComposerFormatFanPolicy.resolvedSelection(
            current: currentFormat,
            offeredFormats: profile.offeredFormats
        )
    }

    /// Ce que l'éventail écrit. La LECTURE passe par la règle de repli, sinon
    /// un éventail dont l'offre vient de se refermer ne marquerait plus aucun
    /// chip ; l'ÉCRITURE va droit au champ, parce qu'un tap ne vise jamais
    /// qu'un format offert.
    var formatSelection: Binding<ComposerFormat> {
        Binding(get: { self.selectedFormat }, set: { self.currentFormat = $0 })
    }

    /// La surface MONTÉE — l'unique lecture de la règle de routage dans ce
    /// fichier. Le corps la consomme pour choisir sa vue, le chrome pour savoir
    /// qui peint la publication, le gate pour savoir ce qui fait matière. Trois
    /// lectures de la même expression auraient été trois occasions de diverger.
    var mountedSurface: ComposerSurfaceKind {
        // B3 (#3926) — STORY et RÉEL montent la scène par le ROUTAGE
        // (`ComposerSurfaceRouting` envoie `.story`/`.reel` sur `.scene`), une
        // destination du socle que l'éventail écrit (`selectedFormat`) — c'est
        // ce qui fait de l'éventail le seul sélecteur.
        //
        // **Choisir une couleur de fond ne bascule PLUS ici (#3939, retour
        // porteur 2026-08-27).** L'ancienne règle F2 (`ComposerSceneActivation`,
        // supprimée) faisait naître la scène 9:16 PLEIN ÉCRAN dès qu'un fond
        // était choisi — remplacement de route surprenant, pas demandé :
        // l'auteur reste sur l'écran document qu'il a ouvert. `documentBackground`
        // continue d'être posé (utile à l'atelier une fois qu'il s'incrustera),
        // mais ne route plus vers `.scene` seul. Voir #3939 pour l'incrustation
        // du canvas DANS l'écran document, restant à livrer.
        return ComposerSurfaceRouting.surface(opening: profile.opensWith, format: selectedFormat)
    }


    // MARK: - Qui peint le chrome, où se peint l'éventail, ce qui est offert
    /// QUI peint la publication — audience, aperçu, flèche. UNE source, lue deux
    /// fois : passée à l'atelier pour qu'il assemble ou non sa rangée haute, et
    /// lue ici pour que le socle peigne ou non les mêmes zones.
    ///
    /// **Ce fut une CONSTANTE `.atelier`, et le lot 4 l'a rendue calculée** —
    /// pas par confort : les deux blocages qui l'imposaient sont des blocages de
    /// la SCÈNE, et une constante qui les faisait valoir pour les trois surfaces
    /// était une constante mal placée.
    ///
    /// (1) **L'audience de l'atelier n'est pas atteignable d'ici.**
    /// `StoryComposerView.visibility` est un `@State` PRIVÉ, semé à la
    /// construction par `initialVisibility`, dont `visibilityMenu` est l'unique
    /// écrivain. Le socle a beau savoir choisir une audience depuis le lot 4.9,
    /// il écrit `composerVisibility`, que l'atelier ne lit jamais : céder le
    /// chrome sous la scène retirerait `visibilityMenu` et laisserait l'auteur
    /// devant un sélecteur qui ne gouverne rien. **Condition de levée, côté
    /// SDK** : que l'atelier accepte une audience en `@Binding` plutôt qu'en
    /// graine.
    ///
    /// (2) **L'aperçu de l'atelier porte des médias que le meuble ne voit pas.**
    /// `preloadedImages/VideoURLs/AudioURLs` sont `internal` à `MeeshyUI` ; un
    /// œil peint ici rendrait une scène amputée des médias LOCAUX, ce
    /// qu'interdit la loi 6. Le socle n'en peint plus aucun depuis le lot 4.9 —
    /// pour une raison voisine mais DISTINCTE, qu'il ne faut pas confondre :
    /// sous ses deux surfaces il n'y a pas de canvas du tout, pas même amputé.
    ///
    /// Sous le document et sous le mood, **il n'y a pas d'atelier** : aucune de
    /// ces deux raisons n'a d'objet. La règle qui tranche est
    /// `ComposerChromeOwnership`, éprouvable sans monter une vue ; ce qui suit
    /// n'en est que la lecture.
    ///
    /// **Ce que la bascule NE lève PAS, et qu'il ne faut pas lire comme acquis** :
    /// la scène reste sur `.atelier`, et ses deux conditions de levée sont
    /// intactes — une audience de l'atelier PILOTABLE depuis le meuble, et un
    /// aperçu qui porte les médias préchargés. Elles se remplissent côté SDK,
    /// jamais depuis ce fichier.
    var chromeOwner: ComposerChromeOwner {
        ComposerChromeOwnership.owner(for: mountedSurface)
    }

    /// Les zones que le socle peint sous la surface montée. Une RÈGLE, jamais un
    /// `if` écrit dans le corps : une condition posée dans un `body` est
    /// invisible aux tests, et c'est ainsi qu'une règle produit se met à exister
    /// en deux exemplaires.
    var paintedSocleZones: [ComposerTopBarControl] {
        ComposerChromeOwnership.socleZones(
            for: mountedSurface,
            // L'œil n'a d'objet que s'il y a une scène à montrer — c'est la
            // condition que le doc-comment de `socleZones` avait écrite en
            // 2026-08-24 comme prix de son retour, et elle se vérifie ICI,
            // jamais dans le corps du socle.
            documentHasScene: documentHasScene,
            // Sous la SCÈNE, l'œil n'existe que si l'atelier l'a armé (#4135).
            atelierOffersPreview: publishTrigger.offersPreview
        )
    }

    /// **OÙ le plateau — donc l'éventail — a le droit de se peindre.**
    ///
    /// Une RÈGLE nommée, jamais une expression écrite dans le `body` : une
    /// condition posée là est invisible aux tests, et c'est ainsi qu'une règle
    /// produit se met à exister en deux exemplaires.
    ///
    /// **La loi 5 impose de surcroît que rien dans le `body` ne conditionne
    /// l'affichage sur la PORTE, et il faut lire ce que cela interdit
    /// exactement.** Ce n'est pas « ne rien lire qui vienne de la porte » : le
    /// PROFIL vient d'elle, et `mountedSurface` comme `offeredAudiences` le
    /// remontent aussi. Ce qui est interdit est de tester son IDENTITÉ — un
    /// `if profile` / `if origin` écrit ici, ce que
    /// `test_theSocleYieldsToTheAtelier_andNeverToTheDoor` refuse en toutes
    /// lettres. Cette propriété ne lit que des CAPACITÉS — la surface montée,
    /// l'ouverture, l'offre —, si bien que deux portes aux mêmes capacités y
    /// obtiennent la même réponse. C'est cela, la loi 5.
    ///
    /// Jusqu'au lot 4.7, le plateau était monté par `composerSurface` : la SCÈNE
    /// seule le portait, et le chip « Post » d'une republication de mood
    /// n'existait sur aucun écran. Le descendre en bloc aurait livré le défaut
    /// symétrique sous `.feedComposer`. `ComposerFormatFanPlacement` est ce qui
    /// sépare les deux cas — et c'est une règle, non un accident de montage.
    ///
    /// **Elle lit les DEUX règles de l'éventail, et leur CONJONCTION n'est pas
    /// écrite ici.** Le plateau ne porte plus qu'une chose ; sans le test de
    /// VISIBILITÉ, une création de mood (`.moodChip`, qui n'offre qu'un format)
    /// monterait une rangée VIDE — un `HStack` réduit à ses 16 points de
    /// remplissage vertical, en haut d'un écran livré. Loi 4 : ce qui n'a rien à
    /// montrer est absent, pas transparent. La scène, elle, n'en change pas :
    /// sa seule porte de production (`.storyTray`) offre toujours au moins deux
    /// formats.
    ///
    /// Le `&&` a d'abord été écrit ICI, et c'était la même faute d'un cran plus
    /// haut : la composition EST la règle, et posée dans une propriété privée
    /// elle n'était exercée par aucune assertion. Mutation mesurée — remplacer
    /// ce `&&` par un `||` laissait passer les quatre gardes de source qui
    /// l'entouraient. `ComposerFormatFanPlacement.mounts` la porte désormais, et
    /// cette propriété n'est plus que sa LECTURE.
    var mountsFormatFan: Bool {
        ComposerFormatFanPlacement.mounts(
            surface: mountedSurface,
            opening: profile.opensWith,
            offeredFormats: profile.offeredFormats
        )
    }

    /// **La RANGÉE du plateau le peint-elle ?** — `mountsFormatFan` dit QUE
    /// l'éventail est servi, `place` dit OÙ, et cette propriété joint les deux.
    ///
    /// La jonction est ici, dans une propriété NOMMÉE, jamais dans le `body` :
    /// une condition écrite dans un `body` est invisible aux tests, et c'est
    /// exactement la faute que la note ci-dessus raconte avoir déjà commise un
    /// cran plus haut. Sa jumelle vit au site d'appel de la surface document
    /// (`place == .documentHeader`), et l'exhaustivité du `switch` de `place`
    /// interdit qu'elles soient vraies ensemble.
    var paintsFormatFan: Bool {
        mountsFormatFan
            && ComposerFormatFanPlacement.place(for: mountedSurface) == .plateauRow
    }

    /// **Les audiences que le meuble a le droit de proposer**, lues UNE fois et
    /// remises telles quelles à ses deux formes de sélecteur — le menu du socle
    /// et le ruban du mood.
    ///
    /// Les deux formes existent à dessein (une rangée n'accueille pas six chips)
    /// et ne sont jamais peintes ensemble. Mais deux OFFRES pour un même réglage
    /// seraient un plafond posé d'un côté seulement, et c'est très exactement le
    /// défaut que ce lot referme : le raisonnement sur le plafond d'une
    /// republication était écrit dans `ComposerIntent` pendant que le ruban
    /// déjà peint, sur le seul chemin vivant en production, offrait les six.
    ///
    /// C'est la PORTE qui répond, jamais la surface : elle seule sait si l'on
    /// republie (`ComposerOrigin.repostedPostId`).
    var offeredAudiences: [PostVisibility] {
        ComposerAudienceOffer.offered(for: intent.origin)
    }
}
