# Composer v2 iOS — reprise du 2026-08-25 : mesure, vagues, décisions

> Remplace, pour l'exécution, `tasks/todo-composer-lot-c-et-v2-2026-08-23.md`,
> dont la section « Chantier v2 — état réel » (V1 débranché, V2 « rien
> absorbé », V3 « route toujours ») est FAUSSE sur HEAD et cite des lignes qui
> n'existent plus (audit du 2026-08-25, contradiction #4). Ce fichier ne
> re-dit pas l'histoire : il dit ce qui est mesuré, ce qui est décidé, et ce
> qui reste.

## Sources — la hiérarchie n'a pas changé

| Source | Rôle |
|---|---|
| `docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md` | contrat gelé v1, « Hors v1 » opposable |
| `docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md` | extension v2 : lots 0→7, six lois |
| `docs/superpowers/plans/2026-08-2*-meeshy-composer-v2-lot-*.md` | plans d'exécution ; **chaque plan prime sur le §E qu'il détaille** |
| `docs/superpowers/specs/2026-08-19-meeshy-composer-views.html` | la planche : doctrine, inventaire, **tableau de bord P0** — rév. 24 au 2026-08-25 |
| audit du 2026-08-25 (42 agents, lecture seule) | la mesure lot par lot qui a produit la rév. 24 — reproduite dans la planche, pas ici |

**Règle héritée, inchangée** : une tâche dont le gate passe met à jour la
planche — camembert ET matrice — dans le MÊME commit ; un P0 périmé est un
défaut bloquant. **La rév. 24 rend cette règle mécanique** : chaque ligne de
matrice porte `data-task` / `data-kind` / `data-state`, et un script recompte
depuis le DOM ; si l'arc diverge, un bandeau rouge s'affiche dans la page.

## Ce que la mesure du 2026-08-25 a établi (résumé — le détail est dans la planche)

- **Rien n'est cassé ; tout était mal compté.** Huit commits (lots v2 4, 5, 6,
  7.1→7.8, stickers) avaient livré du code sans toucher la planche : 34 tâches
  de plan n'existaient nulle part, sept cellules « Sur main = — » étaient
  fausses, trois passages affirmaient l'inverse du code (`PublishIntent`
  « déscopé », l'éventail « non monté »).
- **Le seul vrai front produit iOS est lot 2 → lot 3** : la rangée d'outils du
  document ne sert que l'emoji (les cinq autres outils ont `effect: nil`,
  `ComposerDocumentSurface.swift:400-417`), la langue est une constante `fr`,
  `DocumentComposerDoor` n'a aucun site de montage, et le fil monte toujours
  `FeedComposerSheet` (`RootViewComponents.swift:899/911`, `FeedView.swift:1782`)
  plus l'overlay iPad (`FeedView.swift:1401`) qu'aucune garde ne nomme.
- **Une seule tâche du lot 7 jamais commencée : 7.6** (deux magasins, un
  pilote — le 501 d'`OutboxDispatcher.swift:90-103` est intact) ; deux
  pilotes sur une même story peuvent la publier deux fois.
- **Un défaut trouvé en passant, corrigé (`872151e55e`)** : la porte de mise à
  jour (`UpgradeGateController`) crashait TOUTE suite de tests sur le runtime
  iOS 26.1 — deinit isolée (SE-0466) exécutée sans tâche courante ; le gate
  C4b avait été mesuré sur iOS 18.2. `nonisolated deinit {}`, 13/14 → 14/14.

## Outillage de cette reprise (à réutiliser tel quel)

- Worktree : `/Users/smpceo/Documents/v2_meeshy-composer-v2`, branche
  `feat/composer-v2-ios-2026-08-25` (base `ae52866a8c`). Merge prévu sur
  `main` local du worktree `v2_meeshy-composer`, puis push (réseau GitHub
  indisponible au 2026-08-25 16:40 — à refaire).
- Simulateur DÉDIÉ `Meeshy-Composer` (`5583E7B1-DF1C-46A6-BADF-06EA7717D3F4`,
  iOS 26.1) — jamais le `30BFD3A6` partagé (iOS 18.2, occupé par d'autres
  sessions). DerivedData privée `scratchpad/DD-composer` ; produits dans
  `apps/ios/Build` du worktree (WorkspaceSettings l'impose).
- `scratchpad/gate.sh build | test Suite… | sdk Cible/Suite…` — le seul
  chemin de gate des agents ; `meeshy.sh` interdit (détecteur aveugle au
  worktree + `pkill` global après ~11 min).
- Référence rejouée avant tout diff : 13 suites `Unit/Composer/*`, 377 tests,
  376 verts + 1 crash préexistant (corrigé ci-dessus).

## Les vagues

### Vague 1 — en cours (workflow `composer-vague-1`)
- [ ] **P0 rév. 24** — réconciliation nominative de la planche (Opus).
- [ ] **Plan d'exécution lots 2-3** —
      `docs/superpowers/plans/2026-08-25-meeshy-composer-v2-lots-2-3-execution.md`,
      relu adversarialement avant d'être committé.
- [ ] `7.4b-commentaires` (S) — deux paragraphes faux depuis `c10801bbca`.
- [ ] `V0bis-glyphe` (S) — l'ancrage d'une story cesse de porter le glyphe de la republication.
- [ ] `A4-garde` (S) — garde de source sur `TusUploadManager` (funnel d'en-têtes = garantie client).
- [ ] `meeshysh-phase3` (S) — un gate vert cesse de cacher une phase 3 sautée ; `--require-connected` pour CI.
- [ ] `E1-deadcode` (S/M) — trois signatures SDK mortes, deux gardes retournées.
- [ ] `4.8-retrait` (M) — `StatusComposerView.swift` : parité bloc par bloc, puis retrait — ou STOP écrit.
- [ ] Clôture : rév. 24 bis (deltas de la vague), commit du plan.
- [ ] Revue Opus du diff complet, correctifs, re-gate (13 suites Composer + suites touchées + SDK touché).

### Vague 2 — lot 2 (la clé de voûte), sur le plan relu
- [ ] `V2-rangée` (L) — photo · caméra · document · lieu · micro : canal sur le
      brouillon → sélecteur (pipeline `ComposerDropResolver`/`ComposerIngestRouter`
      réutilisé) → publieur (`PublishIntent`, une fabrique document/média).
      iPadOS dans la définition de terminé.
- [ ] `V2-langue` (M) — capsule de langue dans le meuble ; `originalLanguage`
      déclaré par l'auteur, jamais `fr` en dur.
- [ ] `V2-garde-bascule` (M) — la garde du lot 3 voit les portes qui atteignent
      le document par bascule de format.
- [ ] Revue Opus, re-gate, planche dans le même commit que chaque gate.

### Vague 3 — lot 3, puis parité d'édition
- [ ] `V3-sheet` (L) — les trois sites `FeedComposerSheet(` → `DocumentComposerDoor` ; `AppInitWireupTests` (injections == présentations).
- [ ] `V3-ipad` (L) — l'overlay inline iPad, nommé par `LegacyComposer` et gardé.
- [ ] Retrait de `FeedComposerSheet` derrière la double preuve, avec STOP.
- [ ] `7.8-parité-édition` (L) → `7.8-retrait` (S, `EditPostSheet.swift`).

### Vague 4 — indépendantes (ordre libre)
- [ ] `7.6-exclusion` (L) — le TEST d'exclusion mutuelle avant le code ; STOP si `MeeshyUI` doit bouger.
- [ ] `7.8-consommateur` (M) — `routesToLegacy` gagne un lecteur réel, la garde cesse d'être vide.
- [ ] `D-debt` (M) — `Plan2DProjectAdapter` projette les 7 familles.
- [ ] `A1-envois` (M) — l'écran des envois en attente (« réessayer maintenant »).
- [ ] `7.4a-D3` (M) — `uploadContext` typé (miroir Swift de `PostMediaUploadContext`).
- [ ] `7.4b-D4` (M) — `createBorrowedSoundPost` rejoint la file durable.
- [ ] `G-O14` — le PLAN d'abord (exigé par le contrat gelé), puis le partage entrant → post/story.

## Décisions prises seul (directive d'appropriation du 2026-08-23) — chacune réversible, avec l'option écartée

- **⚠️ D1 — Compte de la planche : les 34 tâches de plan, dénominateur 104 (+1 rattrapage crash iOS 26.1).**
  Écarté : 4 lots comme unités (74). Raison : c'est le précédent de la planche
  (B8a→f, F7a→f, W1, W2, V0 entrés un par un) ; compter par lot cache 7.6.
- **⚠️ D2 — Un rattrapage hors plan entre au dénominateur** (`872151e55e`),
  comme `carrierAspect` en son temps. Écarté : le compter « hors chantier » —
  il est dans le lot C4b, et son gate y a été mal mesuré.
- **⚠️ D3 — `meeshy.sh` reste VERT quand la phase 3 est sautée, mais le DIT** ;
  `--require-connected` fait échouer, pour CI. Écarté : échouer par défaut —
  les postes locaux n'ont pas `DEMO_USER`, CI l'a.
- **⚠️ D4 — Lot G scindé** : O13 livré sous le lot 5 (renvoi, non recompté),
  O14 reste « à planifier », sans plan. Écarté : recompter O13 sous G (double compte).
- **⚠️ D5 — Ordre des vagues : lot 2 avant lot 3 avant parité d'édition**, 7.6
  hors chemin critique. C'est la dépendance gravée au §E de la conception v2 ;
  l'audit ne l'a pas contredite.

## Questions qui restent au porteur produit (l'agent avance sans, il ne les tranche pas)

1. `.reelTab` : point d'entrée Réels réel (iOS ET web), ou hors périmètre écrit ?
   Les deux plateformes ont la porte au contrat, aucune n'a de site de production.
2. `UnifiedPostComposer.swift` (739 l., `MeeshyUI`) : quel lot le possède ? Il
   garde UN appelant (repost story→post, `StoryViewerView.swift:867`).
3. Android (lot H) : la suspension du 2026-08-23 tient-elle ?
4. Armement de `CANVAS_V3_READ` / `WRITE_STRICT` : la condition « post-B/C/F5b/H »
   ne peut pas se remplir tant que H est suspendu — se réécrit-elle ?
5. Audience sous republication : `allowedAudiences` (`a7a9507718`) rend la parité
   « 6 niveaux » non stricte sous une republication — voulu ?
6. Les deux boutons de repost du viewer de story web : convergence sur la porte
   ou divergence inscrite au §G du plan lot 6 ?
7. La fiche de forward n'offre jamais que DEUX destinations à la fois par nature
   de média (`PublicationTarget.swift:47-50`) — la loi 6 en nomme trois : voulu ?

## Revue

*(à remplir au fil des gates — un P0 périmé est un défaut bloquant)*
