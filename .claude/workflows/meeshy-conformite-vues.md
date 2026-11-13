# Workflow « conformité des vues » (#17311)

`meeshy-conformite-vues.js` vérifie qu'une planche de vues cibles est cohérente et que chacun de ses composants est implémenté, sur la plateforme de référence (iOS) puis sur ses miroirs (Android natif, web sur demande). Il vaut pour toute planche de la forme « lois + vues + captures » : `docs/product/appels-vue-finale.md` par défaut, `docs/product/composer-vue-finale.md` ou une autre par l'argument `planche`.

## Ce qu'il fait

| Étape | Ce qui sort | Modèle |
|---|---|---|
| Préparer | un arbre de lecture figé sur `origin/dev` | Haiku |
| Inventorier | lois, familles, vues, captures | Sonnet |
| Cohérence | par famille : les incohérences de la planche, et un **contrat** par vue (clauses vérifiables : disposition, hiérarchie, état, geste, règle) | Opus |
| Auditer | chaque clause confrontée au code, iOS d'abord, puis Android comparé à iOS ; un verdict avec fichier et ligne | Haiku si la vue est mécanique, Sonnet sinon |
| Vérifier | chaque écart réfuté ou confirmé, les divergences entre plateformes, les issues qui suivent déjà l'écart | Opus |
| Consolider | des lots sans fichier commun, chaque lot Android rattaché au lot iOS qu'il reproduit | Opus |
| Issue | une issue par lot, une issue `décision-produit` par question ouverte | Haiku |
| Développer | branche poussée tôt, TDD, gardes locales | Haiku ou Sonnet selon la réflexion du lot |
| Intégrer | merge de `dev`, conflits avec les PR ouvertes, relecture du diff contre le contrat, PR | Opus |
| Prouver, Corriger, Livrer | CI au SHA de tête, cause racine des rouges, fusion au vert et clôture | Sonnet, Opus, Opus |
| Bilan | un compte rendu daté | Sonnet |

La session qui lance le workflow (Fable) garde la définition : elle choisit la planche, le périmètre et le mode, lit le résultat de l'audit et décide de livrer.

Le mode `audit` s'arrête après « Consolider » et n'écrit rien, ni dans le dépôt ni sur GitHub. Le mode `livrer` enchaîne les étapes suivantes. Un lot Android part après la livraison du lot iOS qu'il reproduit, et reprend ses décisions.

## Les verdicts

- `conforme` : le code fait ce que la clause dit, preuve `fichier:ligne`, et le témoin qui le garde s'il existe.
- `ecart` : le code existe et fait autre chose.
- `absent` : rien ne l'implémente.
- `indetermine` : seul un écran allumé le dirait. Le workflow ne compile ni ne lance rien : ces clauses restent à rejouer au simulateur.
- `sans-objet` : la planche l'exclut pour cette plateforme.

Une incohérence de la planche ou un écart qui suppose un choix ne se tranche pas : il devient une issue `décision-produit`, et ses clauses n'entrent dans aucun lot.

## Lancer

Audit de toute la planche des appels, vue par vue (environ 150 agents pour 43 vues et deux plateformes) :

```json
{ "planche": "docs/product/appels-vue-finale.md", "mode": "audit" }
```

Audit moins coûteux, une unité par famille de vues (environ 45 agents) :

```json
{ "mode": "audit", "grain": "famille" }
```

Un périmètre réduit, puis la livraison :

```json
{ "mode": "livrer", "seulement": ["G1", "G2"], "chantier": 17311, "milestone": 31,
  "attribution": "Co-Authored-By: …\nClaude-Session: …" }
```

Arguments : `planche`, `plateformes` (défaut `["ios","android"]`, la première est la référence), `mode`, `grain`, `seulement`, `sauter`, `chantier`, `milestone`, `attribution`, `enTetePr`, `date`, `run`, `base`, `devPar`, `maxFix`, `consignes`.

**La facture** (directive porteur du 2026-11-10, #17406) est injectée dans les passes Cohérence, Développer et Intégrer, pour toute planche : ne rien recréer de ce qui existe ; le verre adaptatif de la plateforme partout (`adaptiveLiquidGlass`, `MeeshyGlassSurface`, la surface de verre du web) ; la vue affiche ce que la planche dessine, rien en plus ; rien n'apparaît ni ne disparaît d'un coup (un rail entre et sort par le bord de l'écran, une option de la barre du bas s'ouvre par morphisme de la barre). `consignes` (texte libre, 4 000 caractères au plus) ajoute les règles propres à un passage, sans rien retirer.

## Limites

- Le conteneur n'a ni Xcode ni SDK Android. La preuve de compilation est la CI de la PR, et la preuve visuelle reste une capture au simulateur.
- Une PR dont le vert n'est obtenu qu'en relançant des tests ciblés n'est pas fusionnée : elle est laissée prête, pour le porteur.
- Le compte rendu est daté. L'état vivant reste dans les issues.
