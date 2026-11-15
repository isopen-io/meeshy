## Leçon 253 — un RED intentionnel qui survit à son lot cesse d'être un marqueur

Train d'intégration beta du 2026-08-23. `main` portait un témoin ADVERSAIRE
rouge en permanence : `messages-list-forward-source-attachment-url-leak`. Le
commit qui l'a posé l'annonce dans son propre sujet — « socle posé, FUITE ENCORE
OUVERTE » — et son corps énumère huit points restés ouverts. Le rouge était donc
DÉLIBÉRÉ, honnête, et documenté.

Il était aussi, en pratique, invisible. « Test gateway » était rouge sur `main`
depuis assez longtemps pour que le rouge soit devenu la couleur normale du job.
Quand une seconde suite s'y est ajoutée — une bombe à retardement de 24 h,
étrangère — le job a affiché **deux** échecs au lieu d'un, et personne ne l'a vu :
on lisait « Test gateway rouge », ce qu'on lisait déjà la veille.

> **Un test laissé rouge à dessein est une alarme qu'on apprend à ignorer, donc
> une protection déjà morte.** Il ne protège plus le défaut qu'il décrit, et il
> masque tout défaut qui atterrit dans le même job. Le coût n'est pas le sien :
> c'est celui du PROCHAIN rouge, qui se noiera dedans.

Trois façons de tenir un défaut connu sans payer ce prix, par ordre de
préférence : le FERMER (ici, une trentaine de lignes) ; le marquer `it.failing`,
qui rougit si le défaut disparaît sans que le témoin bouge ; ou le sortir du job
bloquant vers un rapport à part. Le laisser vert-par-omission n'est pas dans la
liste.

### Le corollaire, mesuré le même jour

Quatre PR ouvertes corrigeaient la MÊME bombe de 24 h, de quatre façons
concurrentes : trois patchaient chaque site d'appel, une seule corrigeait la
fabrique. Quatre sessions ont diagnostiqué le même rouge en parallèle parce
qu'aucune ne pouvait savoir qu'une autre s'en occupait — le rouge partagé de
`main` est un aimant à travail dupliqué. La fusion a retenu la correction de la
fabrique ; les trois rustines par site auraient chacune passé les tests.
