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

- [ ] **C2-C3** — Portes de présentation consommant `ComposerIntent`
      (tray iPhone/iPad ; *le feed reste la sheet v1*)
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
- [ ] **V0 bis — Le repost miroite** *(aucune dépendance, livrable seul)*
      - [ ] **iOS d'abord** — les six sites qui passent `targetType: nil`
            (`ReelsViewModel:430`, `FeedViewModel:881`, `PostDetailView:301`,
            `ProfileUserPostsList:969`, `RootViewComponents:329`,
            `FeedView:449`) passent le format de leur source. Les deux sites
            `.post` du viewer de story ne changent PAS : ils deviennent
            l'option d'ancrage. Retirer au passage le commentaire périmé
            `nil = le serveur cree un POST (2026-08-19)`, qui énonce
            l'arbitrage renversé.
      - [ ] **Web ensuite** — `RepostRequest` gagne `targetType` (le champ n'y
            existe pas), chaque site passe le type de sa source, et le viewer
            de story ajoute « reposter en post ».
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
