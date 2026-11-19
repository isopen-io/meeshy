## Un commentaire qui promet un ORDRE est une affirmation — et il survit au jour où le mot change de sens

*2026-11-19, cycle 185 (#19835, #19834). Famille : « un tri est une AFFIRMATION,
et se vérifie comme telle » (cycle 86 bis), « un commentaire qui ÉNONCE une
contrainte de schéma est une AFFIRMATION » (cycle 94).*

### Ce qui s'est passé

Quatre surfaces de la passerelle promettaient, **dans leur propre
doc-comment**, « la plus récemment ACTIVE » — et toutes les quatre écrivaient
`orderBy: { lastMessageAt: 'desc' }`. L'une ajoutait même la conséquence :
« sinon l'utilisateur retombe sur une DM morte ».

Aucune n'était fausse à sa rédaction : avant #9026 (2026-10-01), « actif » et
« dernier message » étaient la même chose. La directive a redéfini le mot — le
rang d'une conversation est `max(lastMessageAt, lastActivityAt)` — et les quatre
commentaires sont devenus des promesses que leur code ne tenait plus, **sans
qu'une ligne change**.

Puis #19800 a rendu la divergence atteignable (`lastActivityAt` n'était écrite
par aucun chemin jusque-là). Entre les deux, la faute était en place et
indétectable : les témoins ne pouvaient pas tomber.

### La règle

> **Quand une directive redéfinit un mot, les commentaires qui l'emploient
> deviennent des affirmations à remesurer.** Un commentaire ne rougit jamais. Il
> ne devient pas faux par une édition qu'on pourrait relire en diff : il le
> devient par un changement de SENS décidé ailleurs, et il continue de se lire
> comme une description du code qu'il surplombe.

Corollaire de méthode, et c'est lui qui trouve les sites : **le lot qui redéfinit
un mot cherche les sites qui l'EMPLOIENT, pas ceux qu'il modifie.** #9026 a
changé la liste et s'est arrêté là ; chercher « récemment actif » dans les
commentaires aurait rendu les quatre surfaces le jour même.

C'est la forme douce du cycle 107 bis (« un lot peut rendre un contournement
INUTILE sans le faire disparaître ») : ici, un lot rend quatre commentaires FAUX
sans les toucher.

### Deux corollaires mesurés dans le même lot

**Une énumération de sites porte deux affirmations, et la seconde se remesure.**
#19835 nommait cinq sites plus « deux autres surfaces d'administration » ; le
balayage en rend huit. Celle qui manquait à l'énumération — `talkieFallback.ts` —
était précisément celle qui avait sa propre issue (#19834), donc celle qu'on
aurait cru la mieux connue. (Leçon 261, encore.)

**Une question étiquetée « décision produit » peut avoir déjà été répondue par
les clients.** #19834 proposait trois issues et concluait « c'est une question
produit ». Mesuré : deux des trois implémentations lisaient DÉJÀ le rang (web et
Android), et une directive porteur définissait le mot. Il ne restait aucune
question — seulement un serveur à aligner. Devant une telle étiquette, compter
les sites et relire la directive AVANT de la renvoyer au porteur : poser une
question dont la réponse est déjà écrite coûte un cycle.

### Et le piège du correctif n'était pas l'ordre, c'était le `select`

Trier sur le rang impose de lire DEUX colonnes. Une lecture qui en oublie une
rend un rang réduit au dernier message — **le défaut qu'on vient de corriger,
rejoué sous le correctif** — et aucun double de test ne peut le voir : un double
rend ce qu'on lui dit, quel que soit le `select`.

La garde n'est donc pas un témoin, c'est un TYPE : les colonnes du rang sont
requises dans le type de retour du lecteur, et le type que Prisma dérive d'un
`select` partiel n'y est pas assignable (`TS2322`, mesuré). **Quand une règle
dépend de ce qu'une requête RAMÈNE, la placer dans le type de ce qu'elle rend est
la seule garde qu'un double ne peut pas contourner.**
