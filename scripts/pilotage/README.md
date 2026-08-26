# Pilotage — page « Avancement Meeshy »

Une page statique, générée depuis GitHub, qui montre l'avancement du projet
« Meeshy — pilotage » : pourcentage global, avancement par horizon (version cible)
et par milestone, rythme de livraison par jour / semaine / mois / trimestre /
semestre / année, courbe de livraison cumulée face au périmètre.

Publiée sur https://isopen-io.github.io/meeshy/ par `.github/workflows/pilotage-pages.yml`
(toutes les 6 h, à chaque issue fermée / rouverte / (dé)jalonnée, à chaque milestone
modifié, à la demande). **L'issue GitHub fait foi** : la page est une projection, jamais une source.

| Fichier | Rôle |
|---|---|
| `fetch.py` | extrait les items du projet (GraphQL) ou, à défaut, les issues (REST) + les milestones → `data.json` |
| `compute.mjs` | le calcul : granularités, tallies, buckets, statistiques de période, états d'échéance (testé) |
| `template.html` | la page ; `__COMPUTE__` reçoit `compute.mjs`, `__DATA__` reçoit `data.json` |
| `build.py` | assemble une page autonome (aucune requête réseau à l'affichage) |
| `compute.test.mjs`, `test_pilotage.py` | tests de comportement, joués en CI avant tout déploiement |

## Localement

```bash
gh auth refresh -s project,read:project      # une fois : lecture du projet d'organisation
python3 scripts/pilotage/fetch.py site/data.json
python3 scripts/pilotage/build.py --data site/data.json --out site/index.html
node --test scripts/pilotage/compute.test.mjs
(cd scripts/pilotage && python3 -m unittest -q test_pilotage)
```

## Le secret `PILOTAGE_TOKEN`

Le `GITHUB_TOKEN` des Actions ne lit pas les projets d'organisation. Sans secret, la page
se génère en **mode dégradé** (Status dérivé de l'état de l'issue, horizon = échéance) et le
signale. Pour le mode nominal : un jeton fine-grained (organisation `isopen-io` → Projects :
lecture ; dépôt `meeshy` → Issues : lecture) ou classique (`read:project`, `repo`), posé en
secret `PILOTAGE_TOKEN` du dépôt.
