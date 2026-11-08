## Le dernier gate d'un lot est `dev` LUI-MÊME — « ma branche est seule sur ce fichier » se périme pendant que le lot se développe

*2026-11-08 — #17077*

### Ce qui s'est passé

J'ai cadré le lot J (#17077) contre `dev` vivant, vérifié qu'aucune branche
poussée n'écrivait `messages-list.ts`, développé, prouvé le rouge, poussé, et
armé la CI. Pendant ce temps, une autre session a découvert le MÊME site,
nommé la MÊME raison, écrit un témoin au MÊME chemin — et l'a fusionné dans
`dev` à 19 h 30, soit entre mon push et mon verdict de CI.

Les deux lots sont justes. Le second à arriver est du travail PERDU, et la
perte ne vient pas d'une négligence de cadrage : **le relevé était vrai quand
il a été fait.**

### La doctrine de collision ne couvrait pas ce cas

Elle tranche par asymétrie d'investissement — « quand deux lots se disputent un
fichier, celui qui n'a rien écrit cède ». Elle suppose deux branches VIVANTES
qui se voient. Ici, l'un des deux lots n'était plus une branche : il était
`dev`. Et contre `dev`, il n'y a rien à arbitrer — un lot fusionné a payé plus
qu'un lot qui attend un verdict de CI, et la résolution est totale, pas
négociée.

### La règle

**Refetch `dev` et chercher le SITE juste avant d'ouvrir la PR, pas seulement au
cadrage.** Le relevé de branches répond « qui écrit en ce moment ? » ; il ne
répond pas « qui a fini pendant que j'écrivais ? ». La fenêtre entre le push et
le merge est exactement celle que le relevé initial ne couvre pas, et c'est la
plus longue du lot quand la CI est gelée.

```bash
git fetch origin dev
git log origin/dev --since='6 hours ago' -S'<le symbole que je retire>' -- <mes fichiers>
```

Une ligne, et elle rend le commit jumeau par son CONTENU — pas par un titre
d'issue, qu'une découverte indépendante n'aura pas.

### Corollaire : céder, c'est résoudre vers `dev` EN ENTIER, pas garder « sa » moitié

La tentation est de conserver ce que sa version portait de mieux. Elle laisse
une jumelle divergente, c'est-à-dire la dette que le lot prétendait solder.
Après résolution, la mesure qui prouve qu'on a bien cédé est
`git diff origin/dev` VIDE sur le périmètre du lot.

Ce qui mérite d'être reporté se reporte alors comme un lot À LUI, avec sa
propre raison — ici le typage d'un double par SES paramètres, écrit pour un
cliquet de typecheck que les deux autres surfaces ne voient pas ; mesuré après
résolution, le témoin de `dev` ne porte pas le motif, donc il n'y avait rien à
reporter. **Le vérifier est le travail ; le supposer est ce qui crée la
jumelle.**
