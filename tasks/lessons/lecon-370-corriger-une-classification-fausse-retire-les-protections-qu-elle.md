## Leçon 370 — Corriger une classification FAUSSE retire les protections qu'elle assurait par effet de bord

Suite immédiate de la [leçon 369](#leçon-369). En faisant dériver la répartition
des portes du composer de `ComposerRailDoor.level` (#4561), j'ai corrigé une
classification mesurément fausse : `.place` était rangée `.object` alors qu'elle
ouvre le sélecteur de lieu de la PUBLICATION (`presentedPortal = .location`) et
ne pose rien sur la scène.

La correction est juste. Elle a cassé un témoin.

```
test_enMood_aucunePorteDObjet_nEstOfferte
  ("[description, mention, place]") is not equal to ("[description, mention]")
```

`ComposerRailDoor.offered` retire d'un format sans toile les portes de niveau
`.object` et `.scene`. Tant que `.place` était (mal) classée `.object`, elle
disparaissait du Mood **par ce chemin**. Or la planche `2k` l'exige
explicitement — « photo · caméra · lieu · micro — indisponibles en Mood » — pour
une raison qui n'a rien à voir avec la toile : *une humeur d'une heure ne dit pas
d'où elle est écrite*.

> **Une classification fausse peut assurer une protection juste.** Le retrait du
> lieu en Mood était correct, exigé par la planche, et tenait entièrement sur un
> effet de bord. Il n'était écrit nulle part — donc rien ne pouvait signaler
> qu'on le retirait.

### La question à poser

Avant de corriger une classification, une constante, un prédicat partagé :

> **Qu'est-ce que la valeur fausse produisait de JUSTE ?**

Elle n'est pas naturelle, parce qu'on corrige précisément ce qu'on a établi comme
faux — et le réflexe est de chercher ce que la correction *améliore*, pas ce
qu'elle *retire*. Le seul moyen fiable de répondre reste d'exécuter tout ce qui
lit la valeur, pas seulement ce qu'on croit concerné : ici, le témoin qui a
rougi n'interrogeait ni le rail, ni la répartition, ni le lieu — il interrogeait
le MOOD.

C'est le pendant de la [leçon 368](#leçon-368) du pair (« une règle générale doit
vérifier sa prémisse sur le site qu'elle modifie ») pris par l'autre bout :
368 regarde ce que la règle nouvelle SUPPOSE, 370 regarde ce que l'ancienne
GARANTISSAIT.

### Le correctif

Déclarer la protection à sa vraie place, avec sa vraie raison —
`removedFromStatus: Set<ComposerRailDoor> = [.place]`, doc-comment citant la
planche. Et écrire un témoin qui distingue les deux raisons :

```swift
XCTAssertFalse(mood.contains(.place))              // la protection tient
XCTAssertEqual(ComposerRailDoor.place.level, .publication)
XCTAssertFalse(ComposerRailDoor.place.level.appearsOnCanvas)  // …et PAS par la toile
```

Sans la seconde moitié, reclasser `.place` en `.object` rendrait le témoin vert en réintroduisant exactement le défaut corrigé : **un témoin qui vérifie un
RÉSULTAT sans vérifier par quel CHEMIN il est obtenu accepte la régression qu'il
existe pour interdire.**

### Post-scriptum : j'ai commis l'erreur EN LA CORRIGEANT

Une heure avant l'échec ci-dessus, en reclassant `.place`, j'avais écrit ce
témoin :

```swift
XCTAssertTrue(surUnStatus.contains(.place),
              "un statut n'a pas de toile, il a un lieu")
```

L'assertion est fausse, et la phrase qui la justifie l'est aussi. Je l'avais
**déduite du niveau** — « `.publication` ne dépend pas de la toile, donc la porte
survit » — au lieu d'aller lire ce que la planche dit du Mood. C'est
exactement le raisonnement que le lot corrigeait : conclure de la classification
à la conséquence, sans vérifier la conséquence.

Le témoin est resté vert pendant un tour, parce qu'il décrivait le code que je
venais d'écrire. Il n'a rougi qu'après avoir posé le retrait déclaré — c'est-à-dire
qu'un témoin faux a été contredit par le CORRECTIF, jamais par le défaut.

> **Un témoin écrit dans le même souffle que le code qu'il vérifie n'atteste que
> de leur accord.** Il faut une source EXTÉRIEURE — la planche, la spécification,
> l'écran — pour qu'il atteste de quelque chose. Ici, cinq lignes de la vue `2k`
> auraient suffi, et elles étaient dans le dépôt.
