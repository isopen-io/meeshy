## La moitié qui coûte le plus : la vérification ne POUVAIT pas voir le défaut

J'avais annoncé « `tsc --noEmit` du gateway : 0 erreur » comme preuve de la
résolution. Mesuré après coup :

```jsonc
// services/gateway/tsconfig.json
"include": ["src/**/*", "shared/**/*"],
"exclude": ["node_modules", "dist", "…/encryption/**/*",
            "src/**/__tests__/**/*", "src/**/*.test.ts", "src/**/*.spec.ts"]
```

**Le typecheck et l'exécution des tests couvrent des ensembles de fichiers
DISJOINTS.** Une erreur de type dans un test est invisible à `tsc` (exclu) et
FATALE à jest (qui typecheck chaque suite au chargement). « J'ai lancé le
typecheck » ne vérifie donc JAMAIS un fichier de test — et c'est exactement là
que vivent les consommateurs de l'API qu'on vient de supprimer.

### CORRECTION mesurée le même jour (#6160) — c'est plus fin, et le trou est ailleurs

La phrase ci-dessus est vraie et INCOMPLÈTE. Relevé exact du gateway :

| couche | config | ce qu'elle couvre |
|---|---|---|
| `tsc --noEmit` | `tsconfig.json` | exclut les tests ⇒ **rien** |
| ts-jest | `tsconfig.test.json` (`include: src/**/*`) | les tests, **mais seulement les fichiers qu'une exécution CHARGE**, et `diagnostics.ignoreCodes: [2307, 2322, 2339, 2345, 2740]` |
| personne | — | les fichiers de test qu'aucune exécution ne charge |

```
npx tsc -p tsconfig.test.json --noEmit --pretty false | grep -c 'error TS'  →  3562
  3467  dans les cinq codes que ts-jest IGNORE  → invisibles à tsc ET à jest
    95  hors de ces cinq codes                  → dans des fichiers jamais chargés
```

ts-jest typecheck donc bien les tests — **à la demande, fichier par fichier, et
sourd à cinq codes.** Mon `TS2305` a été attrapé parce qu'il n'est pas dans la
liste muette ET que la suite était chargée ; un `TS2345` au même endroit ne
l'aurait pas été. **Le trou a deux moitiés** : cinq codes muets PARTOUT, et TOUT ce
qu'aucune exécution ne charge.

Et la faute de mesure, à garder pour elle-même : mon premier comptage a rendu
**0 erreur** parce que je grepais `error TS` sur la sortie PRETTY de `tsc`, où les
codes ANSI coupent la chaîne. J'ai failli conclure « ce gate coûte zéro » depuis un
format que je n'avais pas vérifié — la faute même que cette leçon dénonce, commise
en la dénonçant. **`--pretty false` avant tout comptage.**

Troisième garde, la moins chère et orthogonale (session `andp-00`) : le signal
manqué n'était pas le rouge, c'était le COMPTE. Dans
`Tests: 24043 passed, 24043 total`, les tests de la suite morte ne sont pas comptés
*en échec* — ils ne sont **pas comptés du tout**, et le corpus rétrécit en silence.
Un cliquet sur le nombre de suites CHARGÉES attrape aussi le cas où le job reste
VERT (une suite qu'un `testPathIgnorePatterns` avale).

> **Avant de tirer une preuve d'un outil, lire son `include`/`exclude`.** Un
> outil vert sur un ensemble qui ne contient pas le fichier douteux n'a rien
> mesuré. C'est la 583 posée sur l'espace au lieu du temps : un témoin ne mesure
> son sujet que si son sujet est dans son champ.

Ce qui attrape ce défaut-là, après une suppression d'export, ne coûte qu'une
commande — et elle doit balayer TOUTES les refs, pas le clone (leçon 561) :

```bash
grep -rn '<NomSupprimé>' --include='*.ts' packages services apps   # le clone
git for-each-ref --format='%(refname)' refs/remotes/origin refs/heads \
  | while read -r r; do git grep -l '<NomSupprimé>' "$r" 2>/dev/null; done
```

Mesuré ici : le clone rendait UN consommateur (celui de dev, réparé) ; les
1 707 refs en rendaient un SECOND — `packages/shared/__tests__/utils/
last-message-protection.test.ts` sur `claude/ios-reactions-coherence`, le test
unitaire de la jumelle. Il rejouerait le défaut à la fusion de cette branche.

Et la résolution elle-même suit la 586 : on n'AJOUTE PAS l'alias négatif
(`lastMessageTextMayTravel` = `!isLastMessageProtected`). Deux noms pour une loi,
c'est ce que cette résolution venait de payer — le consommateur adopte le
vocabulaire du dépôt.
