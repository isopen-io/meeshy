## Un lot qui s'arrête à sa branche n'est pas livré — et il est INVISIBLE, pas « en attente » (cycle 192, #20050)

Le cycle 191 a livré les points 2 et 3 de #20020 : `scanLiveParticipants`
devient le site unique de la borne des participants vivants, quatre lectures le
rejoignent, un cliquet gèle les seize qui restent, un journal est écrit, et un
commentaire détaillé est posé sur l'issue — « points 2 et 3 LIVRÉS ».

**Aucune PR n'a été ouverte.** Mesuré au relevé du cycle suivant :
`git log origin/dev --grep "#20020"` ne rend que la mention du cycle 189, la
branche `claude/exciting-planck-cgf6zu` n'apparaît dans aucune PR ouverte ni
fermée, et `services/gateway/src/socketio/__tests__/live-audience-bound-sweep.test.ts`
n'existe pas dans `origin/dev`. Le travail était fini, vert, documenté — et
personne ne l'avait.

### Pourquoi c'est pire qu'un lot inachevé

Un lot inachevé se voit : l'issue est ouverte, le `Status` dit « In Progress »,
la branche est courte. Celui-ci portait les trois signaux du contraire :

- l'issue disait « livré », donc la session suivante le croit **et bâtit
  dessus** ;
- le journal existait, donc le lot avait l'air d'être passé par toutes ses
  étapes ;
- le cliquet d'inventaire nommait les seize sites restants **et la ligne que le
  lot venait de retirer** — un état du dépôt qui n'était vrai sur AUCUNE branche
  partagée.

La conséquence n'est pas hypothétique : le lot #20050 consiste précisément à
retirer une ligne de cet inventaire. Partir de `dev` aurait produit un cliquet
rouge sur un fichier absent, et le diagnostic aurait coûté un cycle.

### La règle

**Les étapes d'un lot ne sont pas « code → tests → journal → issue », mais
« … → PR → CI → FUSION → issue fermée ».** Les trois dernières ne sont pas de
l'administratif : ce sont les seules qui rendent le travail disponible à
quelqu'un d'autre. Un commentaire d'issue qui annonce une livraison sans nommer
un numéro de PR et un SHA de fusion annonce une INTENTION.

Corollaire pour la session qui reprend : **la première chose à faire avec le
développement précédent est de vérifier où il s'est arrêté, pas ce qu'il a
dit.** Trois commandes suffisent, et elles ne se déduisent pas du commentaire
d'issue :

```bash
git log origin/dev --oneline --grep "#<issue>"      # fusionné ?
gh pr list --head <branche> --state all             # une PR a-t-elle existé ?
git cat-file -e origin/dev:<un fichier du lot>      # dev le porte-t-il ?
```

Et la suite est de CONDUIRE ce lot-là jusqu'à la fusion avant d'écrire du neuf :
relire, fusionner `dev` dedans, rejouer les gates sur l'arbre fusionné, ouvrir
la PR. Écrire son propre lot à côté aurait laissé deux branches vivantes sur les
mêmes fichiers, c'est-à-dire exactement la collision que la doctrine de la
branche poussée tôt (#5243) cherche à éviter.

### Ce que cette session en a fait

Le travail du 191 a été fusionné dans la branche de la session (aucun conflit de
chemin avec les treize commits que `dev` avait pris entre-temps), remesuré
(34 suites, 603 témoins, `tsc` à 0, cliquets de taille verts), et poussé dans la
PR #20071 — qui porte les deux lots, celui du 191 et le #20050 du 192.
