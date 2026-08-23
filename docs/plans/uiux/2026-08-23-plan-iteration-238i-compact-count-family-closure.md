# Plan — Iteration-238i : fermeture de la famille « abrégé compact »

**Date** : 2026-08-23 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `2e24d7cc`
**Branche** : `claude/intelligent-noether-4m5rwq`
**Analyse** : `docs/analyses/uiux/2026-08-23-iteration-238i-compact-count-family-closure.md`

## Objectif

Router les **six** derniers abrégés compacts composés à la main vers
`CompactCountLabel` (source unique posée en 237i), puis **fermer la famille**
par une garde de source — trois itérations de consolidation successives n'ont
jamais empêché la copie suivante.

## Préalables (faits)

- [x] `origin/main` synchronisé — HEAD `2e24d7cc`, aucun écart local.
- [x] Collision d'essaim : **0 PR iOS ouverte** (#3352 = gateway).
- [x] Numéro : plus haute itération mergée = 237i ⇒ **238i**.
- [x] 237i vérifiée atterrie **en entier** (helper + suite + 2 sites d'appel).

## Étapes

- [x] **1. Trancher l'arbitrage différé par 237i** (les deux seuils `10_000`).
      `formatNumber` : seuil **réel**, prouvé par la branche en dessous
      (`n.formatted()` — un compte de MOTS ne se dégrade pas tant qu'il est
      lisible) ⇒ conservé. `StatRing.displayValue` : seuil **mort**, la branche
      suivante lui est identique au caractère près ⇒ supprimé.
- [x] **2. Router les 4 sites byte-identiques** — `FeedPostCard` (2 appels),
      `ReelFeedCard` (1), `ReelsPlayerView` (2), `PostDetailView` (2).
      Supprimer les 3 helpers `static`.
- [x] **3. `PostReachFormatter`** — supprimer `compact`, ajouter `locale` à
      `components` (seul site sous test : sans paramètre, la suite jugerait la
      locale du simulateur). Ajouter `import MeeshyUI`.
- [x] **4. `ConversationDashboardView`** — `formatNumber` délègue au-dessus de
      10 000 et rend `formatted()` en dessous (le repli `"\(n)"` gravait les
      chiffres latins sous 1 000 alors que la bande du dessus rendait déjà ceux
      de la locale) ; `StatRing.displayValue` délègue entièrement.
- [x] **5. Réécrire `PostDetailReachAndVisibilityTests`** en propriétés — la
      régression testée est la **variance à la locale**, pas une chaîne CLDR.
- [x] **6. Garde `CompactCountConsolidationSourceGuardTests`** — interdiction
      (`"%.1fk"` / `"%.1fM"`, commentaires dépouillés) + consolidation (8 hôtes
      nomment la source unique) + auto-garde + non-régression sur `"%.1fMB"` et
      `"%.1fMbps"`.
- [x] **7. Doc-comment `CompactCountLabel`** — déclarer le rôle de source unique
      et nommer la garde.
- [x] **8. Leçon** consignée dans `tasks/lessons.md`.

## Vérification (sans toolchain Swift)

- [x] Garde rejouée hors Swift sur les 6 racines : 1216 fichiers, **0 contrevenant**, **8 hôtes OK**.
- [x] Équilibre `{}` / `()` / `[]` au tokenizer sur les 9 fichiers : 0 / 0 / 0.
- [x] 0 occurrence vivante des 3 helpers supprimés (`grep` dépôt entier).
- [x] 0 clé i18n neuve.
- [x] `pbxproj` non touché — globbing `project.yml` + `xcodegen generate` en CI.
- [x] **Gate réel : CI « iOS Tests »** — PR #3364, tête `e28fcc8a`. **17 verts,
      1 rouge rouge-sur-`main`.** Détail en fin d'analyse.
- [x] **Piège évité : le premier run n'exécutait RIEN.** Tout vert, mais sous le
      nom `Build app (app + cibles de test)` — la suite iOS est en opt-in par
      mot-clé dans le SUJET du commit (`ios.yml:250` + job `scope`). Un lot dont
      l'apport est une garde neuve + une suite réécrite allait être annoncé vert
      sans que ni l'une ni l'autre n'ait tourné. Sujet amendé (` — run test`),
      même arbre, force-push sur ma branche.
- [x] **Échec 1/2 — le mien, corrigé (`e28fcc8a`).** La garde VoiceOver de
      `StatRing` découpait avec `prefix(2600)` ; mon doc-comment a poussé la FIN
      du motif hors fenêtre (offset 2411 → 2595, motif de 30 car.). Marge
      résiduelle sur `main` : **5 caractères**. Borne rendue sémantique plutôt
      que raccourcir le commentaire — raccourcir réarme le piège avec moins de
      marge encore.
- [x] **Échec 2/2 — rouge sur `main`, signalé et NON corrigé.**
      `test_socketReconnect_reEmitsCallJoin` : `60f94f99` (Vague 162) a renommé
      l'émission en `emitCallJoinWithAckDetailed` sans mettre à jour le motif de
      sa garde. `CallManager.swift` est identique à `main` dans ce lot. Correctif
      proposé en commentaire de PR, à porter par la piste **calls**.

## Hors périmètre (documenté en suites)

- Unifier les deux seuils survivants (1 000 pour `StatRing`, 10 000 pour le
  compte de mots) — vraie décision produit, chacun tenant à sa contrainte propre.
- Les `accessibilityValue` interpolant l'entier brut sur 4 sites (suite 3).
- `MeeshyAppIntents.swift:272` — demande un compilateur ⇒ **tâche macOS**.
