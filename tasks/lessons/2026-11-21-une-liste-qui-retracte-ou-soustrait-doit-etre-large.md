## Une liste qui ACCORDE doit être étroite ; une liste qui RETRACTE ou qui SOUSTRAIT doit être large

**2026-11-21 · cycle 202 · #20103** (suivi de #20100, #20110, #20136)

Dix projections `Conversation.participants` **sans aucun `where`** attendaient
un verdict. La tentation était d'en faire un balayage : « une projection de
participation sans loi est un défaut, resserrer les dix ». Mesurées une par
une, **deux seulement étaient des défauts, et resserrer les huit autres aurait
créé des bugs pires que celui qu'on corrige.**

**La largeur juste d'une liste ne se lit pas sur sa projection : elle se lit
sur ce que la liste SERT.**

- Elle **ACCORDE** quelque chose (une audience qui reçoit du CONTENU, un droit,
  une admission qui ÉCRIT) ⇒ étroite. `broadcastConversationUpdated` porte le
  titre, la description, l'avatar : un membre actif-et-banni n'y a pas droit.
- Elle **RETRACTE** (`conversation:closed`, `conversation:obsoleted` : aucun
  contenu, juste « cette ligne est terminée ») ⇒ large. Un banni garde le fil
  dans sa liste, les clients la persistent, et seul cet événement la lui
  retire. Resserrer échange une fuite inexistante contre un fil fantôme.
- Elle **SOUSTRAIT** (l'ensemble des opt-out qu'on retire d'un relevé
  d'accusés) ⇒ large. Resserrer ferait l'inverse d'une garde : le banni
  sortirait des opt-out et son horodatage de lecture REPARAÎTRAIT.
- Elle ne sert ni l'un ni l'autre (lecture d'IDENTITÉ : « quelle est MA ligne,
  laquelle est celle du créateur ») ⇒ la question ne se pose pas, et resserrer
  la ferait échouer sur sa propre question.

> **La question à poser à une projection de participation n'est pas « la loi
> est-elle appliquée ? » mais « qu'est-ce que cette liste fait à celui qu'elle
> contient ? »** — et pour une audience, « que transporte la charge ? ». C'est
> la leçon 275 (une protection se mesure sur tout ce que la charge TRANSPORTE)
> retournée : la MÊME charge, selon qu'elle donne ou qu'elle reprend, veut deux
> audiences opposées.

Trois corollaires de méthode, tous payés dans ce lot :

1. **Un défaut et sa décision inverse vivent souvent dans le même fichier, à
   quelques lignes l'un de l'autre** — la route souveraine appelle
   `broadcastConversationUpdated` (à resserrer) puis `announceConversationClosed`
   (à laisser large) sur la MÊME liste. Un correctif qui balaie par motif les
   aurait traités pareil.
2. **La garde qui tient est celle que le compilateur porte.** Exiger `bannedAt`
   dans la SIGNATURE de l'unité a nommé, en une compilation, le seul appelant
   dont la projection omettait la colonne. Un prédicat jugé après lecture ne
   vaut que ce que la lecture a demandé, et `undefined == null` est vrai : la
   relecture humaine des projections ne peut pas être le filet.
3. **Une décision « large, délibérément » répétée à N sites est une divergence
   à N-1 sites, et un témoin qui RETIENT est le seul moyen de la défendre.**
   `audienceDeRetractation` existe pour cela, et son témoin « RETIENT un membre
   actif-et-banni » est ce qui arrêtera le prochain balayage bien intentionné.
