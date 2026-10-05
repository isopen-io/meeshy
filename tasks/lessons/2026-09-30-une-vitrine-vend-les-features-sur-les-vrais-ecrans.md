## Une vitrine vend les FEATURES, sur les VRAIS écrans — le contenu demandé n'en est qu'une couche (2026-09-30, #8825 → #8855)

La refonte #8825 a exécuté exactement la demande de contenu : des conversations
amoureuses, drôles et acharnées, de vraies photos, des vocaux traduits, les formats
par défaut d'App Store Connect. Le jeu était propre, testé, mis en ligne sur la
1.1.2. Le porteur l'a pourtant jugé à côté : « Tu ne vends pas toutes les features !
Et les views ne reproduisent pas tant la vue de Meeshy. On devrait commencer par :
quelles sont les features novatrices et/ou impactantes de Meeshy ? »

Deux angles morts, un par phrase :

1. **La demande décrivait un TON, pas un PÉRIMÈTRE.** « Surtout des conversations
   amoureuses » disait comment raconter, pas quoi vendre. Personne n'avait posé la
   question que toute vitrine doit trancher d'abord : quelles features distinguent
   l'app ? L'inventaire, fait après coup, en a trouvé dix — dont quatre absentes du
   jeu (aperçu de l'appelant, exports « Imagine », montages d'appel, composeur).
2. **Un écran recomposé date du jour où on l'a dessiné.** Le kit imitait l'interface
   du 24 septembre ; en six jours, l'app avait changé d'en-tête, de barre de saisie,
   de mode de lecture par défaut (Script, sans bulles) et de vue d'appel. Aucun
   témoin du kit ne pouvait le voir : ils mesurent le rendu HTML contre lui-même,
   jamais contre l'app.

> **Avant de refaire une vitrine, inventorier les features différenciantes avec leur
> preuve de livraison, faire valider l'ordre, puis attribuer UNE feature par capture.
> Et confronter chaque vue à l'écran réel — ou partir des vrais écrans.**

Le corollaire de méthode : une imitation n'a de témoin que contre l'original. D'où
l'approche retenue pour #8855, un mode vitrine réservé au DEBUG qui remplit les
vraies bases de l'app et capture les vrais écrans.
