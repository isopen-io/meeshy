## Un suivi INSTRUIT atteste de son diagnostic, jamais de sa prescription (cycle 175, #19261)

Le dépôt sait déjà qu'**un suivi hérité est une AFFIRMATION** et se mesure avant
d'être recopié (cycle 107 : une symétrie LEXICALE prise pour une symétrie de
fond, trois cycles durant). #19261 était l'anti-cas exemplaire de cette leçon :
ouvert par le cycle 174 précisément PARCE QUE sa première rédaction disait « sans
conséquence mesurée » et que la mesure l'avait contredit. Scénario reproductible,
impact chiffré et borné, trois sites nommés, invariant tenu/rompu par chemin.

Son diagnostic était juste sur les trois sites. **Sa prescription était fausse
sur celui qui comptait.** Elle disait :

> Ancrer la fenêtre sur `lastDeliveredMessageCreatedAt`, avec repli sur
> `lastDeliveredAt` — et `prevDeliveredPosition` est **déjà calculé** sur le
> site.

Vrai de deux sites sur trois. Le troisième — la cascade « lu ⇒ remis » de
`markMessagesAsRead` — lisait son curseur en
`select: { lastReadAt, lastDeliveredAt }` : la colonne de position n'y était pas
chargée du tout. Y changer la variable passée aurait été un **no-op MUET**, et le
symptôme d'une projection trop étroite est qu'il n'y en a aucun (un double Prisma
rend ce qu'on lui dit quel que soit le `select`).

> **Une prescription est écrite depuis le site qu'on avait sous les yeux en
> diagnostiquant**, puis se généralise aux autres sans y être vérifiée. Ici le
> site observé était le mode EXACT, le seul où la variable existait déjà — et
> c'est lui qui a fourni la phrase « déjà calculé ». La question à poser à toute
> prescription héritée est celle de la leçon 261 : **vaut-elle de TOUS les sites
> qu'elle nomme, ou seulement de celui qui l'a suggérée ?**

Et la distinction est actionnable, pas rhétorique : un diagnostic se vérifie en
reproduisant le symptôme, une prescription en **ouvrant chaque site qu'elle
nomme**. Les deux vérifications n'ont ni le même coût ni le même moment, et seule
la première est faite d'habitude, parce que c'est elle qui décide si le lot vaut
la peine.

### Corollaire : la même ouverture peut RETIRER un site de la liste

Le site EXACT, troisième nommé par l'issue, s'est révélé **INERTE** :
`freezeMessageStatus` ignore `since` dès qu'une liste d'ids est nommée — la liste
ÉTANT la borne, et `since` n'ayant aucun autre usage dans la fonction. Il ne
portait donc aucun défaut vivant.

Il reçoit quand même la valeur juste, et c'est la règle du cycle 84 : **une
valeur fausse mais inexploitée est un piège armé, pas une économie.** Le jour où
ce paramètre compterait en mode exact, l'horloge murale serait de retour sans
qu'un témoin tombe.

> Ouvrir les sites d'une prescription ne sert pas seulement à en trouver un qui
> résiste : il arrive qu'un site nommé n'ait rien à réparer. **Un inventaire de
> sites porte, comme toute énumération, deux affirmations** — « la règle
> s'applique ici » et « il y a quelque chose à y faire » — et la seconde n'est
> presque jamais vérifiée (leçon 261, vue depuis l'autre bord).

### Ce que le lot en a tiré, et qui vaut au-delà

La lesson voisine — *une loi qui PUBLIE son `select` n'est appliquée que par les
consommateurs qui l'importent* (cycle 152) — pose que « le TYPE du paramètre est
l'autre moitié de la garde ». Ce lot en tire la forme forte : **les champs du
type doivent être REQUIS, pas optionnels.** Un paramètre
`{ a?: Date | null; b?: Date | null }` ne peut PAS faire rougir un appelant qui
n'a chargé que `a` ; `{ a: Date | null; b: Date | null }` le fait, et c'est
mesuré —

```
error TS2345: Argument of type '{ lastReadAt: Date; lastDeliveredAt: Date; }' is
not assignable to parameter of type 'DeliveryFloorCursor'.
```

Un module partagé **déplace** la discipline (il faut penser à l'appeler) ; un
type qui exige la lecture la **supprime**. Quand une règle a une forme de DONNÉE
— une projection, un jeu de colonnes, une carte — elle peut cesser d'être
retapable, et c'est le seul état où « une règle qu'il faut retaper à chaque site
est une règle qu'un site finira par ne pas avoir » cesse de s'appliquer.
---
