## 2026-08-18 — Quatre corrections iOS (deep links, mentions, trail, appel)

**Le repli « rétro-compatible » qui casse le cas nominal.** `trackedDestination`
retombait sur `.joinLink(identifier: token)` « pour ne rien régresser ». Or le
token d'un `/l/` iOS est un `TrackingLink.token` de 6 caractères et cette voie
appelle `GET /anonymous/link/<token>` — 404 **par construction**. Le repli ne
protégeait rien : il transformait chaque cas non prévu en message d'erreur
mensonger. Quand un repli mène à un chemin qui ne peut structurellement pas
aboutir, ce n'est pas un repli, c'est une panne différée. Les tests l'avaient
même GRAVÉ (`test_expiredLink_fallsBackToJoinLink_withToken`) : un test peut
épingler un bug aussi bien qu'un comportement.

**Un clip rogne à la BOÎTE, pas au dessin.** `.clipShape` posé sur un conteneur
dont le cadre exclut la safe area haute coupe tout ce que les
`.ignoresSafeArea()` de ses enfants avaient étendu — et laisse voir le fond de
l'hôte. Chercher « quel fond manque » était la mauvaise question ; la bonne
était « qui coupe ».

**Vérifier qu'un flake est PRÉ-existant avant de l'imputer à son diff.**
`MentionComposerControllerTests` échouait 2 à 4 fois par exécution après ma
modification. Restaurer la version HEAD du seul fichier touché, rebuilder,
relancer 3 fois : mêmes échecs (4/2/2). Trente minutes qui auraient été perdues
à chercher une cause inexistante dans mon code.

**Un worktree partagé peut nettoyer votre DerivedData en plein run.** Une suite
de tests app entière est morte sur `disk I/O error` + `.resp` manquants :
`apps/ios/Build` était à 0 B et le disque avait regagné 36 Gi — une session
voisine avait lancé un `clean`. Pour un gate long dans un worktree partagé,
utiliser un `-derivedDataPath` privé.
