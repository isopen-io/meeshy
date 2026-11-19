## Deux lectures CONCURRENTES ne peuvent pas porter une décision qui les précède

*2026-11-19, cycle 185 (#19835), relevé par l'audit adversarial du lot et mesuré
avant fusion. Famille : « un correctif de RÉSOLUTION se mesure comme une garde de
PROTECTION », « qu'est-ce qui part À CÔTÉ de ce que je viens de corriger ? ».*

### Ce qui s'est passé

Le lot remplaçait un `orderBy` par une règle d'ordre que Prisma ne sait pas
écrire — `max(lastMessageAt, lastActivityAt)` — en lisant **deux flux** et en
comparant leurs têtes. La preuve du top-K est juste, et elle était écrite au
site.

Le site appelant, lui, prenait DEUX décisions, pas une. `POST /conversations`
choisit d'abord un **RÉGIME** (le tête-à-tête chiffré d'abord, « n'importe
lequel » ensuite — #12966, #12949), et seulement ensuite le plus récemment
actif. La première rédaction a mis le rang DEHORS :

```ts
highestRankedConversation((orderBy) => firstFound(lookups, (where) => findFirst({ where, orderBy })))
```

Les deux flux étant lancés ensemble, **chacun refaisait la descente du régime
pour son compte**. Un tête-à-tête `e2ee` apparu entre les deux lectures suffisait
pour que l'un retombe sur « n'importe lequel » — donc sur le lisible — pendant
que l'autre trouvait le chiffré ; le rang, comparant les deux têtes, servait
**LE CLAIR**. C'est-à-dire exactement la bascule silencieuse vers le clair qu'une
décision porteur interdit.

### La règle

> **Une règle d'ordre lue par plusieurs requêtes CONCURRENTES ne porte aucune
> décision qui la précède.** Deux aller-retours ne sont pas un instantané : ce
> qu'une preuve démontre sur UN jeu de lignes, deux lectures parallèles ne le
> démontrent pas. Toute décision antérieure se résout DEHORS — une fois — et
> l'ordre ne départage qu'à l'intérieur de ce qu'elle a retenu.

L'inversion est l'affaire d'une ligne (`firstFound` dehors, le rang dedans), le
compte de requêtes est identique, et la garantie devient **structurelle** au lieu
d'être une affirmation de commentaire. Le commentaire fautif disait d'ailleurs la
bonne chose — « les deux flux parcourent les mêmes `lookups` dans le même ordre,
donc le chiffré gagne toujours » — vrai d'UNE lecture, faux de deux.

### Comment on l'attrape

La question ne se pose pas au résolveur, elle se pose à son APPELANT : **ce site
prend-il une autre décision que celle que je viens de paralléliser, et laquelle
vient d'abord ?** Elle se répond en lisant l'ordre des opérations du site, pas
celui du helper — le helper n'a aucun moyen de savoir ce qu'on a mis autour de
lui.

Et le témoin qui la garde exerce **les deux imbrications sur le même double** :
affirmer « c'est dans ce sens-là qu'il faut l'écrire » ne garde rien ; montrer ce
que l'autre sens produit garde les deux.

### Deux corollaires du même audit

**Un argument de COÛT se vérifie comme une affirmation.** La même rédaction
laissait une surface d'administration sur l'ancien tri en écrivant que filtrer
sur `max(a, b)` « ne s'écrit pas plus en `where` qu'en `orderBy` ». Faux :
`max(a, b) ≥ X ⟺ a ≥ X OU b ≥ X`, et le dépôt portait déjà cet `OR`. Seul
l'ORDRE est difficile. **Un défaut qu'on documente au lieu de le corriger doit
être défendu par une raison vraie** — sans quoi la décision écrite devient le
meilleur endroit pour cacher un défaut, puisqu'elle décourage la prochaine
lecture.

**Un flux dont le `where` ne borne rien dépense sa fenêtre entière.** Le flux
d'activité ne filtrait pas sur `{ lastActivityAt: { not: null } }` ; la colonne
étant absente de presque tous les documents, il rendait K lignes toutes à égalité
sur `null`, départagées par `id` — les K plus récemment CRÉÉES, qui ne peuvent
jamais gagner. Correct, et entièrement gaspillé. **Un flux de secours qui ne
restreint pas son `where` ne lit pas « un peu trop » : il lit tout autre chose.**
