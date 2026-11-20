# Un correctif sans témoin est un correctif qui se perdra — et c'est l'instrument qui le dit

*2026-11-20, cycle 194, #20091.*

## Le fait

J'ai resserré la clause d'une audience (`ensureGlobalConversationMembership`,
qui sert l'arrivée dans le salon GLOBAL), puis rejoué la mutation inverse pour
voir le cliquet rougir. **Il est resté VERT.**

Son `where` est une VARIABLE (`where: others`). Le discriminant du balayage est
TEXTUEL : il lit le littéral du `where`. Il n'y avait pas de littéral, donc rien
à juger — et le balayage **passait au suivant sans rien dire**. Le correctif
était bon, mesuré, et absolument non gardé : la première personne qui réécrit ce
site le reperd sans qu'aucun témoin tombe.

## La règle

> **Un lot ne se livre pas sur « le correctif est juste ». Il se livre sur « la
> mutation inverse fait tomber quelque chose ».** Et cela se VÉRIFIE, site par
> site — y compris quand un cliquet existe et qu'il couvre les voisins. Trois
> des quatre sites de ce lot étaient gardés ; le quatrième ne l'était pas, et
> rien dans le code ne le distinguait des trois autres.

## Les deux moitiés du remède

**1. Publier ce qu'on ne sait pas juger.** Le balayage rend désormais une
seconde liste — les lectures dont le `where` est une `variable`, un `appel`, un
`ternaire` ou est `absent` — et un témoin exige qu'elle soit non vide et bornée.

> « Zéro trouvé » et « zéro existe » ne sont pas la même affirmation (cycle
> 164). Un instrument qui écarte en silence ce qu'il ne sait pas résoudre
> publie une propriété de LUI-MÊME en la faisant passer pour une propriété du
> dépôt.

**2. Résoudre, étroitement.** Une variable déclarée par un `const` du MÊME
fichier se résout ; un import, un paramètre, un appel, non. L'étroitesse n'est
pas de la prudence décorative : elle garde à l'instrument la capacité de dire
« je n'ai pas pu juger ». Une résolution qui devine fabrique des verdicts au
lieu d'en publier l'absence.

## Le corollaire sur les CLÉS d'inventaire

Le cliquet clé ses lignes par `fichier#rang-de-la-requête`, pour la bonne raison :
une clé de LIGNE dérive à la première édition. Mais le RANG dérive quand
l'instrument change de vue — résoudre les variables a fait désigner par
`participants-reads.ts#0` une AUTRE requête que celle qui avait été classée.

> Aucune clé n'est stable sous les deux mutations ; celle par rang reste la
> bonne, le code changeant plus souvent que l'instrument. **Mais un lot qui
> touche le DISCRIMINANT doit reclasser l'inventaire entier, pas seulement
> l'étendre** — sinon les raisons écrites restent attachées à des sites qu'elles
> ne décrivent plus.
