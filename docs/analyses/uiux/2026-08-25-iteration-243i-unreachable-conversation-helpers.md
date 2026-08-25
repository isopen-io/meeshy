# Iteration-243i — cinq fonctions que personne n'appelle, trois traductions que personne ne lit

**Date** : 2026-08-25 · **Piste** : iOS (suffixe `i`)
**Surface** : la surface CONVERSATION (`ConversationView*.swift`) + `ConversationViewModel`
**Base** : `main` HEAD `e91b3d19` · **Branche** : `claude/intelligent-noether-oulsyj`

## Pourquoi cette surface

Report **(d)** de 242i : `conversation.view.reply.count.{one,many}` — « messagerie,
deux branches en Swift, l'arabe y est lésé : six formes CLDR pour deux branches ».
La ligne voyage **de report en report depuis 240i**, recopiée mot pour mot par
241i, 242i puis 243i. Quatre itérations.

Le correctif attendu était évident : une entrée `variations.plural`, sept locales,
six formes arabes — exactement ce que 240i a fait pour le fil et 226i pour les
liens de partage.

## Ce que la mesure a rendu

**La ligne n'a jamais rendu un pixel.**

`replyCountPill(count:isMe:parentMessageId:)`, seul site à lire ces deux clés,
n'est appelée par **aucun commit de l'histoire du dépôt** :

```
$ for c in $(git log --all --format=%H -S"replyCountPill" -- apps/ios); do
    git grep -h "replyCountPill(" $c -- apps/ios | grep -v "func replyCountPill"
  done
(vide)
```

Et `conversation.view.reply.count.many` **n'est dans aucun des quatre catalogues**.
La branche `count >= 2` retombait donc sur son `defaultValue` — `"\(count) reponses"`,
du français **non accentué**, en dur — pour les sept locales à la fois. Le défaut
réel n'était pas « l'arabe est lésé » : c'était « personne n'aurait rien reçu »,
le jour où quelqu'un aurait monté la pastille.

> **Un report propage la DESCRIPTION d'un défaut, jamais sa vérification.**
> La phrase de 240i était exacte sur le code qu'elle décrivait. Ce qu'aucune des
> trois reprises n'a demandé, c'est **qui affiche ça**.

## Le balayage qui a suivi

La question posée à la fonction — « qui l'appelle ? » — a été posée à toutes les
fonctions de la surface conversation. **Cinq n'ont aucun site d'appel :**

| fonction | fichier | ce qui vit à sa place |
|---|---|---|
| `replyCountPill(count:isMe:parentMessageId:)` | `+MessageRow` | appui long → `MessageMoreSheet` → `onThread` → `ThreadView` |
| `replyCountFor(messageId:)` | `+MessageRow` | (n'alimentait que la pastille) |
| `scrollToAndHighlight(_:proxy:)` | `+MessageRow` | `MessageListViewController.scrollToMessage(localId:)` + `flashCell(at:)` |
| `formatRecordingTime(_:)` | `+AttachmentHandlers` | `UniversalComposerBar+Recording` / `ComposerModels` |
| `addCurrentLocation()` | `+AttachmentHandlers` | `onLocationRequest` (`+Composer:143`) pose le même drapeau |

Chacune est le **prédécesseur** d'un mécanisme vivant, laissé en place à la
migration qui l'a remplacée. `scrollToAndHighlight` est la plus parlante : elle
pilote un `ScrollViewProxy`, du temps où le fil était une `ScrollView` SwiftUI ;
la liste est passée à `MessageListViewController` et le saut vivant y est un
`scrollToItem` UIKit.

### Ce qu'elles emportaient

- **Trois clés de catalogue traduites en sept locales** —
  `conversation.view.reply.count.one`, `conversation.view.go_to_first_reply`,
  `conversation.message.unavailable` — soit **141 lignes** de traduction pour des
  pixels qui n'ont jamais existé. Elles passaient les DEUX gardes i18n : citées en
  code (`LocalizationConsistencyTests` direction 2 ✓) et présentes au catalogue
  (direction 1 ✓).
- **`ConversationViewModel.replyCountMap`** — une carte parent → nombre de
  réponses, invalidée à chaque changement de structure, dont le seul lecteur était
  `replyCountFor`. (Elle est paresseuse : le coût réel était la dette, pas le CPU.
  Le dire autrement serait exagérer.)
- **`scrollState.highlightedMessageId`** — dont `scrollToAndHighlight` était le
  seul écrivain non nul, et que **rien ne lisait**. Il ne restait qu'un
  `= nil` dans `dismissSearch`.

## Le correctif

**Retrait**, pas traduction. Une pastille jamais montée ne se localise pas : on la
retire, et le mécanisme vivant qu'elle doublait reste seul.

Les épitaphes suivent le style du dépôt (précédent `focalOverlayPreview`,
`MessageListViewController:2385`) : elles nomment ce qui a vécu là **et où vit son
remplaçant**, pour que la prochaine lecture ne réécrive pas la même fonction.

### Ce qui n'est PAS fait, et pourquoi

**La DÉCOUVRABILITÉ du fil de réponses.** Aujourd'hui, savoir qu'un message a des
réponses demande trois gestes (appui long → « Plus… » → « Fil »). Une pastille sous
la bulle est une réponse légitime à ce problème — c'est probablement l'intention
d'origine de `replyCountPill`.

Mais c'est une **question produit**, pas une dette de traduction, et c'est
exactement l'erreur de classement qui l'a laissée dormir quatre itérations sous
une étiquette i18n. Elle se trancherait au simulateur, sous une bulle dont les
stickers de réaction débordent déjà de quelques points
(`QuickReactionBarPlacement.bubbleGap`) — et il n'y a pas de simulateur ici
(leçon 238i : **découper par NIVEAU DE DOUTE**). Reclassée, nommée, transmise.

**`buildNativeMessageMenu(for:)`** (`ConversationView.swift`) est la sixième
fonction sans site d'appel — et elle est tenue VERTE par
`ConversationMenuSystemDesignGuardTests`, qui l'inspecte à la source : le motif
« code mort testé vert » que ce dépôt connaît. Son doc-comment dit « le menu natif
n'existe que sur iOS 26 » : ce peut être un chemin monté plus tard, pas un vestige.
Trancher demande l'arbitrage produit du menu contextuel natif. **Inscrite
nommément dans l'allowlist de la garde neuve**, pour rester une dette VUE.

**Les sept `String(format: "%d:%02d", …)` du dépôt** (durée d'appel, compte à
rebours de lien magique, durée de média…) sont une famille de consolidation
plausible, mais leurs contextes diffèrent. Hors périmètre — signalée en suite.

## La garde neuve

`ConversationSurfaceReachabilityGuardTests` : dans la surface conversation, une
fonction déclarée doit être **référencée ailleurs qu'à sa propre déclaration**.

Elle occupe un trou entre deux gardes existantes :

| garde | question posée |
|---|---|
| `LocalizationConsistencyTests` direction 1 | cette clé citée en code existe-t-elle au catalogue ? |
| `LocalizationConsistencyTests` direction 2 | cette clé du catalogue est-elle citée en code ? |
| **243i** | **le code qui la cite s'exécute-t-il ?** |

Trois choix de forme, chacun payé par une mesure :

1. **Le préfixe est le critère** (`ConversationView*`), pas une liste de fichiers :
   une septième extension naît couverte.
2. **Les conformances de protocole sortent par un ensemble de NOMS DE CONTRAT**
   (`frameworkInvoked`), pas par la liste des exceptions. La première mesure les
   signalait à tort — `makeUIViewController` / `updateUIViewController` sont
   appelées par le framework et par rien d'autre. Un ensemble de contrats couvre
   d'avance toute conformance future ; une liste d'exceptions attendrait qu'on y
   pense.
3. **Les commentaires sont dépouillés** (`AppSourceGuard.stripComments`) : sans
   cela, mes propres épitaphes — qui NOMMENT les fonctions retirées — les
   compteraient comme des références et rendraient la garde aveugle à son
   propre défaut. Un test dédié le vérifie.

**Ce qu'elle n'attrape pas, dit dans son doc-comment** : une fonction citée
uniquement par une autre fonction elle-même morte reste verte. La garde attrape la
FEUILLE de l'arbre mort, pas l'arbre. C'est déjà ce qui manquait, et c'est
décidable sans compilateur — il n'existe aucune toolchain Swift sous Linux.

## Vérification

Aucune toolchain Swift ici — **gate réel = CI `iOS Tests`**, suite complète via
l'opt-in ` — run test` (leçons 238i / 268 : relire le NOM du check).

> **Et je l'ai cité puis oublié.** Le premier push portait le sujet sans son
> suffixe : `Portée du run` a résolu `run_tests=false` et le check s'est nommé
> **« Build app (app + cibles de test) »** — compilation seule. La suite neuve
> aurait COMPILÉ sans jamais s'exécuter, sur une itération dont toute la valeur
> est une garde. Corrigé par amend du SUJET (le workflow lit `git log -1
> --pretty=%s` de la tête de branche ; **un mot-clé dans le CORPS ne compte
> pas**), force-with-lease sur une branche sans relecture.
>
> C'est la forme de la leçon 242i — *connaître un piège ne protège pas d'y
> tomber* — d'un cran plus haut : là je citais la doctrine dans le code testé en
> l'oubliant au banc d'essai ; ici je l'ai écrite dans ce tableau même, à la
> ligne qui précède, en l'oubliant sur le commit. **Le NOM du check est ce qui
> distingue un vert qui a bâti d'un vert qui a exécuté** — le lire fait partie
> du gate, pas de l'après-coup.

| Contrôle déterministe rejoué hors Swift | Résultat |
|---|---|
| **RED** — la garde neuve rejouée sur `origin/main` | **5 fonctions signalées** : `replyCountFor`, `replyCountPill`, `scrollToAndHighlight`, `formatRecordingTime`, `addCurrentLocation` |
| **GREEN** — la même rejouée sur la branche | **0** |
| Ses trois versants d'auto-garde (6 fichiers, 89 déclarations, `triggerReply` vu) | conformes aux seuils assertés |
| `apps/ios/scripts/check_localization.py` (miroir du cliquet) | **✓ directions 1 et 2** |
| Clés orphelines au catalogue app | **0** sur 3369 |
| Les 4 clés retirées, encore citées en code ? au catalogue ? | **aucune / aucune** |
| Diff du catalogue | **0 insertion / 141 suppressions** — excision textuelle, **aucun reformat** (leçon 242i) |
| Catalogue JSON valide · entrées | oui · 3372 → **3369** ; **0 autre entrée modifiée** (prouvé par parse) |
| Équilibre `()`/`{}`/`[]` des 6 fichiers Swift | **identique à `main`** |
| SDK (`packages/MeeshySDK`) | **non touché** |
| `project.pbxproj` | **non touché** — XcodeGen globe `Meeshy/` et `MeeshyTests/` |

## Bilan

**5 fichiers prod** · **5 fonctions retirées** · **1 propriété de ViewModel** ·
**1 état de vue sans lecteur** · **3 clés × 7 locales retirées** (−141 lignes de
catalogue) · **1 suite neuve** (5 tests) · **1 report soldé par retrait** ·
**0 changement visuel** · **0 logique métier**.

Bilan net : **−231 / +60**.

## Suites (244i+)

1. **Découvrabilité du fil de réponses** — reclassée ci-dessus depuis « dette
   i18n » vers « question produit ». Simulateur + arbitrage.
2. **`buildNativeMessageMenu`** — code mort tenu vert par une garde de source.
   Décider si le menu natif iOS 26 se monte ou se retire ; l'allowlist de la
   garde neuve la nomme jusque-là.
3. **Étendre la garde d'atteignabilité hors de la surface conversation** — le
   même balayage sur `FeedView*`, `StoryViewer*`, `Settings*`. Chaque extension
   doit MESURER ses faux positifs avant d'asserter (c'est ce qui a fait apparaître
   `frameworkInvoked` ici).
4. **Les sept `String(format: "%d:%02d", …)`** — consolidation plausible,
   contextes à départager.
5. **Cibles tactiles 44 pt d'`InteractiveProgressBar`** — moitié restante de 233i,
   arithmétique dans l'analyse 242i.
6. Carry-over inchangés : `MeeshyAppIntents:272` (macOS), forme `one`
   d'`accessibility.unread_count`, effectif « 199+ », les 2 fenêtres
   `prefix(1400)`, phrasé « Image 3 sur 10 », les 3 sites SDK de 241i (hors
   périmètre par règle).

**Et une consigne de méthode pour la reprise de cette liste** : avant de corriger
une ligne héritée d'un report, poser la question que le report ne pose pas —
**qui affiche ça ?** Elle a coûté une mesure ici et rendu cinq fonctions.

---

## Ce que la CI a rendu — 8223/8229, et un rouge qui n'est pas le nôtre

Tête `5df76b2e`, check **« Build app + tests unitaires »** (le nom atteste que
la suite a bien TOURNÉ) : **8223 passés · 1 échoué · 5 ignorés**.

**Les cinq tests de la garde neuve passent**, ainsi que
`EngagementCountConsolidationGuardTests` étendue. L'unique échec :

```
FeedViewModelTests/test_loadMoreIfNeeded_afterFreshCacheOnlySession_stillFetchesDespiteNilCursor()
XCTAssertEqual failed: ("0") is not equal to ("10")
```

### Ce n'est pas un « flake », c'est une COURSE — et on peut la nommer

L'assertion qui tombe est la ligne 339 : le test vide le cache partagé, y sème
10 posts, appelle `loadFeed()` et attend un succès de cache `.fresh`. Il obtient
**0**.

`CacheCoordinator.shared.feed` est un `GRDBCacheStore` **de processus**, et la
clé `"main-feed"` est une constante partagée par `FeedViewModel`,
`ReelsViewModel` et **sept fichiers de tests**. Le mécanisme exact vit dans
`FeedViewModel.debouncedCacheSave()` (`FeedViewModel.swift:1508`) :

```swift
cacheSaveTask = Task {
    try? await Task.sleep(for: .seconds(2))
    guard !Task.isCancelled else { return }
    try? await CacheCoordinator.shared.feed.savePreservingFreshness(…, for: "main-feed")
}
```

Un `Task` se retient lui-même tant qu'il tourne. La seule annulation est
`cacheSaveTask?.cancel()` au PROCHAIN appel sur la MÊME instance — or chaque
test fabrique son propre `FeedViewModel` et le laisse mourir. **Le sommeil de
2 s d'un ViewModel d'un test PRÉCÉDENT survit à sa désallocation**, puis écrit
son propre instantané (souvent vide) dans `"main-feed"` pendant qu'un autre test
tourne. S'il atterrit entre le semis et la lecture, `posts.count == 0`.

C'est exactement le texte de l'échec.

### Pourquoi ce n'est pas ce lot — et pourquoi je ne le corrige pas ici

| question | réponse |
|---|---|
| Le diff touche-t-il le fil, `FeedViewModel`, `CacheCoordinator` ? | **non** — 0 fichier feed/cache (`git diff --name-only`) |
| Une clé retirée manque-t-elle à du code vivant ? | **non** — `check_localization.py` vert dans les deux directions |
| La base `e91b3d19` était-elle verte ? | **oui** (run #440) |

Le lot ne CAUSE pas la course ; il en déplace le minutage. La suite neuve lisait
l'arbre source **cinq fois** (une par test, ~1250 fichiers), ce qui ajoute des
dizaines de secondes de MainActor à un processus où un écrivain orphelin de 2 s
attend son heure.

**Corrigé dans le périmètre du lot** : le corpus est désormais lu **une seule
fois** (`static let sourceCorpus` / `surfaceSources`). C'est justifié pour
soi — cinq balayages complets pour un résultat identique, sur une suite dont le
rapport CI signale déjà les « longest test runs » à 43 % de la durée — et cela
réduit la perturbation que nous avions introduite.

**NON corrigé, et signalé plutôt que deviné** : la course elle-même. La réparer
demande de toucher `FeedViewModel` — un autre sous-système, sur une itération
UI/UX de la surface conversation. Élargir cette PR jusque-là, c'est précisément
ce que le dépôt interdit.

> **Correctif proposé, à porter par la piste feed** : annuler `cacheSaveTask`
> quand le ViewModel s'en va (`deinit`, ou une méthode de fin de vie explicite —
> un `deinit` d'un type `@MainActor` ne peut pas toucher d'état isolé). À
> défaut, faire porter au `Task` un jeton de génération et vérifier, APRÈS le
> sommeil, qu'il est toujours le courant. Le second est plus sûr : il survit à
> l'oubli d'un appel de fin de vie.
>
> Portée réelle en production : un `FeedViewModel` y est long ; l'orphelin
> n'existe que si l'utilisateur quitte le fil dans les 2 s d'un like, et
> `savePreservingFreshness` préserve le marqueur d'âge. **La morsure est donc
> surtout au banc d'essai** — mais c'est là qu'elle rend rouge, par ordre
> d'exécution, n'importe quelle PR qui déplace le minutage.

### Ce que je n'ai PAS pu faire

Relancer le job pour vérifier la reproduction : `rerun-failed-jobs` rend
**403 — Resource not accessible by integration**. La règle du dépôt prévoit ce
cas : à défaut de relance, rendre le test robuste s'il est dans le périmètre,
sinon le dire UNE fois et garder la PR surveillée. Le périmètre couvrait la
lecture répétée du corpus, pas la course du fil — les deux sont traités
ci-dessus selon ce partage.
