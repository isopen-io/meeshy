## Un témoin dont le VERT dépend d'un VOISIN n'atteste pas ce qu'il nomme — et la seule mesure qui le trouve est de jouer chaque fichier SEUL

*(2026-11-21, #20272, cycle 210)*

### Le fait

`apps/web/src/routes/thread-sheets.test.tsx` § « la date de la fiche suit la
langue d'INTERFACE, jamais le Prisme du lecteur (#10817) » épinglait
`document.documentElement.lang = 'en'` et affirmait un rendu anglais, pendant
que son `beforeAll` ne chargeait que les catalogues **`fr`**. Joué seul, le
témoin ne tombe pas sur une assertion mais sur une EXCEPTION du catalogue :

```
error: Catalogue d'interface « en » lu avant d'être chargé (loadInterfaceCatalog).
      at translate (apps/web/src/lib/i18n-catalog.ts:126:15)
```

| commande | verdict |
|---|---|
| `bun test src/routes/thread-sheets.test.tsx` | **32 verts, 1 ROUGE** |
| le même, avec `src/components/message-detail-sheet.test.tsx` | **56 verts, 0 rouge** |

Le registre des catalogues est un état de MODULE, et `bun test` partage le
processus entre fichiers : le témoin passait parce qu'un VOISIN avait chargé
« en » avant lui. Vert en CI (la suite entière), rouge dès qu'on l'isole.

### La règle

C'est la famille « un témoin qui ne peut pas tomber » prise par l'autre bout :
le témoin PEUT tomber, mais ce qu'il atteste n'est pas ce qu'il nomme. Il ne dit
pas « la fiche suit la langue d'interface » ; il dit « la fiche suit la langue
d'interface, **si quelqu'un d'autre a chargé ce catalogue** ». Le jour où le
voisin change de langue de test, ce témoin rougit en nommant la fiche, et
l'enquête part du mauvais côté.

**La langue épinglée voyage avec SON catalogue, dans le même bloc** — jamais
dans un `beforeAll` qui charge une autre langue, et jamais en comptant sur la
suite. C'est la directive du 2026-11-15 (#18654, « un témoin lit son attendu
dans le catalogue de la langue courante ou ÉPINGLE la langue ») poussée d'un
cran : épingler la langue du DOCUMENT sans épingler le catalogue qui va avec
n'épingle rien.

### La mesure qui trouve la classe

Lire les fichiers ne suffit pas : un `beforeAll` qui charge `fr` à côté d'un
`lang = 'en'` n'est un défaut que si le témoin REND quelque chose qui traduit.
La mesure est mécanique — **jouer chaque fichier SEUL** :

> les 61 fichiers de `apps/web` qui épinglent `documentElement.lang`, joués un
> par un : **1 seul rouge**, celui-ci. La classe a UN membre.

C'est aussi ce qui a fait refuser le remède élégant : un helper
« pinner la langue + charger son catalogue » adopté dans 1 site sur 61
ajouterait une seconde façon de faire sans retirer la première. Le coût d'un
helper se juge sur la taille MESURÉE de la classe, pas sur l'élégance de la
forme.

### Et ce que le balayage a rendu en plus

`src/components/composer-sources.test.tsx` a rendu `1 fail` pendant le balayage
et quatre verts de suite au rejeu. Aucune cause nommable : consigné comme
observation non reproduite, pas en issue. Une intermittence qu'on ne sait pas
reproduire se DIT, elle ne se range pas.
