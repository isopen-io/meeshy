# Plan — Iteration-239i : les statistiques de portée que VoiceOver ne pouvait pas attribuer

**Date** : 2026-08-23 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `7831df48`
**Branche** : `claude/intelligent-noether-4m5rwq` (repartie fraîche — PR #3364 de 238i mergée)
**Analyse** : `docs/analyses/uiux/2026-08-23-iteration-239i-reach-metric-voiceover-attribution.md`

## Objectif

Solder la suite **(c)** du pointeur 238i. Le pointeur annonçait un défaut i18n
(« chiffres latins lus en arabe ») ; l'ouverture des sites a montré que c'était
**le moins grave des trois** défauts présents.

## Préalables (faits)

- [x] PR #3364 (238i) **mergée** — vérifiée atterrie EN ENTIER sur `main` :
      6 sites de production, 3 fichiers de test, le helper SDK, les docs, les leçons.
- [x] Branche **restartée depuis `origin/main`** (`7831df48`) — une PR mergée ne
      porte pas de travail de suite.
- [x] Numéro : plus haute itération mergée = **238i** ⇒ **239i**.

## Étapes

- [x] **1. Mesurer avant de corriger.** Les 4 sites disent la même donnée de
      3 façons ; 2 d'entre eux sont **déjà corrects** (`ReelFeedCard`,
      `ReelsPlayerView`) et leurs 2 helpers sont identiques au caractère près.
- [x] **2. `ReachMetricLabel`** — un nombre, un élément, un nom. Fusion de
      `metricInline` + `statInline`, étendue aux 2 écrans fautifs. Réutilise
      `feed.reel.views` / `feed.reel.impressions` ⇒ **0 clé neuve**.
- [x] **3. Valeur parlée EXACTE, affichage abrégé** — divergence assumée, seule
      décision de conception du lot. `formatted(locale:)`, pas `"\(count)"`.
- [x] **4. Les 4 écrans convertis** ; la puce `·` passe
      `.accessibilityHidden(true)` ; `children: .ignore` retiré du bloc de
      `PostDetailView` qui **avalait le `@pseudo`**.
- [x] **5. `PostReachFormatter` rétréci** à `{ pseudo, showsStats }` — ses deux
      chaînes pré-formatées n'étaient plus lues que pour leur nullité, soit la
      branche morte que 238i dénonçait dans `StatRing`.
- [x] **6. Tests de locale 238i DÉPLACÉS**, pas supprimés, vers
      `ReachMetricLabelTests` — la règle a changé d'adresse.
- [x] **7. Garde `AccessibilityValueAttributionGuardTests`** — interdiction de la
      puce + consolidation des 4 écrans + auto-garde + non-régression sur
      « 3 / 10 » et « 42 % ».
- [x] **8. Garde 238i re-listée (8 → 5 hôtes)** — elle a rougi en détectant la
      migration de l'appel, ce qui est son travail. Réduction **documentée dans
      le code**, versant interdiction inchangé.

## Vérification (sans toolchain Swift)

- [x] Garde 239i rejouée hors Swift : 1221 fichiers, **0 puce**, **4/4 écrans**.
- [x] Extracteur exercé : **14** `accessibilityValue` réellement extraites.
- [x] Garde 238i rejouée après re-listage : **0 contrevenant**, **5/5 hôtes**.
- [x] Équilibre `{}` / `()` / `[]` sur les 9 fichiers : 0 / 0 / 0.
- [x] 0 clé i18n neuve · `pbxproj` non touché.
- [ ] **Gate réel : CI « iOS Tests », suite COMPLÈTE** — sujet du commit portant
      ` — run test` (leçon 238i : sans l'opt-in, le check compile seulement et
      un lot dont l'apport EST une garde neuve serait vert sans l'avoir exécutée).

## Hors périmètre (documenté en suites)

- Compteurs de like/commentaire à l'entier brut (4 sites) — même défaut de
  chiffres, **autre famille** de composants.
- ~~`feed.post.reach` laissée au catalogue~~ — **erreur, corrigée dans le lot** :
  une garde distincte (`test_everyAppCatalogIdentifierKeyIsReferencedInCode`)
  interdit les clés sans appelant. Entrée supprimée.
- Les 3 `prefix(1400)` restants — ancrés sur des sites d'appel, pas sur des
  déclarations : la borne sémantique y demande un autre repère.
