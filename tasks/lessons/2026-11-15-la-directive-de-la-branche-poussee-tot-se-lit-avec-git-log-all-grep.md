## La directive « pousser la branche tôt » n'a de valeur que si quelqu'un LIT le signal : `git log --all --grep="#<issue>"` avant d'écrire la première ligne

**Ce qui s'est passé.** Lot complet écrit pour #18615 — module de garde, témoin de
site, douze mutations une par une, journal, leçons, commit. Au `git fetch` de fin
d'intégration : une autre session avait livré la MÊME issue sur `dev` deux heures
plus tôt, avec un lot plus large et mieux arbitré. Travail intégralement jeté.

**Le signal était là, et il est là PAR CONSTRUCTION.** Le dépôt impose de pousser
un squelette ou un témoin rouge dans les quinze minutes, « avant d'écrire la
logique », précisément pour que les autres sessions le voient. L'autre session
avait obéi : `45d77e125 test(gateway/drain): témoins ROUGES — le plancher
d'historique relu au drain (Refs #18615)`, poussé avant que je commence. Une
commande le rendait :

```
git fetch --depth=50 origin dev && git log --all --oneline --grep="#18615"
```

**La directive est écrite pour les ÉMETTEURS, et je n'en lisais que cette moitié.**
J'ai poussé mes propres branches tôt, consciencieusement, pendant des cycles. Je
n'ai jamais fait la lecture symétrique. Un protocole d'annonce dont personne ne lit
les annonces ne réduit aucune fenêtre de collision — il la documente après coup.

**Et la liberté de forme ne prédit pas la collision ; l'ISSUE la prédit.** La
leçon 88 range les collisions du côté des tâches mécaniques, « où deux agents
lisant la même note n'ont aucun degré de liberté ». Celle-ci est l'inverse : deux
conceptions indépendantes d'une même garde, 646 lignes de témoins contre 210,
deux taxonomies de refus différentes. Rien dans la FORME ne rapprochait les deux
lots. Ce qui les a fait collisionner est qu'ils sont partis du même arriéré
d'issues ouvertes, et qu'un numéro d'issue est un espace de noms que personne
n'alloue.

**La règle.** Avant d'écrire la première ligne d'un lot, et pas seulement avant de
pousser : `fetch`, puis chercher le numéro d'issue dans TOUTES les références
(`--all`, pas la seule branche courante). Une branche vivante sur ce numéro ⇒ on
cède et on prend autre chose, sans négocier — c'est la règle d'asymétrie du
dépôt, et celui qui n'a rien écrit cède. Le `fetch` de fin d'intégration arrive
trop tard : à ce moment, tout est déjà payé.

**Corollaire sur ce qu'on fait du lot cédé.** Il n'est pas perdu s'il sert à
AUDITER celui qui a gagné : le contexte qu'on vient d'acquérir est exactement
celui qu'il faut pour muter ses gardes une par une. Ici le lot fusionné a tenu
(la garde retirée fait tomber 15 témoins sur 24), et il était plus juste que le
mien sur un point que mon journal défendait explicitement : un refus par
IGNORANCE est une PERTE, pas un refus prouvé, et il doit nommer sa conversation
pour envoyer le client relire. Mon lot les taisait tous les deux.

**Suite, le même jour : la vérification a servi, ET elle n'a pas suffi.** Lancée
sur l'arriéré, elle a correctement montré #18614 pris et #18616 libre. Une heure
plus tard, une autre session avait ouvert une PR sur #18616 — démarrée APRÈS ma
vérification. Le relevé réduit la FENÊTRE ; il ne la ferme pas, et la doctrine du
dépôt le dit déjà (« elle ne prétend pas supprimer la collision »).

Ce qui reste est la cause de fond, inchangée : **un numéro d'issue est un espace
de noms que personne n'alloue.** La réponse n'est pas un relevé plus fin, c'est
une ALLOCATION — et le dépôt en a déjà la primitive, atomique, visible de toute
session en un appel : **commenter l'issue avant d'écrire la première ligne.**
C'est la pratique que j'adopte, en plus du relevé : un commentaire « je prends,
session X » coûte un appel, se lit sans cloner, et transforme une course en
constat.

Et quand la collision survient quand même, l'arbitrage reste le même : **comparer
les deux lots, garder le meilleur, et céder sans négocier.** Les deux fois ici,
le lot d'en face était meilleur sur un point précis que mon propre journal
défendait — la seconde fois, sa projection de capacité déclarait la signature
RÉELLE (`{ sealAtRest }` compris) là où la mienne en perdait le troisième
paramètre : assignable au compilateur, donc un piège armé qu'aucun témoin
n'aurait fait rougir. Céder n'est pas perdre le lot : c'est l'échanger contre la
lecture adverse de son propre défaut.

**Et une troisième fois, sur la PREUVE cette fois.** Le dépôt a déjà la leçon
« un push juste après un autre annule le run CI du premier » (groupe de
concurrence). Je l'ai rejouée en `workflow_dispatch` : trois dispatches
successifs sur la même branche, chacun annulant le précédent, donc **aucune
preuve avant le dernier**. Ce n'est pas une leçon neuve, c'est la même appliquée
à un déclencheur que je ne rangeais pas sous « push ».

La règle se relit donc sans mentionner le verbe : **sur une branche, un second
déclenchement annule le premier, quel qu'il soit.** On dispatche UNE fois, après
le dernier commit du lot, et on attend — relancer « pour être sûr » retarde
exactement ce qu'on cherche à obtenir.
