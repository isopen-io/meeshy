# Plan — Iteration-236i : un seul compteur de non-lus

**Analyse** : `docs/analyses/uiux/2026-08-22-iteration-236i-unread-count-consolidation.md`
**Base** : `main` HEAD `5d1d85b1` · **Branche** : `claude/intelligent-noether-aymk2j` (repartie fraîche de `origin/main`)

## Thèse

235i avait **nommé** les derniers graveurs de pluriel de la famille « non-lus »
sans les instruire ; 234i avait montré qu'un défaut nommé clé par clé se
re-corrige indéfiniment. Cette itération applique aux non-lus le remède qui a
marché pour les membres : **une règle plurielle par nom compté, une clé, un site
de rendu**.

## Étapes

- [x] Resync sur `origin/main` ; **merge préalable de #3257 (235i)** — son gate
      iOS (`Build app + tests unitaires`) était vert, son seul rouge était un
      test **web** (`story-v3-roundtrip.test.tsx`) qu'un diff iOS-only ne peut
      pas causer. Numéro 236i choisi strictement au-dessus du plus haut mergé.
- [x] Collision essaim vérifiée : 0 PR iOS ouverte partageant un fichier
      (#3250 → `OnboardingAnimations.swift`, #3288 → pile d'appels).
- [x] Inventorier la famille : **5 clés, 3 mécanismes**, dont 2 déjà correctes
      (`accessibility.unread_count`, `a11y.back.with_unread`) à ne pas toucher.
- [x] Constater les 3 défauts : doublon exact amputé de son accord (bouton de
      défilement), concaténation d'un adjectif nu (recherche globale), clé à
      plat sur l'autre nom compté (cloche).
- [x] Poser `UnreadCountLabel` — jumeau de `MembersCountLabel`, paire
      `bundle`/`locale`, **deux fonctions** (le genre de « message » et de
      « notification » diffère : une clé par nom compté).
- [x] Catalogue : 2 clés supprimées, 1 convertie à plat → `variations.plural`
      (6 formes en arabe, calquées sur l'entrée sœur), round-trip prouvé
      **avant** édition.
- [x] Rebrancher les 4 sites, gardes produit `> 0` conservées à l'identique.
- [x] `UnreadCountLabelTests` — 23 assertions : accords sur les 2 noms dans
      6 locales, verrou général `singulier ≠ pluriel`, interdiction de fusionner
      les 2 clés, catégories arabes distinctes, aucune lettre latine greffée,
      aucun spécificateur qui fuit, 2 gardes de source.
- [x] Gardes de source sur la forme **CITÉE** des clés retirées (leçon 235i :
      une garde sur le nom nu rougirait sur son propre commentaire explicatif).
- [x] 8 entrées `pbxproj` (exception documentée par `apps/ios/CLAUDE.md` : les
      lignes qui ajoutent la référence d'un fichier neuf se committent).
- [ ] Gate : CI `Build app + tests unitaires` (mot-clé `[run test]` au sujet).

## Non-fait, et pourquoi

- **`MeeshyAppIntents.swift:272`** — dernière occurrence de la famille, hors
  SwiftUI. `IntentDialog` se compose depuis `LocalizedStringResource`, pas
  depuis `String(localized:)` : y brancher un `String` calculé demande un
  compilateur pour être vérifié, et un échec de compile coûterait le cycle CI
  entier. Documenté, reporté en 237i.
- **La forme `one` qui grave son « 1 »** — la règle CLDR française range 0 et 1
  dans `one`, donc un compteur à zéro rendrait « 1 message non lu ». Cas
  **inatteignable** (gardes `> 0` aux quatre sites) ; corriger une clé déjà
  correcte pour un cas mort serait de l'élargissement de périmètre.

## Pièges traités

| Piège | Traitement |
|---|---|
| Sérialisation du catalogue | Round-trip prouvé octet pour octet **avant** édition ; `sort_keys=True` produit un fichier de même longueur mais réordonné |
| Garde de source rougissant sur son propre commentaire | Elle cherche la forme **citée** (`"…"`), les fichiers ne mentionnant les clés retirées qu'en prose (accents graves) |
| Assertions dépendantes du poste | `bundle` et `locale` fixés par PAIRE ; aucune assertion sur un chiffre rendu en arabe (numération variable) |
| Clé orpheline au catalogue | Les 2 clés supprimées n'ont plus aucune référence — `test_everyAppCatalogIdentifierKeyIsReferencedInCode` reste vert |
| Suite non exécutée par la CI | `[run test]` au sujet du commit (doctrine 234i) |
| Suite verte par omission en local | 8 entrées pbxproj, XcodeGen régénérant de son côté en CI |

## Empreinte

| Catégorie | Delta |
|---|---|
| Fichiers prod | 4 modifiés + 1 neuf |
| Suite de test | 1 neuve (23 assertions) |
| Clés i18n | −2 supprimées, 1 convertie, **0 neuve** |
| Changement visuel / logique / réseau / SDK | 0 |
