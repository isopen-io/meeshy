## Leçon 286 — un report propage la DESCRIPTION d'un défaut, jamais sa vérification (2026-08-25, itération 243i)

Une ligne de la liste de suites de 240i, recopiée telle quelle par 241i, 242i
puis 243i :

> `conversation.view.reply.count.{one,many}` — messagerie, deux branches en
> Swift, l'arabe y est lésé (6 formes CLDR → 2 branches).

Chaque mot est vrai **du code décrit**. Le correctif attendu était évident et
deux fois précédenté dans le dépôt (226i, 240i) : une entrée `variations.plural`,
sept locales, six formes arabes.

Avant de l'écrire, une question que la liste ne pose pas : **qui affiche ça ?**

```
$ for c in $(git log --all --format=%H -S"replyCountPill" -- apps/ios); do
    git grep -h "replyCountPill(" $c -- apps/ios | grep -v "func replyCountPill"
  done
(vide)
```

`replyCountPill`, seul site à lire ces deux clés, n'est appelée par **aucun
commit de l'histoire du dépôt**. Et `conversation.view.reply.count.many` n'est
dans **aucun** des quatre catalogues : la branche `count ≥ 2` retombait sur son
`defaultValue`, `"\(count) reponses"` — du français non accentué, en dur, pour
les sept locales à la fois.

Le défaut réel n'était donc pas « l'arabe est lésé ». C'était « **personne
n'aurait rien reçu** », et il n'aurait mordu personne, faute de lecteur.

> **Une description se propage seule ; une vérification, non.** Une liste de
> suites transmet fidèlement ce qu'une itération a VU, et rien de ce qu'elle n'a
> pas MESURÉ. Trois reprises l'ont fait circuler sans jamais rouvrir le fichier.
> Avant de corriger une ligne héritée d'un report, poser la question que le
> report ne pose pas — ici « qui affiche ça ? ». Elle a coûté une mesure et rendu
> **cinq** fonctions sans site d'appel dans la même surface.

### Le corollaire d'outillage : deux gardes qui se croisent laissent un trou entre elles

Les trois clés retirées passaient les DEUX gardes i18n du dépôt :

| garde | question posée | verdict |
|---|---|---|
| `LocalizationConsistencyTests` dir. 1 | cette clé citée en code existe-t-elle au catalogue ? | ✓ |
| `LocalizationConsistencyTests` dir. 2 | cette clé du catalogue est-elle citée en code ? | ✓ |
| — | **le code qui la cite s'exécute-t-il ?** | *personne ne demandait* |

Une bidirectionnalité a l'air exhaustive : elle ferme le cycle
code ↔ catalogue. Elle ne dit rien de l'axe perpendiculaire — l'**atteignabilité**
du site qui cite. C'est le trou où trois traductions × sept locales ont vécu.

> **Deux gardes qui se répondent l'une l'autre décrivent un cycle, pas une
> couverture.** Demander ce qu'aucune des deux n'interroge, plutôt que de
> conclure de leur symétrie qu'il n'y a plus rien à voir.

### Et une garde d'atteignabilité MESURE ses faux positifs avant d'asserter

La première mesure signalait `makeUIViewController` / `updateUIViewController` :
des conformances `UIViewControllerRepresentable`, appelées par le FRAMEWORK et
par rien d'autre. Elles sortent par un ensemble de **noms de contrat**, jamais
par la liste des exceptions — un contrat couvre d'avance toute conformance
future, une liste d'exceptions attend qu'on y pense.

Second point load-bearing : le **dépouillement des commentaires**. Ce dépôt
retire son code mort en laissant une épitaphe qui le NOMME (précédent
`focalOverlayPreview`). Sans dépouillement, ces épitaphes compteraient comme des
références et rendraient la garde aveugle à exactement le défaut qu'elle vient
de figer.

### Corollaire d'exécution — un opt-in de CI se pose sur le SUJET du commit, et le NOM du check est ce qui l'atteste

Le premier push de 243i portait le sujet sans son suffixe ` — run test`.
`Portée du run` a résolu `run_tests=false`, et le check s'est nommé
**« Build app (app + cibles de test) »** au lieu de « Build app + tests
unitaires ». La suite neuve — **toute la valeur de l'itération** — aurait
compilé sans jamais s'exécuter.

Deux détails qui se paient :

- Le workflow lit `git log -1 --pretty=%s` de la **tête de branche**. Un mot-clé
  enfoui dans le CORPS du message ne compte pas (« le corps sert à expliquer, le
  sujet à décider », `.github/workflows/ios.yml`). Et jamais le commit de merge
  synthétique d'un event `pull_request`, dont le sujet est toujours « Merge … ».
- Le NOM du check est le SEUL signal, dans l'interface de la PR, qui distingue
  un vert qui a **bâti** d'un vert qui a **bâti ET exécuté**. Le workflow le dit
  dans son propre commentaire.

> **Lire le nom du check fait partie du gate, pas de l'après-coup.** Un « iOS
> Tests : vert » se lit comme « les tests passent » alors que la plupart des runs
> n'en exécutent aucun.

Et la forme du défaut mérite d'être nommée : la phrase « gate réel = CI iOS
Tests, suite complète via l'opt-in ` — run test` » était écrite **dans le tableau
de vérification de cette itération même**, une ligne au-dessus du premier
contrôle — et le commit est parti sans. C'est la leçon 242i (*connaître un piège
ne protège pas d'y tomber : il faut l'appliquer AU BANC D'ESSAI*) d'un cran plus
haut : citer une doctrine dans sa propre documentation ne l'applique pas
davantage que la citer dans un doc-comment.

### Corollaire de banc d'essai — un écrivain différé ORPHELIN transforme une clé de cache partagée en variable globale de test

L'unique rouge de la CI 243i (8223/8229) :

```
FeedViewModelTests/test_loadMoreIfNeeded_afterFreshCacheOnlySession_stillFetchesDespiteNilCursor
XCTAssertEqual failed: ("0") is not equal to ("10")
```

Le test vide `CacheCoordinator.shared.feed`, y sème 10 posts, lit — et trouve 0.

```swift
// FeedViewModel.swift:1508
cacheSaveTask = Task {
    try? await Task.sleep(for: .seconds(2))
    guard !Task.isCancelled else { return }
    try? await CacheCoordinator.shared.feed.savePreservingFreshness(…, for: "main-feed")
}
```

Un `Task` **se retient lui-même** tant qu'il tourne. La seule annulation est
`cacheSaveTask?.cancel()` au prochain appel sur la **même instance** — or chaque
test fabrique son `FeedViewModel` et le laisse mourir. Le sommeil de 2 s survit
donc à la désallocation, puis écrit son instantané (souvent vide) dans la clé de
PROCESSUS `"main-feed"`, pendant qu'un autre test tourne.

> **Un `Task` différé qu'aucune fin de vie n'annule ne meurt pas avec son
> propriétaire : il devient un écrivain anonyme sur l'état global.** Si sa cible
> est une clé partagée, toute suite qui la lit devient order-dependent — et
> rougit chez la PR suivante qui déplace le minutage, jamais chez celle qui a
> introduit la course.

Deux conséquences de méthode :

- **« Flake » n'est pas un diagnostic ; « course » l'est.** La différence tient
  à ce qu'on peut NOMMER : ici, l'écrivain (`debouncedCacheSave`), le délai
  (2 s), la clé (`"main-feed"`), et pourquoi l'annulation ne couvre pas le cas
  (par instance, pas par processus). Tant qu'on ne peut pas écrire cette phrase,
  on n'a pas fini de chercher.
- **Le partage se fait au PÉRIMÈTRE, pas au symptôme.** Ce qui était à nous —
  cinq balayages du corpus source là où un seul suffit — a été corrigé. La
  course, qui vit dans un autre sous-système, a été SIGNALÉE avec son correctif
  proposé plutôt que réparée en élargissant la PR. Rendre le test « robuste »
  côté test l'aurait masquée.
