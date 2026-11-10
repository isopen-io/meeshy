# Reprise du chantier « kit de la planche » — passation du 2026-11-10

Ce fichier sert à reprendre le chantier depuis une session neuve, sur un autre compte. **L'état des lots se lit dans les issues et les PR, jamais ici** : ce document date du 2026-11-10 à 20 h UTC, et l'issue a raison en cas d'écart.

## Où vit le travail

- Dépôt `isopen-io/meeshy`, base **`dev`** (toute PR vers `dev` fusionne seule dès la CI verte, #9226).
- Issue chapeau **#17312**, milestone **258**. Les comptes rendus de chaque tour sont des commentaires de #17312.
- Workflow : `.claude/workflows/meeshy-kit-planche.js`, registre des lots `.claude/workflows/meeshy-kit-planche.lots.json` (il fait foi pour le périmètre). Planche : `docs/product/composer-vue-finale/planche.html`, lois : `docs/product/composer-vue-finale.md`, fiches de contrat : `docs/product/kit/Kxx-*.md`.
- Branches des lots : `claude/kit-kNN-<plateforme>` (ex. `claude/kit-k01-ios`). Branche de fil (correctifs hors lot) : `claude/project-thread-r6tyvs`. **Aucune PR de ce fil n'est ouverte** au moment de la passation.

## Ce qui est fait (fusionné dans `dev`)

| quoi | PR |
|---|---|
| Bloc d'attribution sur les PR de lot, décision « l'appel » au registre | #17330 |
| Règle « aucune régression de feature » au registre et au socle du workflow | #17332 |
| K00 iOS, catalogue du kit | #17336 |
| K00 Android, catalogue du kit | #17399 |
| K01 iOS, le verre (`MeeshyGlassTone`) | #17401 |
| K01 iOS, instantanés du verre enregistrés par la CI | #17430 |
| Le catalogue tient sans compte (l'accueil plein écran ne le recouvre plus) ; fiche en mode clair ; verre `onLight` lisible sous Liquid Glass | #17398, #17411 |
| Le verre sur média se rend en sombre quelle que soit l'apparence (contrastes mesurés sur le Mac) | #17416 |

## Ce qui reste

- **Tour pilote** (`seulement: K00, K01, K02`) : K00 web, K01 Android et web, K02 sur les trois plateformes. Le run en cours au moment de la passation était à `prouver:K01:ios:2`.
- **Tour kit complet** (`etape: kit`, sans `seulement`), à répéter jusqu'aux 26 lots livrés sur iOS, Android et web.
- **Tour intégrations** (`etape: integration`) : s'arrête à la PR ouverte. Captures web faites dans le conteneur ; captures iOS et Android par le Mac du porteur, avec son accord, une fois par vague.
- **Tour vérification** (`etape: verifier`), répété jusqu'à zéro écart bloquant sur 70 vues × 3 plateformes. Écarts actuels de couverture : #17349 à #17356.
- Issues ouvertes du kit à reprendre : #17414 (l'état appuyé du verre ne se voit pas sous Liquid Glass, à trancher avec K02), #17424 (Liquid Glass dans les instantanés), #17334 (verre dessiné au simulateur iOS 27 : l'argument `-MeeshyForceDrawnGlass` existe et fonctionne, vérifier le critère de fin puis fermer).

## Décisions du porteur (à respecter)

1. **SOTA** : toujours l'implémentation la plus optimisée, l'accélération matérielle et les dernières API de la plateforme quand elles existent.
2. **Aucune régression de feature** (2026-11-09 22:22) : quand le code et la planche divergent, la planche garde son épure ET chaque feature du code en plus est conservée, posée là où elle s'intègre le plus sobrement, sans doublon de ce que la planche rend déjà autrement. Retirer un comportement sans équivalent est un écart bloquant.
3. **Liste « l'appel »** (2026-11-09 22:11) : on garde Journal, Réagir, Capture et Image dans l'image. Messages reste à droite, comme la vue P2 le dessine.
4. iOS d'abord ; ne jamais sauter ni affaiblir un test ; iOS et Android ne se compilent que par la CI (`ios.yml`, `sdk-tests.yml`, `android.yml`) ; le web se prouve dans le conteneur ; pas de worktree ; une branche vivante qui écrit déjà les mêmes fichiers a priorité ; l'état vit dans les issues. Les questions produit ouvertes deviennent des issues `décision-produit`.
5. La répartition des modèles du workflow ne change pas.

## Points ouverts et pièges connus

- **Simulateur iOS 18 : impossible.** Xcode 27.1 ne propose aucun runtime antérieur à iOS 26. Le verre dessiné (rendu d'avant iOS 26) se montre sous iOS 27 avec l'argument de lancement `-MeeshyForceDrawnGlass` (DEBUG seulement).
- **La CI iOS ne tourne plus sur les PR** (`ios.yml` et `sdk-tests.yml` y sont « skipped ») : la preuve iOS vient du push sur `dev`, ou d'un `workflow_dispatch` sur la branche. Les runs de `dev` s'annulent souvent les uns les autres. Un build sur le Mac est une preuve de compilation rapide.
- `sdk-tests` est rouge sur `dev` hors du kit (`test_comparerDeuxSceneslourdes_neSerialisePlus`, tranche 6) : ce n'est pas un défaut du kit.
- Mac du porteur : `mac.home` (« meeshy.home »), dépôt `/Users/smpceo/Documents/v2_meeshy`. Le dossier principal porte des modifications non commitées d'une autre session : capturer dans le clone `/Users/smpceo/Documents/meeshy-capture-clone` (un vrai clone, pas un worktree). Captures dans `/Users/smpceo/Documents/meeshy-captures/Kxx/`. Simulateurs : Meeshy-iOS27 (iPhone 17 Pro), iPad Pro 13" M5 ; garder Compo-SE et Recette SE (d'autres sessions s'en servent).
- Catalogue : `xcrun simctl launch <udid> me.meeshy.app -MeeshyKitCatalogue K01` ouvre directement la fiche d'un composant, sans compte.
- Sur le compte neuf : connecter GitHub (https://claude.ai/connect-github) avec un compte qui a accès à `isopen-io/meeshy`, et relancer Remote Control sur le Mac depuis ce compte pour les captures.

## Le prompt à coller dans une session neuve

Ouvrir une session Claude Code sur le dépôt `isopen-io/meeshy`, puis coller :

```
Reprends le chantier « kit de la planche » de Meeshy. Lis d'abord docs/product/composer-vue-finale/REPRISE.md sur origin/dev, puis le dernier commentaire de l'issue #17312, puis les PR ouvertes dont la branche commence par claude/kit-.

J'opte explicitement pour l'orchestration multi-agents, sans limite de taille. Lance le workflow enregistré .claude/workflows/meeshy-kit-planche.js (outil Workflow, scriptPath) avec les arguments :
- etape : "kit", seulement : ["K00","K01","K02"] tant que le pilote n'est pas fini, puis etape "kit" sans seulement, à répéter jusqu'aux 26 lots livrés sur iOS, Android et web ;
- date : la date du jour (AAAA-MM-JJ) ;
- attribution : les deux lignes de fin de commit que ta session te donne (Co-Authored-By et Claude-Session) ;
- attributionPR : le bloc d'attribution de PR de ta session (commentaire claude-projects-attribution + ligne « Requested by »).

Après chaque tour : lis le bilan et le commentaire posté sur #17312, puis rends-moi compte en français (PR livrées, lots en attente de captures ou de mon accord, lots rouges ou bloqués et pourquoi, tour suivant). Vérifie toi-même le pilote une fois K00 à K02 fusionnés : les trois catalogues existent, le verre passe par une seule entrée, et tout répond au toucher. Corrige par PR vers dev les défauts du workflow ou du registre.

Ensuite, enchaîne les tours etape "integration" : arrête-toi à la PR ouverte. Fais les captures web dans le conteneur. Pour iOS et Android, rassemble les écrans et demande-moi les captures du Mac et mon accord, une fois par vague. Puis enchaîne les tours etape "verifier" jusqu'à zéro écart bloquant sur 70 vues × 3 plateformes.

Respecte les décisions de REPRISE.md (SOTA, aucune régression de feature, liste « l'appel »). Ne t'arrête que quand la vérification donne 70 vues conformes, ou devant un blocage que moi seul peux lever.
```
