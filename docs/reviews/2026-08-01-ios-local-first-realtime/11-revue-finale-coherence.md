# 11 — Revue finale de cohérence : la revue de la revue

> Ce fichier documente la passe finale de contrôle qualité exercée SUR les livrables `README`–`10`, les verdicts des trois relecteurs, et les corrections appliquées en conséquence. Il clôt la revue.

## 1. Chaîne de production et de contrôle

| Étape | Agents | Résultat |
|---|---|---|
| Cartographie | 13 lecteurs parallèles (dimensions disjointes) + 3 relances | 13 rapports d'architecture, 138 écarts bruts |
| Vérification adversariale | 13 vérificateurs (défaut = réfuter) | **81 CONFIRMÉS · 34 AJUSTÉS · 5 RÉFUTÉS · 18 DOUBLONS** ; rapports de cartographie corrigés en place |
| Rédaction | 9 rédacteurs (un par fichier `01`–`09`) | 115 fiches, gabarit strict (preuve / correctif pas-à-pas / tests TDD / risque) |
| Plan | rédigé par l'orchestrateur | 13 lots ordonnés par dépendances |
| **Revue finale** | **3 relecteurs à angles disjoints** | **43 issues (0 bloquant · 16 majeurs · 27 mineurs)** |
| Corrections | 4 correcteurs (fichiers disjoints) + orchestrateur (README, 00, 10, escalades trans-fichiers) | 43/43 issues traitées ; 2 fiches reclassées en doublons → **113 fiches retenues** |

Environ 45 agents, ~8,7 M tokens de sous-agents, sur le HEAD figé `901e92589`.

## 2. Verdicts des trois relecteurs (synthèse fidèle)

### Angle 1 — Exactitude factuelle vs code
> « La revue tient son contrat d'exactitude factuelle à un niveau remarquable. Les 28 fiches P0/P1 ont été confrontées au code : toutes les preuves citées sont exactes (fichier, lignes à ±2 près, comportement conforme), les symboles référencés par les correctifs existent réellement, et les "Ne PAS toucher" sont justifiés par le code. Les réfutations des "Écartés" citent des garde-fous réels et vérifiés. […] Aucun correctif examiné ne casserait un comportement existant non mentionné. »

Vérifié : 28/28 fiches P0+P1 en profondeur, ~25 fiches P2/P3 échantillonnées (> 1/3 par fichier), 5 réfutations contrôlées. **2 issues mineures** (une référence de preuve décalée dans sync-01, un décompte approximatif dans 00) — corrigées.

### Angle 2 — Applicabilité à moindre effort
> « Les correctifs P0/P1 sont exceptionnellement précis — sur ~40 suites de test citées et vérifiées sur disque, seules 3 références étaient inexactes ; les mocks/seams clés existent bien. Les défauts se concentrent dans la couture inter-fiches et dans le plan […] Rien de bloquant, mais ces points majeurs feraient trébucher un exécutant qui suit le plan à la lettre. »

**15 issues** (8 majeures) : deux ordres intra-lot contredisant des prérequis explicites, un SQL de purge feed instruit en double, un site de correctif manquant dans sync-04 (`requireReauthentication`), deux renvois client vers des fiches inexistantes/réfutées, un chantier aux périmètres contradictoires (gwcontract-05/rts-04), la table Vue d'ensemble fausse sur 6 lots — toutes corrigées.

### Angle 3 — Cohérence inter-fichiers et complétude
> « La couverture mécanique est très bonne : les 115 fiches retenues apparaissent toutes exactement une fois dans le plan, et les sévérités/efforts fiche↔plan concordent (0 divergence individuelle). Mais deux fiches avaient un double statut retenu/doublon (rts-04, cache-10), un doublon pointait vers un canonique réfuté (rts-08→sync-08), trois résumés du plan prescrivaient l'inverse du geste de leur fiche, deux renvois ne résolvaient vers aucune fiche, et le plan séparait de 10 lots deux fiches déclarées indissociables (appgroup-01/05). »

**26 issues** (10 majeures) — toutes corrigées.

## 3. Corrections structurantes issues de la passe finale

1. **Reclassements** : `cache-10` → doublon rattaché de media-03/media-04 (même funnel de téléchargement) ; `rts-05` → doublon rattaché de stores-12 ; `rts-04` réduit à son volet client (le volet gateway, `read-bulk` inclus, vit uniquement dans gwcontract-05). Total retenu : **115 → 113 fiches** (répercuté dans le titre du plan, la table Vue d'ensemble, 00 §9).
2. **Grille de sévérités alignée sur l'arbitrage réel** (README) : P0 = perte de données / fuite cross-compte ; la « désynchronisation visible durable » relève de P1 — conforme aux resévérisations effectivement pratiquées (sync-01, realtime-01, gwcontract-02).
3. **Ordres intra-lot réparés** pour respecter la règle « l'ordre listé encode les dépendances » : lot 6 (realtime-01 AVANT sync-01 — il fournit le hook `messageDeletionPersistor`), lot 5 (stores-05 tranché AVANT stores-03), lot 9 (net-07 avant net-01), lot 10 (appgroup-09 avant appgroup-07), lot 12 (gwcontract-11 avant gwcontract-08).
4. **appgroup-05 remonté au lot 0**, apparié à appgroup-01 dans la même PR — exécuter le wipe App Group sans les états vides explicites aurait fait apparaître les conversations fabriquées « John Doe » sur tout appareil déconnecté.
5. **Résumés du plan réalignés sur le geste réel des fiches** : rts-01 (flag `hasSubscribedOnce`, PAS de levée de la garde `posts.isEmpty` — mécanisme explicitement rejeté), stores-08 (`savePreservingFreshness`, l'option `mergeUpdate` est rejetée), startup-03 (signal `sessionInvalidated` + toast, la purge reste inconditionnelle — invariant anti-fuite Q3), outbox-08 (gateway déjà prêt, correctif iOS seul), gwcontract-02 (le mode `updatedSince` parallèle est rejeté).
6. **Renvois pendus résolus** : sync-04 porte désormais l'étape `requireReauthentication` ; gwcontract-04 embarque ses étapes client concrètes ; le fallback d'id de traduction gateway (`Date.now()`) est documenté en Question ouverte n° 8 du fichier 06 et pointé par grdb-06 ; les dépendances vers le réfuté sync-08 sont purgées ; stores-05 renvoie à grdb-01 au lieu de dupliquer un SQL divergent ; la table Vue d'ensemble (efforts, marques 🔧) est recalculée depuis les fiches.

## 4. État final garanti

- **113 fiches retenues** (5 P0 · 23 P1 · 49 P2 · 36 P3), chacune vérifiée par un agent adversarial indépendant PUIS re-contrôlée par au moins un des trois relecteurs finaux (100 % des P0/P1, > 1/3 des P2/P3 par fichier, croisement mécanique 113/113 fiche↔plan).
- **5 écarts réfutés** documentés dans les sections « Écartés » avec le garde-fou qui les neutralise — pour empêcher toute redécouverte.
- **20 doublons rattachés** à leur canonique avec le détail de ce qu'ils apportent.
- **Chaque fiche** : preuve `fichier:ligne` au HEAD `901e92589`, correctif numéroté avec « Ne PAS toucher », plan de test TDD (RED d'abord, suites réelles vérifiées sur disque), risque de régression et garde-fous, dépendances, drapeau backend.

## 5. Limites connues (à garder en tête pendant l'application)

1. **Le HEAD bouge** : la revue est exacte à `901e92589`. Diff constaté au moment de la clôture : seuls `VideoFilterPipeline.swift` et `gateway posts/mediaOwnership.*` avaient bougé — aucun n'est cité par une fiche. Ré-ancrer chaque preuve avant application (règle 3 du plan).
2. **Trois décisions produit/architecture explicites** restent à trancher par un humain avant leurs lots : stores-05 (destin du pipeline feed GRDB), net-04 (peupler le pinning ou l'abandonner), question ouverte n° 2 du fichier 06 (temps réel voulu pour les invités ?).
3. **Les Questions ouvertes** des fichiers 01–09 sont des pistes vérifiées mais non instruites en fiches — les traiter comme entrées de backlog futures, pas comme des correctifs prêts.
4. Les efforts S/M/L sont des ordres de grandeur par fiche, pas des engagements — le contrat d'exécution (une fiche = un mini-projet TDD) prime sur toute vélocité supposée.
