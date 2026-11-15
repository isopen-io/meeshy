## Un cliquet qui LANCE un compilateur rougit sur une machine saturée — et son garde anti-vide accuse le contraire

*2026-11-08 — cycle 148*

### Ce qui s'est passé

`tsc-never-loaded-tests-ratchet` est le SEUL gate de types des fichiers de test
du gateway. Il ne lit pas un fichier : il **exécute**
`tsc -p tsconfig.test.json --noEmit` et compte les lignes d'erreur non muettes.

Il a rougi au milieu d'une passe complète, sur ce message :

```
✕ la commande voit bien un corpus substantiel — sinon une mesure vide passerait au vert
  Expected: > 1000
  Received:   0
```

Lu seul, c'est exactement le symptôme que ce garde existe pour attraper : une
sonde qui ne voit rien et qui passerait au vert à vide. J'ai cherché ce que mon
lot avait pu casser dans la configuration de typecheck.

**La cause était la machine.** Je faisais tourner la suite complète ET un second
`jest` en parallèle ; le `tsc` que ce cliquet lance a été étouffé et n'a rien
rendu. Relancé SEUL, le même témoin passe en **24 ms**.

### Ce que ça dit

> **Un cliquet qui lance un sous-processus mesure aussi la MACHINE.** Les autres
> lisent des fichiers et sont insensibles à la charge ; celui-ci dépend d'un
> compilateur qui a besoin de mémoire et de CPU, et il n'a aucun moyen de
> distinguer « zéro erreur de type » de « mon compilateur n'a pas tourné ».

Et le garde anti-vide, qui est la bonne idée, **ne sait pas nommer la bonne
cause** : il dit « la sonde ne voit rien », ce qui désigne la configuration ;
alors que la vérité était « la sonde n'a pas pu s'exécuter », ce qui désigne
l'environnement. Les deux rendent `Received: 0`.

C'est la règle du cycle 147 — « une mesure prise sur un arbre qu'on modifie ne
mesure rien » — avec une seconde moitié : **ni sur une machine qu'on sature.**

### À faire la prochaine fois

1. une passe complète tourne SEULE : ni second `jest`, ni build, ni compilateur
   lancé à la main à côté ;
2. devant un cliquet qui rend un compte NUL, la première question n'est pas
   « qu'ai-je cassé ? » mais **« ce cliquet lance-t-il quelque chose, et
   qu'est-ce qui tournait à côté ? »** — relancer SEUL avant d'ouvrir le
   moindre fichier ;
3. ne pas « réparer » un tel rouge en baissant le seuil du garde anti-vide :
   c'est le seul capteur qui empêche une mesure vide de passer au vert.
