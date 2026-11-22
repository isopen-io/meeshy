## Un correctif garé pendant un dispatch se cherche sur la branche `-attente` avant d'être refait (#20327)

*2026-11-22, #20327, PR #20328.*

### Le motif

Une boucle de développement ne pousse rien sur une branche dont un dispatch
tourne encore : une poussée l'annulerait. Le passage qui trouve un rouge du lot
pendant qu'un autre workflow tourne écrit donc son correctif, et le GARE sur
une branche voisine, `<branche>-attente`, pour que le passage suivant le pose.

Le commentaire de la PR disait « Correctif prêt, `dd2ad3cd1` ». Le passage
suivant, dans un conteneur neuf, n'avait pas cet objet : `git cat-file`
rendait « Not a valid object name ». Il a refait le correctif à la main,
avec un texte de mesure un peu différent, avant de lister les branches
distantes et d'y trouver `claude/jeu-offrande-gardee-annoncee-attente`, qui le
portait déjà.

### La règle

- Un SHA cité dans un commentaire et absent du clone local se cherche d'abord
  sur les branches distantes : `git ls-remote origin 'refs/heads/<branche>*'`,
  puis `git fetch origin <branche>-attente`. Un conteneur neuf n'a que ce qui
  a été poussé.
- Le passage qui gare un correctif le DIT dans le commentaire, avec le nom de
  la branche garée et pas seulement le SHA.
- Le passage qui reprend part de la branche garée, y fusionne `dev`, et ne
  réécrit pas ce qu'elle porte.
