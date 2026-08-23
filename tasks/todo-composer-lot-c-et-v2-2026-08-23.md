# Composer — lot C (chrome) + chantier v2 · plan exécutable

> Écrit le 2026-08-23 pour combler un trou constaté : les lots **B, D, F** ont
> chacun leur fichier de tâches (`tasks/composer-lot-{b,d,f}-revue-opus.md`),
> **le lot C n'en avait aucun** — alors qu'il est TOUT ce qui reste du chantier.
> Sa définition ne vivait que comme lignes de matrice dans les 351 Ko de
> `docs/superpowers/specs/2026-08-19-meeshy-composer-views.html`.

## Sources — trois, avec des rôles distincts

| Source | Rôle |
|---|---|
| `2026-08-20-meeshy-composer-execution-spec.md` | contrat **gelé** inter-lots, « Hors v1 » opposable |
| `2026-08-19-meeshy-composer-views.html` | source **vivante** : doctrine (11 lois), inventaire, matrice, **tableau de bord** — rév. 10, **77 %, 50/65** |
| `2026-08-23-meeshy-composer-v2-design.md` | **extension** : promotion de « Hors v1 » + lois nouvelles |

**Règle de maintenance héritée, non négociable.** Chaque tâche dont le gate
passe met à jour la planche — **camembert ET matrice** — dans le MÊME commit que
son gate. Un tableau de bord périmé est un défaut **bloquant**.

⚠️ **Deux sessions éditent ce HTML.** Convention à tenir : chacun ne touche que
**les lignes de matrice de ses propres tâches** ; le camembert est recalculé par
le dernier qui merge.

---

## Partie 1 — Ce qui reste du lot C  *(propriétaire : session composer iOS)*

Extrait de la matrice. Colonne « exécution » = `tout` pour chacune : le plan est
revu, **rien n'est écrit**.

- [x] **C2** ✅ *(livrée 2026-08-23)* — `MeeshyComposerHost` : plateau
      (`PlateauTint`, 3 teintes-jetons, `@AppStorage`), scène (l'atelier SDK
      ENVELOPPÉ, jamais réécrit), socle permanent (audience → œil → publier).
      L'œil est `MeeshyScenePlayer(.preview)` — loi 6. **65/65 verts.**
      Deux frontières SDK bougées : `currentEffects` en `public internal(set)`
      (lecture seule hors module) et deux jetons `MeeshyColors` ajoutés.
      Constat consigné : `textMuted` mesure **4,41:1** sur le violet profond,
      sous AA — témoin négatif posé.
- [ ] **C3** — le CÂBLAGE des portes vers le host (tray iPhone/iPad ; *le feed
      reste la sheet v1*). Une part est déjà sur main (`eafead645`, les portes
      portent leur format).
- [ ] **C4b** — Rupture cliente restante : `UpgradeGateView` (426) + porte iPad
      + porte de mise à jour
- [ ] **C5** — Collage O12 (la surface décide) + « Mes stickers » LRU
- [ ] **C6-C6b** — Capture appui long + AUTO-BROUILLON (fermeture & 426)
- [ ] **C7-C7b** — Étagère 4 onglets + alt text + `allowSoundExtraction`

**Déjà fait, ne pas refaire** : C0a/C0b/C0c (delta d'API B4, `4c937e078`),
C1 (`ComposerIntent`, `ff41657b9`, 25/25), C4a (`X-Canvas-Caps: 3`,
`cf05538d9`), correction `carrierAspect` (`b82ebbc17`).

**Existe déjà, ne pas reconstruire** : le **lecteur**. `MeeshyScenePlayer`
(274 l.) + `ScenePlayerMode` (37 l.), 881 l. de tests SDK, 975 l. de gardes app.
**Loi 6 — « Le lecteur EST l'aperçu »** : composer et viewers partagent un seul
registre de rendu. Aucune tâche ne construit d'aperçu.

---

## Priorité — directive du 2026-08-23

**iOS d'abord. Web en seconde priorité. Android mis de côté.**

Cela ordonne l'intérieur des lots autant que les lots eux-mêmes : quand une
tâche a deux moitiés (V0 bis en a une iOS et une web), **la moitié iOS part la
première**. Le lot H (Android) de la spec d'exécution est **suspendu** — ni
tâche, ni gate, ni ligne de matrice tant que cette directive tient.

`V0` fait exception à l'ordre : il sert les deux plateformes ET débloque C2-C3
côté iOS, donc il reste en tête.

---

## Partie 2 — Le chantier v2  *(propriétaire : session conception/web)*

Ces tâches **étendent** le dénominateur au-delà de 65. Elles ne remplacent
aucune tâche C.

- [x] **V0 — Le contrat partagé** ✅ *(gate vert 2026-08-23)*
      `packages/shared/utils/composer-contract.ts` + 23 tests
      (`__tests__/composer-contract.test.ts`). Gate : **104 fichiers / 2 490
      tests verts**, `tsc --noEmit` propre. Forme FIGÉE, consommable :
      `COMPOSER_DOORS` (9), `composerOpening(door, ctx)` →
      `{ initialFormat, offeredFormats }`, `buildUpdatePayload(known, draft)`.
      *(détail de la mission d'origine ci-dessous)*
- [x] **V0 — Le contrat partagé** *(démarre en premier — attendu par C2-C3)*
      `packages/shared` : les portes comme données, `initialFormat` +
      `offeredFormats`, `buildUpdatePayload(known, draft)`.
      `ComposerIntent.swift` devient le miroir du contrat, et cesse d'en être la
      source. **Bloquant pour C2-C3** : la session composer construit le
      sélecteur derrière une frontière étroite en l'attendant.
- [x] **V0 bis — Le repost miroite** ✅ *(les deux moitiés livrées, 2026-08-23)*
      - [x] **iOS d'abord** — les six sites qui passent `targetType: nil`
            (`ReelsViewModel:430`, `FeedViewModel:881`, `PostDetailView:301`,
            `ProfileUserPostsList:969`, `RootViewComponents:329`,
            `FeedView:449`) passent le format de leur source. Les deux sites
            `.post` du viewer de story ne changent PAS : ils deviennent
            l'option d'ancrage. Retirer au passage le commentaire périmé
            `nil = le serveur cree un POST (2026-08-19)`, qui énonce
            l'arbitrage renversé.
      - [x] **Web ensuite** ✅ — `RepostRequest` gagne `targetType`, les quatre
            sites passent le type de leur source, et le viewer de story ajoute
            l'ancrage « garder sur mon fil ». Gate : **749/749 suites,
            13 969 tests verts**.
            *Deux trous du WIP d'origine, trouvés au gate et refermés* :
            `PostsFeedScreen.storyRepost.test.tsx` GRAVAIT le défaut (il
            assertait `{ isQuote: false }` sans `targetType`), et le repost
            **CITÉ** du fil ne miroitait pas — `repostingPost` ne transportait
            même pas le type, ce que `tsc` a attrapé et qu'aucun test ne
            couvrait (`PostsFeedScreen.repostMirror.test.tsx`, neuf).
- [ ] **V1 — L'éventail** — `offeredFormats` gaté par `qualifiesAsReel`.
      *N'est pas une loi neuve* : c'est le raffinement de la **loi 9**. Contrainte
      de la **loi 4** : un format non offert est **ABSENT, jamais grisé**.
      Se pose SUR C2-C3, ne le remplace pas.
- [ ] **V2 — La surface « document sans scène » (I6)** — absorbée depuis
      `FeedComposerSheet`. **Condition bloquante de V3**, posée comme telle par
      la spec v1.
- [ ] **V3 — `.feedComposer` cesse de router** — inverse le « feed reste sheet
      v1 » de C2-C3. **Ne démarre qu'après V2.**
- [ ] **V4 — Mood (S3) + repost** — `.moodChip` et `.repost` cessent de router.
      Retrait de `StatusComposerView` (361 l.) et `UnifiedPostComposer` (739 l.,
      1 seul appelant). Borné par la **loi 10** : l'audience se souvient PAR
      FORMAT, puis la loi du repost la rétrécit encore.
- [ ] **V5 — Média reçu + forward (O13)** — `.conversationMedia` câblée, la
      fiche de forward gagne ses destinations non-conversation.
- [ ] **V6 — Web complet** — retrait de `PostComposer.tsx`,
      `StatusComposer.tsx`, `AudioPostComposer.tsx`, `RepostModal.tsx`.
      `StoryComposer.tsx` est **absorbé, pas retiré** (il porte le canevas v3).
- [ ] **V7 — File de publication unique (`PublishIntent`, S2)** — retrait
      d'`EditPostSheet.swift` (498 l.), dernier legacy.

---

## Partie 3 — Parité iOS ⇄ Web  *(rattrapages du lot F, dénominateur 65 → 67)*

Directive du 2026-08-23 : **iOS et le web doivent fonctionner ISO.** Deux dettes
du lot F, classées « lot futur » tant que la parité n'était pas l'objectif,
deviennent des tâches. Audit croisé matrice ⇄ code, vérifié des deux côtés.

- [x] **W1 — les deux kinds muets du web** ✅ *(livrée 2026-08-23)*
      `place` et `drawing` sont peints, en miroir des constantes du SDK
      (`StoryLocationLayer` pour la pastille, `StoryStrokeRasterizer` +
      `StrokeWidthMapping` pour les traits). 10 tests, oracle = le golden
      PARTAGÉ. **Renseignement** : le plafond de `effectiveWidth` passe APRÈS
      son plancher — un trait de base < 1 reste sous l'unité. Miroiter le CODE,
      pas l'intention de son commentaire.
      <details><summary>énoncé d'origine</summary>
      `CanvasV3Scene.tsx:591-599` ne dispatche que `text · media · audio ·
      sticker` ; `place` et `drawing` tombent sur un `return null` documenté
      « ignoré EN SILENCE ». Or iOS **émet les deux**
      (`CanvasV3Migration.swift:263` pour `drawing`, `:269` pour `place`) et le
      golden PARTAGÉ porte un `('L1','place','fg')`.
      **Symptôme** : une story composée sur iOS avec une épingle de lieu
      s'affiche sur le web **sans son lieu, sans rien signaler**.
      **Oracle** : `packages/shared/fixtures/canvas-v3/v1-legacy-full.v3.json`.
      </details>
- [x] **W2 — enchaînement multi-scènes au web** ✅ *(livrée 2026-08-23, AVANT
      le lot C comme sa contrainte l'exigeait)* — `StoryViewer` avance le rang
      au fil des durées cumulées ; `computeStoryDurationMs` devient la SOMME
      des scènes et la tête de lecture servie à la scène devient RELATIVE.
      **750/750 suites, 13 980 tests verts.**
      *Dette laissée, dite une fois* : les transitions inter-scènes
      (`scene.opening`/`closing`) ne sont pas peintes — le web ne les a JAMAIS
      peintes, pas même en legacy ; leur donner un rendu serait du neuf, pas de
      la parité.
      <details><summary>énoncé d'origine</summary>
      Le web ne rend que `scenes[sceneIndex]` — le contrat en autorise 10.
      Inoffensif tant qu'iOS n'émet qu'une scène ; **devient live le jour du
      multi-slides**, qui appartient au lot C. Livrer W2 après C serait
      fabriquer soi-même la régression.
      </details>

> **Nuance relevée en vérifiant l'audit** : le contrat déclare **sept** kinds
> actifs (`text, media, sticker, audio, place, drawing, mention`) mais **aucun
> écrivain n'émet `mention`** — iOS fait `continue` à la lecture
> (`CanvasV3Migration.swift:576`). Deux écarts vivants, pas trois. Ne pas
> écrire de rendu `mention` au web : il n'arrivera jamais.

> **A5 — ne pas cocher.** Sa colonne « reste » exige « armement post-B/C/F5b/**H** ».
> B et F5b sont faits ; H a livré la **lecture v3 + caps** mais **pas
> l'émission v3**. La condition d'armement de `CANVAS_V3_READ`/`WRITE` n'est
> donc PAS remplie.

---

## Partage de propriété — pour qu'aucune tâche n'ait deux auteurs

| Domaine | Propriétaire |
|---|---|
| `apps/ios/.../Composer/*` — host, portes, porte de mise à jour | session composer iOS (C2→C8) |
| `packages/shared` — contrat, lois produit | session conception |
| `apps/web/**` | session conception |
| Lignes de matrice de la planche | **chacun les siennes** |

**Point de contact unique** : `ComposerProfile.offeredFormats`. Côté contrat →
conception ; côté sélecteur dans le host → composer iOS.

**Décidé le 2026-08-23** : `ComposerOrigin.repost` et `.edit` **portent leur
format** dès C3 — l'appelant l'a déjà en main (on tape « reposter » sur une
carte rendue). Figer la signature sans lui obligerait à la rouvrir aussitôt.

---

## Revue

*(à remplir au fil des gates — un P0 périmé est un défaut bloquant)*

---

## Trouvé en chemin, à trancher hors des tâches ci-dessus

- **Le golden PARTAGÉ `packages/shared/fixtures/canvas-v3/story-3-slides.json`
  écrit son objet `place` sous une forme qu'aucun client ne lit** : `payload:
  {name, precision}`, là où iOS émet `payload: {place: {...}}`
  (`CanvasV3Migration.swift:269`, forme confirmée par `v1-legacy-full.v3.json`).
  **Sa scène 2 ne peint donc rien au web.** La fixture est consommée par des
  suites Swift (`CanvasV3DecodingTests`, `ScenePlayerIdentityRootTests`) :
  corriger la fixture demande de rejouer ces suites, ce qui dépasse W1/W2.
- **`Localizable.xcstrings` contient une clé EN DOUBLE**
  (`reading_mode.bubbles.subtitle`, deux entrées). Tout script qui relit puis
  réécrit ce JSON en détruit une **sans rien signaler** — c'est pourquoi les
  clés de C2 y ont été insérées par ancrage TEXTUEL, avec preuve que le reste du
  fichier est intact octet pour octet. Laquelle des deux entrées fait foi reste
  à trancher.
- **`CommentDraftStoreTests.swift` était sur `main` sans être enregistré au
  projet** — sa suite ne s'exécutait pas. `xcodegen` l'a ramassée au lot C2 ;
  elle tourne désormais.
