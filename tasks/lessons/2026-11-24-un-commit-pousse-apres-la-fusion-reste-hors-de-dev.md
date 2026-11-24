## 2026-11-24 — Un commit poussé sur une branche après la fusion de sa PR reste hors de `dev` (#20512, #20520)

### Ce qui s'est passé

La tranche 1 de l'objectif de Flamme (#20512) a été fusionnée par la PR #20513, et
l'issue a été close avec « tranche 1 livrée ». Une correction de la loi (un objectif
choisi au premier jour ne voyait pas une Flamme repartie à 1) avait été poussée sur une
branche voisine, `claude/jeu-objectif-de-flamme-chute`, sans PR : `dev` ne l'a jamais
reçue. La passe suivante l'a trouvée par `compare/dev...<branche>` (« ahead 1 »).

### Pourquoi

Une PR fusionnée ne suit plus sa branche : ce qui arrive ensuite n'a plus de chemin vers
`dev`. Une branche sœur sans PR n'en a jamais eu. Le commentaire de clôture décrivait la
PR, pas la loi telle qu'elle était sur `dev`.

### La règle

- Avant d'écrire « livré », relire `gh api repos/<o>/<r>/compare/dev...<branche>` pour
  CHAQUE branche du lot (et ses sœurs `-<suffixe>`) : `ahead_by` doit valoir 0.
- Une branche `claude/jeu-*` en avance sur `dev` sans PR ouverte est un travail à
  reprendre : la passe suivante la fusionne dans son prochain lot, et le dit dans la PR.
