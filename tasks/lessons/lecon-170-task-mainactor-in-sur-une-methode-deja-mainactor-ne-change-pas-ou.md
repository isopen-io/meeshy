## Leçon 170 — `Task { @MainActor in }` sur une méthode déjà @MainActor ne change pas OÙ elle tourne, seulement QUAND (2026-08-14, routine appels audio/vidéo)

Audit du calling stack, volet PushKit : `AppDelegate.application(_:didFinishLaunchingWithOptions:)`
appelait `VoIPPushManager.shared.register()` via `Task { @MainActor in VoIPPushManager.shared.register() }`.
Le commentaire juste au-dessus explique noir sur blanc pourquoi cet appel a été déplacé dans
`AppDelegate` : PushKit exige que `PKPushRegistry` existe, délégué câblé, AVANT qu'un push VoIP
puisse être livré — y compris au lancement déclenché par iOS lui-même pour livrer ce push. Le code
fermait la course une fois (sortir du SwiftUI `.task` gated sur l'auth), puis la rouvrait par le
mécanisme même censé la garder fermée : `Task { @MainActor in }` depuis un contexte DÉJÀ MainActor
(`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, prouvé par l'appel voisin
`BackgroundTaskManager.shared.registerTasks()` qui, lui, tourne en direct sans wrapper) ne fait
qu'enfiler `register()` sur l'executor pour le tour de run-loop suivant — il tournera bien sur
MainActor, mais pas avant que `didFinishLaunchingWithOptions` ait fini de s'exécuter et rendu la
main. Un push VoIP livré à l'instant du lancement peut donc encore arriver avant que le registre
existe : exactement le trou que le déplacement dans `AppDelegate` prétendait combler.

**Le signal de reconnaissance** : un commentaire qui justifie l'EMPLACEMENT d'un appel par une
contrainte de TIMING (« doit exister avant X »), suivi d'un wrapper `Task { @MainActor in }` autour
de cet appel — le wrapper est presque toujours un réflexe de prudence copié d'un site où l'isolation
n'était pas garantie, pas une nécessité du site courant. Avant d'employer une méthode @MainActor
sous `Task { @MainActor in }`, vérifier si le contexte appelant est DÉJÀ MainActor (build setting
`SWIFT_DEFAULT_ACTOR_ISOLATION`, ou un appel voisin non-wrappé qui le prouve empiriquement) — si
oui, le wrapper ne fait que différer l'exécution, jamais la sécuriser.

**La règle** : sur un chemin de lancement dont le contrat impose « doit tourner AVANT que l'OS ne
puisse livrer X », un appel synchrone @MainActor s'invoque en direct depuis un contexte déjà
MainActor — jamais via `Task { @MainActor in }`, qui réintroduit la fenêtre que le placement du
code visait justement à fermer. Le correctif est symétrique de la Leçon 165 (même passe d'audit) :
là, un flag `callUsesCallKit` oublié rouvrait une fenêtre de 2s d'audio mort au rejoin ; ici, un
wrapper `Task` de trop rouvre une fenêtre de course PushKit — dans les deux cas, le code AVAIT déjà
la bonne intention documentée en commentaire, et l'implémentation la contredisait silencieusement.
