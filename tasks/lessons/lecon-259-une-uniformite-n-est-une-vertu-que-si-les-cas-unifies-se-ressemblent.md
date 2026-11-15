## Leçon 259 — une uniformité n'est une vertu que si les cas unifiés se ressemblent par ce qui COMPTE

Cycle 117. `/sync` tenait son watermark à `since` sur une page TRONQUÉE — avec le
commentaire qui l'énonce : « un client qui adopterait ce checkpoint perdrait tout
l'arriéré d'un coup, définitivement ». Il l'AVANÇAIT sur les deux réponses qui ne
livrent RIEN : le chemin de gap (la requête est court-circuitée) et la demande
sans aucune collection.

Une couverture PARTIELLE retenait le watermark ; une couverture NULLE l'avançait.
Le chemin de gap est pourtant le maximum exact du cas que la première règle
protège.

Ce qui a permis l'inversion tient dans le nom du témoin qui la gelait, à vingt
lignes du témoin qui gèle la règle contraire :

```ts
it('applies the same watermark on the gap path, which returns no items at all', …)
```

« the same watermark » présente l'uniformité comme une garantie. Mais les deux cas
n'étaient unifiés que par `hasMore: false` — un critère de FORME — alors que ce qui
gouverne le watermark est la COUVERTURE, et sur ce critère-là ils sont opposés.

> Devant une uniformité revendiquée, la question n'est pas « les cas sont-ils
> traités pareil ? » mais **« se ressemblent-ils sur la propriété que ce
> traitement décide ? »**.

C'est la Leçon 256 (« un témoin qui nomme correctement la moitié qu'il garde GÈLE
l'autre ») avec une variante plus retorse : cet intitulé-ci NOMME le fait gênant
— « which returns no items at all » — et l'énonce comme une garantie. Devant un
intitulé de témoin qui décrit une réponse VIDE, la question est : *et c'est bien ?*

### Corollaire — une règle écrite en NÉGATIF est en retard par construction

`hasMore ? sinceDate : checkpoint` est une liste de refus, à laquelle il faut
penser à ajouter une ligne. Son retard ne ressemble pas à une erreur : il
ressemble à du code qui passe. La réécrire en POSITIF sous un nom qui porte
l'invariant — `coveredTheWindow = !hasMore && !hasGap && servedSomething` — met la
question à l'endroit où elle se pose, et oblige la prochaine façon de ne rien
couvrir à s'y ajouter.

### Corollaire — une INSTRUCTION dans la réponse ne rattrape pas une donnée fausse dans la même réponse

L'objection était « le client est prévenu, `gapAction: 'full_resync_required'` ».
Elle ne tient pas : une réponse ne peut pas dépendre de ce que son destinataire en
fera pour rester sûre. La resync peut être différée, échouer hors ligne, ou n'être
lue par personne — et dans les trois cas le watermark a déjà avancé, puisqu'il
voyageait dans la même charge utile. Même famille que « le gate s'applique à la
SOURCE, jamais au sérialiseur » : ici la source est la VALEUR, et l'instruction
est le sérialiseur.

### Corollaire de méthode — un lot de témoins tous ROUGES ne prouve pas le bon correctif

Trois témoins neufs rouges disaient « tiens le watermark ». Le correctif trivial
qui les satisfait tous est « ne l'avance jamais » — et il casse le produit en
silence, le client relisant la même fenêtre indéfiniment. C'est le témoin
NÉGATIF, vert AVANT le correctif (« une page complète, servie, sans gap, avance
quand même »), qui interdit cette sortie. **Un lot qui resserre une condition
écrit dans le même train le témoin qui interdit de la resserrer trop.**

Et chaque clause d'une conjonction se prouve PORTANTE une par une, par mutation :
retirer `!hasGap` → 2 témoins tombent, `servedSomething` → 1, `!hasMore` → 3.
Sans cette mesure, une clause décorative se lit exactement comme une clause utile.

---
