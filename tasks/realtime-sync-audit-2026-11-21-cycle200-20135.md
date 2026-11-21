## Cycle 200 — un modérateur banni n'administre plus les liens de partage (#20135)

**Date** : 2026-11-21. **Base** : `dev` à `79b8991bf`. **Issue** : #20135
(ouverte par le cycle 197). **Milestone** : #286.

### Le défaut

`loadShareLinkForManagement` chargeait les membres sous la clause NUE
(`where: { userId, isActive: true }`) puis en tirait `isConversationAdmin`. Un
modérateur actif-et-banni pouvait donc révoquer, réactiver, prolonger ou
replafonner les liens de partage d'une conversation qu'il ne peut plus lire.

Une seule lecture sert les TROIS routes depuis #4170 — `PATCH /links/:linkId`,
`/toggle`, `/extend` — donc un seul correctif les couvre, et les témoins les
parcourent toutes.

### Deux vérifications qui ne se supposent pas

**1. Le piège du cycle 199 ne s'applique PAS ici.** Cette lecture emploie un
`include`, pas un `select` : toutes les colonnes scalaires reviennent, `bannedAt`
est présent sans qu'on l'ajoute, et c'est la CLAUSE qui retient la ligne. Venant
d'un lot où la projection était tout l'enjeu, la tentation était de reporter le
même correctif ; il n'avait pas lieu d'être.

**2. Ce site n'est vu par AUCUN cliquet**, mesuré par une sonde jetable :

```
BARE 89      ← inchangé par ce lot
MGMT []      ← aucun site relevé pour ce fichier
UNJ  []      ← rien de publié comme illisible
```

La cause est le discriminant, et elle est délibérée : #20100 a fait qu'une
clause désignant une PERSONNE ne compte pas comme audience — une audience est un
ENSEMBLE. Juste pour ce que le cliquet mesure, et la conséquence est que **toute
porte qui résout l'appelant par son propre `userId` est hors de sa portée par
construction** — c'est-à-dire la forme exacte de #20104, #20135 et #20136.

> Le cliquet garde les AUDIENCES ; personne ne garde les PORTES. La lacune est
> devenue l'issue **#20155**, avec ses trois difficultés instruites d'avance
> (« alimente une autorisation » n'est pas lisible par une regex, certaines
> portes doivent rester larges, et le grain doit désigner la LECTURE).

### Le ROUGE, et la leçon de proportion

| mutation | témoins rouges |
|---|---|
| clause NUE (l'état d'avant) | **3** — un par route |
| `bannedAt: null` au lieu d'`unsetOrNull` | **15** |

La seconde ligne mérite d'être lue : l'erreur SYMÉTRIQUE emporte quinze témoins,
dont tous les préexistants de #4007 et #3941. La colonne étant ABSENTE du
document d'un participant jamais banni, cette forme ferme les trois routes à
TOUTE la population. **Elle n'est pas subtile, elle est catastrophique** — et
c'est une bonne nouvelle : un dépôt qui l'écrirait par accident le saurait
immédiatement, ce qui n'était pas vrai des lots précédents où elle ne faisait
tomber qu'un témoin.

### Une frontière dite par un témoin

Le CRÉATEUR d'un lien garde son droit même banni de la conversation :
`isCreator` ne lit pas la participation, et la route dérive les deux qualités
SÉPARÉMENT. Même arbitrage que le créateur d'un groupe, cherché sur le
sur-ensemble (#20100) — et un témoin le fige, pour qu'un lot futur ne le
resserre pas « par symétrie ».
