## 2026-11-17 — Une précondition de défaut s'écrit AVANT le témoin

*Routine messagerie temps réel, cycle 175, #19261.*

La leçon du cycle 174 dit qu'une mutation VERTE accuse le témoin : elle a
découvert, après coup, qu'un témoin n'exerçait qu'un cas trivial où la règle
juste et la règle fausse rendent le même verdict.

Le cycle 175 déplace la même question **en amont**, et c'est moins cher.

Le défaut de #19261 — la plage du gel ancrée sur une horloge au lieu d'une
position — n'est pas atteignable depuis un état quelconque :

| état du curseur | les deux ancrages |
|---|---|
| position et horloge **concordent** | rendent le **même** verdict ⇒ aucun témoin ne peut tomber |
| position et horloge **divergent** | se distinguent ⇒ le défaut existe |

Et la divergence a une CAUSE nommable : elle n'apparaît qu'après un préfixe
PARTIEL du périmètre exact, où un ack fige un sous-ensemble en poussant quand
même l'horloge à `now`.

Cette phrase a été écrite dans le commentaire d'allocation de l'issue **avant la
première ligne de test**, et chaque témoin construit la divergence
explicitement. La mutation est restée le CONTRÔLE ; elle a cessé d'être la
DÉCOUVERTE.

> **La question à se poser avant d'écrire un témoin n'est pas « quel cas
> exercer ? » mais « que doit-il être vrai de l'état pour que le défaut
> EXISTE ? »** — puis : est-ce que mon montage le rend vrai ?

Les deux leçons sont les deux moitiés d'une même discipline, et l'ordre compte :
la précondition écrite d'avance coûte une phrase, la mutation qui révèle son
absence coûte un lot déjà poussé.

### Corollaire — rendre une erreur INEXPRIMABLE vaut mieux que la rendre détectable

`tsc` a signalé que l'horloge (`prevDeliveredAt`) était devenue morte dans la
portée de la cascade. La retirer plutôt que la garder change la nature de la
garantie : le mauvais ancrage n'est plus *interdit par un témoin*, il n'est plus
**disponible**. Un lot futur ne peut pas l'écrire par inadvertance — il ne
compilerait pas.

Même famille que le type marqué `CursorDeliveredAt` de #18701, dont le
doc-comment le dit déjà : « passer `cursor.lastDeliveredAt` brut ne compile
pas ». C'est un cliquet de TYPE, pas un style.

**Et il faut noter ce qu'on perd**, sinon un relevé futur se trompera : la
mutation « la cascade repasse sur l'horloge » cesse d'être exprimable après ce
retrait. On la perd comme mutation **parce qu'on l'a gagnée comme
impossibilité** — un trou de couverture apparent qui est en réalité une
fermeture.

### Corollaire — un témoin ROUGE se lit, il ne se compte pas

Le témoin de la cascade appelait `markConversationAsRead`, un nom qu'**aucune
méthode du dépôt n'a jamais porté** (il venait d'un doc-comment de
`read-exactness.ts` ; `grep -rn` ne rend que cette citation). Il rougissait donc
— pour « is not a function », pas pour le défaut visé.

Dans un compte de suites, « 3 rouges » est identique dans les deux cas. Lire le
message l'a séparé en une seconde, et a rendu en prime une affirmation périmée à
corriger. **Un rouge dont on n'a pas lu la raison n'est pas une preuve de
ROUGE** : c'est la jumelle exacte de la mutation verte dont on n'a pas vérifié
qu'elle était appliquée.
