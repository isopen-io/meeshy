## Un commentaire juste peut décrire un site qui ne l'est pas

*2026-11-15, cycle 165 — #18613.*

**Le fait.** `editedAudience.ts` porte cette phrase, posée par le lot qui a
gardé `message:edited` :

> « Il s'autorise sur l'admission de lecture de FICHIER (actif, non banni, lien
> non échu), qui **ne regarde NI `joinedAt` NI `historyVisibleFrom` : elle ne
> dispense pas du plancher**. »

Elle est exacte. Elle est au bon endroit. Et elle décrit, mot pour mot, le
défaut resté ouvert un fichier plus loin : `emitAttachmentUpdated` s'autorisait
sur cette MÊME admission (`ADMITTED_FILE_READER_WHERE`) pour servir la
transcription d'un vocal, sans jamais lire le plancher.

Le dépôt connaissait la règle, l'avait écrite, et l'avait écrite à propos de la
porte exacte dont le site fautif s'autorisait.

**Pourquoi ça ne se voit pas.** Le dépôt a déjà plusieurs leçons sur les
commentaires FAUX — celui qui énonce une contrainte de schéma inexistante
(cycle 94), celui qui nomme un consommateur disparu (cycle 161), celui qui
déclare une impossibilité périmée (cycle 104). Toutes disent : **vérifier
l'affirmation**.

Celle-ci est l'inverse, et elle échappe à cette consigne. L'affirmation est
VRAIE. La vérifier ne produit rien. Ce qu'elle ne fait pas, c'est **pointer** :
elle décrit une propriété d'une porte, à l'endroit d'un seul de ses usagers, et
rien ne dit combien d'autres s'autorisent sur la même porte.

C'est « cette entité a-t-elle une JUMELLE ? » (cycle 85) vu depuis le
commentaire plutôt que depuis le code — avec le commentaire du **bon** côté
cette fois, ce qui le rend moins utile, pas plus : un commentaire faux finit par
gêner quelqu'un, un commentaire juste et local ne gêne personne.

**La règle.** Devant une phrase de la forme « cette porte ne garantit pas X », la
question n'est pas *« est-ce exact ? »* mais **« qui d'autre s'autorise sur cette
porte ? »**. Et elle est OUTILLÉE, comme la forme du cycle 123 bis (« compter les
appelants du helper ») : la porte a un nom, donc la réponse est un `grep` sur ce
nom, pas une intuition.

```
grep -rn ADMITTED_FILE_READER_WHERE services/gateway/src --include=*.ts
```

**Le corollaire, pour qui écrit la phrase.** Le lot qui DÉCOUVRE qu'une porte ne
garantit pas X vient de produire la connaissance la plus chère du dépôt sur
cette porte. L'écrire chez son propre appelant la perd pour les autres. Elle va
**chez la porte** — dans le doc-comment de `ADMITTED_FILE_READER_WHERE`, où tout
nouvel usager la lit — et l'appelant s'y réfère. Une règle qui doit être
retrouvée à chaque site est une règle qu'un site finira par ne pas avoir.
