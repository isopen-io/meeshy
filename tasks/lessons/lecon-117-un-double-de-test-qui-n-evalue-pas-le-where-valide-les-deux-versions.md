## Leçon 117 — un double de test qui n'ÉVALUE pas le `where` valide les deux versions du code (2026-08-12, routine messaging, cycle 82)

Le défaut du cycle 82 a traversé des suites vertes pendant des mois parce que chaque test doublait
`participant.findFirst` par un `mockResolvedValue({ id })` constant : la garde juste et la garde
fausse rendaient le même participant. Le dépôt possédait DÉJÀ le remède —
`src/__tests__/helpers/mongo-where.ts` (`findFirstIn`), écrit pour le piège absent-vs-null — et son
en-tête dit la règle mieux que moi : « Un test qui compare la clause reçue à celle qu'il attend
passe aussi bien avec une clause juste qu'avec une clause fausse ».

1. **Chercher le helper AVANT d'écrire le double.** J'ai commencé par une fonction `clauseMatches`
   maison, avec un `if (key === 'bannedAt') return true` — une triche qui aurait masqué exactement la
   garde de bannissement que j'ajoutais. Le helper du dépôt, lui, distingue `null` d'absent et
   n'aurait rien laissé passer.
2. **Le corollaire côté fichiers de test EXISTANTS** : quatre doublaient le module `access-control`
   en ENTIER, donc rendaient `undefined` toute fonction nouvellement exportée. Le réflexe « ajouter
   la fonction au mock » aurait recréé le problème une couche plus loin ; `jest.requireActual` +
   override de la seule fonction voulue garde la règle réelle sous le test.
3. **Un test qui pinne une requête SUPPRIMÉE doit être réécrit, pas rafistolé.** `mark-unread`
   relisait deux fois le même participant ; un test verrouillait le second `null`. La bonne
   réécriture ne remplace pas l'assertion par une équivalente : elle affirme la nouvelle vérité —
   une seule résolution, et le refus tombe PLUS TÔT (`participant.findFirst` appelé une fois,
   `message.findFirst` jamais).
