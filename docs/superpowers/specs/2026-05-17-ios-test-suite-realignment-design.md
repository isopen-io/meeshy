# Réalignement des suites de tests iOS — Design

**Date** : 2026-05-17
**Statut** : approuvé
**Branche cible** : `main` (commits directs)

## Contexte

Un audit réel des suites de tests iOS (exécution + lecture) a établi :

- **App `MeeshyTests`** : 1220 tests, 19 échecs (après suppression de 7 fichiers
  « théâtre de mocks » — commit `2cec0f68`).
- **SDK `MeeshySDK-Package`** : 2421 passés / 31 échoués sur la portion exécutée
  (`MeeshySDKTests` complet, `MeeshyUITests` partiel — le run complet gèle sur un
  test réseau-dépendant).

Les échecs sont des **dérives test/implémentation préexistantes**, pas des
régressions de ce lot. Ce design couvre leur remédiation et l'ajout d'une
couverture manquante, en garantissant que l'app et les tests décrivent la
**même** logique fonctionnelle.

## Principe directeur

Pour chaque échec, **investiguer puis décider** la source de vérité :

- App correcte + test obsolète → mettre le **test** à jour sur le contrat réel.
- App régressée → corriger l'**app**, le test exprime le comportement attendu.

La décision est justifiée dans le message de commit du point concerné.

## Méthode par point

Boucle uniforme : **investiguer → décider → corriger → vérifier → committer**.
Vérification avant de passer au point suivant.

**Granularité de commit** : un commit par point sur `main`, **sauf P2** qui peut
se scinder en plusieurs commits (un par cluster) si les décisions d'alignement
divergent — p. ex. trois clusters = MAJ test, un cluster = fix app → commits
séparés. Total : **au moins 6 commits**.

**Ordre d'exécution** : P1 → P2 → P6 (phase A), puis P4 → P3 → P5 (phase B).
La numérotation P1-P6 reflète le périmètre validé, pas l'ordre — les phases le
réordonnent pour grouper app puis SDK.

## Les 6 points

### Phase A — cible app (vérif : `./apps/ios/meeshy.sh test`)

**P1 — `GlobalSearchViewModelTests.test_tabCounts_reflectResultArraySizes` non hermétique**
`makeSUT()` isole le `MessageSearchService` (pool GRDB neuf) et les mocks, mais
pas l'état process-wide lu par `performSearch` (cache partagé). Un test exécuté
avant pollue le compteur. Correctif : isoler cet état dans `setUp` (invalidation
ciblée), à l'image de `PostDetailViewModelTests`. Résultat attendu : app à 17
échecs nets.

**P2 — 17 échecs app, 4 clusters**
- `ConversationViewModelTests` : `test_loadMessages_callsMarkRead`,
  `test_markAsRead_callsConversationServiceMarkRead` — `markAsRead` n'appelle
  plus le `conversationService` injecté.
- `PostDetailViewModelTests` : `test_likePost_*`, `test_sendComment_*` —
  like/commentaire ne passent plus par le service injecté.
- `StoryRepostFlowTests` : `test_flux3_kebabEditerEtRepublier...` — callback de
  publication non déclenché.
- `WebRTCServiceTests` : `test_connectionStateChange_updatesConnectionState` —
  état `new` au lieu de `connected`.
Hypothèse dominante : dérive Local-First (envoi/statuts routés via outbox/queue).
Investigation par cluster ; MAJ des tests sur le contrat réel, **sauf** vraie
régression détectée (→ fix app).

**P6 — `StoryPublishService` non couvert**
Écrire la couverture du comportement réel existant (la zone
`TimelineOnlinePublishing` est partiellement stubbée — tester le comportement
réel, pas le stub). Si un protocole `StoryPublishServiceProviding` est requis
pour l'injectabilité et absent, l'introduire d'abord (règle TDD iOS).

### Phase B — SDK (vérif : `xcodebuild test -only-testing:` par classe, avec `-clonedSourcePackagesDirPath` vers les packages résolus de l'app)

**P4 — bugs d'infrastructure SDK**
- `ReactionServiceTests` ×4 : `MockAPIClient` ne retrouve pas un stub pourtant
  enregistré (« no stub for '/reactions' — Available stubs: ['/reactions'] ») —
  échec du lookup typé (`APIResponse<DiscardedReactionResponse>`).
- `AttachmentServiceTests.test_attachmentStatusUser_decodesGatewayPayload` :
  `DecodingError` — date non ISO8601 dans la fixture ou décodeur trop strict.

**P3 — `StoryOfflineQueueTests` ×5**
La file rend de mauvais items (`media-1` répété au lieu d'ids de slides
distincts), le handler de flush n'est pas appelé, persistance dans le mauvais
dossier. Suspicion de **vraie régression applicative** → investigation
prioritaire du code de prod (`StoryOfflineQueue`).

**P5 — baselines snapshot**
`AudioClipBarSnapshotTests` fait de **vraies captures** (`assertSnapshot`) mais
échoue (« does not match reference ») : la baseline committée manque ou est
périmée. Décision par fichier : régénérer la baseline (record mode) sur le
simulateur de référence si le test apporte une vraie valeur de régression
visuelle ; sinon le retirer (cf. R3). Vérifier au passage les autres
`*SnapshotTests` : certains ne font plus de capture réelle malgré leur nom.

## Vérification

- App : `rm -rf apps/ios/test-results && ./apps/ios/meeshy.sh test`.
- SDK : runs ciblés par classe via `xcodebuild test -scheme MeeshySDK-Package
  -only-testing:MeeshySDKTests/<Classe> -clonedSourcePackagesDirPath
  "$HOME/Library/Developer/Xcode/DerivedData/Meeshy-*/SourcePackages"` — évite le
  gel réseau du run complet.

## Risques

- **R1** : un cluster app s'avère une vraie régression (pas une dérive de test) →
  le correctif touche le code de prod, périmètre plus large que prévu. Mitigation :
  décision documentée, signaler avant d'élargir.
- **R2** : `StoryOfflineQueue` (P3) est probablement une vraie régression — le fix
  peut nécessiter de comprendre la sérialisation de la file.
- **R3** : les baselines snapshot (P5) régénérées sur ce simulateur peuvent ne pas
  correspondre à un autre environnement — préférer retirer si le fichier
  n'apporte pas de vraie valeur de régression visuelle.

## Hors périmètre

- Le run SDK complet (`MeeshyUITests`) reste non exécutable ici (gel réseau).
- Aucune refonte applicative au-delà du strict alignement test↔app.
