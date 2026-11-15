## 2026-11-07 — Sur une branche de travail, un second dispatch ANNULE le premier : la preuve est unique et vit sur la DERNIÈRE tête

`ci.yml` déclare :

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/dev' && github.ref != 'refs/heads/main' }}
```

Sur `dev` et `main`, les runs s'empilent. Sur **toute autre référence** —  donc sur
toute branche de session — `cancel-in-progress` vaut `true` : un nouveau run du
même workflow sur la même branche **tue celui qui tourne**.

Mesuré : le dispatch 42310801928 (tête `4fe21dab`, la preuve du lot fusionné par la
PR #16553) s'est conclu `cancelled` — non parce qu'il échouait, mais parce que j'ai
lancé un second dispatch sur la MÊME branche pour le lot suivant (`efbfa1f5a`).
J'ai détruit ma propre preuve en flight.

> **La CI des PR étant gelée (`vars.PR_CI_GEL`), le `workflow_dispatch` est la seule
> preuve — et il n'en existe qu'UNE à la fois par branche.** Elle appartient à la
> DERNIÈRE tête poussée. Deux conséquences pratiques :
>
> 1. **Ne rien pousser sur la branche tant qu'un dispatch dont on attend la
>    conclusion y tourne** — un commit de plus, même documentaire, l'annule.
> 2. **Un lot déjà fusionné ne se prouve plus par sa branche** : son code est dans
>    `dev`, et c'est la CI de `dev` (qui, elle, n'annule pas) qui en répond. Relancer
>    un dispatch sur la branche pour « rattraper » la preuve d'un lot fusionné ne
>    sert à rien et coûte la preuve du lot en cours.

Et `cancelled` est un troisième verdict, à ne confondre avec `success` ni avec `failure` : il ne dit RIEN du code. Une conclusion qu'on lit sans la regarder —
« ce n'est pas `failure`, donc ça va » — est exactement l'erreur que la leçon du
2026-11-05 nomme pour la création d'un dispatch, un cran plus loin.

### Dénouement mesuré (même nuit)

Le lot suivant (#16558, PR #16559) a reçu son dispatch sur `efbfa1f5a` : tentative
1 ROUGE sur cette même étape apt, sur DEUX tranches (1/3 et 2/3), tests `skipped`.
Une seule relance (`rerun-failed-jobs`, le maximum permis) a rendu la tentative 2
**VERTE — 26/26 jobs**, les trois tranches ayant cette fois joué leurs tests.
L'échec était donc bien le miroir, et non le code.

Deux points de méthode qui en sortent :

- **`rerun-failed-jobs` est refusé tant que le workflow tourne** (`403 This
  workflow is already running`) : la relance s'arme APRÈS la conclusion, elle ne
  se demande pas à chaud.
- **Un relevé pris sur un run INACHEVÉ n'est pas un verdict.** Le premier
  commentaire de cette PR affirmait « tranches 1/3 et 3/3 vertes » sur un compte
  pris quand la 1/3 était encore `in_progress` ; elle a échoué ensuite. La
  conclusion (« ce n'est pas le lot ») tenait, l'argument non — il annonçait deux
  tiers de couverture CI là où il n'y en avait qu'un tiers. Compter les jobs d'un
  run en cours est la même faute que lire un dispatch CRÉÉ comme un dispatch VERT,
  un cran plus bas.
