# MeeshyComposer — reprise sur SESSION UNIQUE (2026-08-23)

> Directive porteur produit du 2026-08-23 : **regrouper le développement sur une
> seule session**, **iOS et Web ISO**, **Android suspendu**, **développement
> directement sur `main`**.

## 1. Les sessions qui portaient le chantier — toutes deux ÉTEINTES

Recherche faite dans les transcrits (`~/.claude/projects/-Users-smpceo-Documents-v2-meeshy/`)
et confrontée aux sockets vivantes (`/tmp/cc-socks/`).

| Session | Transcript | Rôle | État |
|---|---|---|---|
| **`v2-meeshy-29`** | `2836194c-82d0-40d5-90b6-1ff224848dce.jsonl` (111 Mo, ouverte le 08-21 14:31, dernière écriture 08-23 13:04) | **composer iOS** — C1, C2-C3, V0 bis moitié iOS | **morte** (socket 5326 absente) |
| **`v2-meeshy-c0`** | `13e55e4c-0cc1-440a-b95f-135618b80f51.jsonl` (11 Mo, dernière écriture 08-23 13:04) | **contrat partagé + web** — V0 (`composer-contract.ts`), V0 bis moitié **web** | **morte** (socket 72668 absente) |
| `v2-meeshy-3e` | — | Lentille (doublon), a fermé elle-même | morte |

Sessions VIVANTES au moment de la reprise, et ce qu'elles font — **aucune ne
développe le composer** :

- `v2-meeshy-cf` (pid 4655) — **intégration beta**, arbre principal
  `/Users/smpceo/Documents/v2_meeshy` sur `integration/beta-20260823`, **PR #3389**
  ouverte vers `main`. Sa branche EMBARQUE le merge de `feat/composer-lot-c23`.
- `v2-meeshy-73` (pid 5283) — liste de conversations, chantier CLOS, rien en cours.
- `v2-meeshy-ce` (pid 8327) — **cette session**, désormais seule propriétaire du chantier.

## 2. Le WIP orphelin récupéré

La session `c0` s'est éteinte en laissant **8 fichiers non committés** dans
l'arbre principal (V0 bis moitié web). `cf` a refusé de se les approprier, à
juste titre. Ils sont **récupérés dans ce worktree** (`git apply` propre sur
`main`, aucune modification de l'arbre principal) :

```
apps/web/services/posts.service.ts            RepostRequest.targetType
apps/web/components/v2/StoryViewer.tsx        onRepostAsPost + KeepOnFeedIcon
apps/web/app/story/[postId]/page.tsx          miroir STORY + ancrage POST
apps/web/app/reel/[postId]/page.tsx           miroir REEL (fin de rétrogradation)
apps/web/app/feeds/post/[postId]/page.tsx     miroir POST
apps/web/components/feed/PostsFeedScreen.tsx  miroir au fil
apps/web/__tests__/app/{reel,story}/postId-page.repost.test.tsx
```

Ce qui restait dans l'arbre principal et qui n'est PAS du composer (laissé
intact, appartient à d'autres sessions) : `project.pbxproj` + `project.yml`
(enregistrement `CommentDraftStoreTests` + build 1793), `MessageHandler.ts`.

## 3. L'espace de travail

`/Users/smpceo/Documents/v2_meeshy-composer` — **worktree sur `main`**
(l'arbre principal est occupé par `cf`). Le développement se commit sur `main`
et se pousse ; aucune branche feature, conformément à la directive.

## 4. Ce qui reste — 17 tâches sur 67 (P0 rév. 11 : 50/67)

### Phase W — web, sans collision avec la PR #3389 *(démarre en premier)*
- [ ] **V0 bis web** — WIP de `c0` récupéré : finir, gate, commit
- [ ] **W1** — `place` et `drawing` rendus par `CanvasV3Scene.tsx`
      (écart **LIVE** : une story iOS avec épingle de lieu s'affiche sans son lieu)
- [ ] **W2** — enchaînement multi-scènes au web (écart LATENT, doit précéder le
      multi-diapositives du lot C, sinon le lot C fabrique la régression)

### Phase C — iOS, après merge de #3389 *(sinon doublon sur `ComposerIntent.swift`)*
- [ ] **C2** — `MeeshyComposerHost` : plateau · scène · socle permanent
- [ ] **C3** — les portes tray iPhone/iPad consomment `ComposerIntent`
      *(partiellement livré dans `feat/composer-lot-c23` : `eafead645`, `92529dac5`)*
- [ ] **C4b** — `UpgradeGateView` (426) + porte iPad + porte de mise à jour
- [ ] **C5** — collage O12 + « Mes stickers » LRU
- [ ] **C6 / C6b** — capture appui long + auto-brouillon
- [ ] **C7 / C7b** — Étagère 4 onglets + alt text + `allowSoundExtraction`
- [ ] **C8** — gate final du lot (`xcodegen generate` puis `meeshy.sh test` COMPLET)

### Phase V — chantier v2 (après C)
V1 éventail · V2 document sans scène · V3 `.feedComposer` · V4 Mood+repost ·
V5 média reçu/forward · V6 web complet · V7 file de publication unique.

## 5. Les règles du chantier, non négociables

1. **Le P0 est vivant** : chaque tâche dont le gate passe met à jour
   `docs/product/planche-meeshy-composer.html` — **camembert ET
   matrice** — dans le MÊME commit que son gate. Un P0 périmé est un défaut bloquant.
   *Dette constatée à la reprise* : la matrice ne porte pas encore de LIGNE W1/W2
   alors que le dénominateur est passé à 67 ; et C3 y est « tout » alors que
   `feat/composer-lot-c23` en a livré une part.
2. **TDD** : RED prouvé avant GREEN, gate rejoué sur l'état FUSIONNÉ.
3. **Loi 6 — le lecteur EST l'aperçu** : aucun aperçu neuf. `MeeshyScenePlayer`
   existe (274 l. + 881 l. de tests SDK + 975 l. de gardes app).
4. **Loi 4** : un format non offert est **ABSENT**, jamais grisé.
5. **pbxproj** : il se GREFFE (union + contrôle nominatif), il ne se choisit jamais.
