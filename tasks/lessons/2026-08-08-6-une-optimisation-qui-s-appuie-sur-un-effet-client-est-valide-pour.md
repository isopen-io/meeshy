## 2026-08-08 (6) — Une optimisation qui s'appuie sur un effet client est valide POUR L'EFFET QU'ELLE NOMME, pas pour ses voisins

Le cycle 15 avait justifié l'absence de `conversation:updated` sur le chemin de lien par
« le handler web remonte lui-même la conversation depuis cet événement ». C'est exact. Le
cycle 16 avait déjà découvert que cette justification masquait un `lastMessageAt` serveur
périmé. Elle en masquait un second, d'une autre nature : le même handler **n'applique pas le
compteur de non-lus**, donc l'argument ne couvrait jamais `conversation:unread-updated` — il
n'a jamais prétendu le couvrir, mais sa présence en tête du docstring l'a fait lire comme un
solde de tout compte sur la synchronisation de la liste des conversations.

**Leçons :**
1. **Vérifier ce que le handler client fait, pas ce que son nom suggère.** `handleLinkMessageNew`
   « remonte la conversation » : il écrit `lastMessage` et `lastMessageAt`, réordonne, et
   s'arrête là. Trente lignes à lire. L'argument du docstring serveur était exact sur ces deux
   champs et muet sur tous les autres. Règle : une omission serveur justifiée par « le client
   le fait » doit citer le CHAMP que le client écrit, pas l'événement qu'il traite.
2. **Le badge de non-lus n'est pas un compteur périmé, c'est un compteur FAUX.** Distinction
   opérationnelle : une donnée périmée finit par converger et n'induit personne en erreur
   pendant ce temps. Ici la conversation saute visiblement en tête de liste avec un nouvel
   aperçu — le client AFFIRME donc qu'il s'est passé quelque chose — pendant que la pastille
   affirme le contraire. Deux signaux contradictoires dans le même composant valent moins
   qu'un seul signal absent. Prioriser sur ce critère, pas sur « la donnée est-elle correcte
   au refetch ».
3. **Deux copies qui ne diffèrent que par un PRÉDICAT sont l'annonce d'un défaut de plus.**
   `_isSender` (deux identités) contre `p.id !== senderId` (une seule) : chacune correcte chez
   elle, donc rien ne dépareille à la lecture d'un seul fichier — exactement le camouflage
   décrit au cycle 14 (#1). Quand la fusion doit choisir entre deux prédicats, vérifier si
   l'un DOMINE l'autre (ici : les espaces d'ObjectIds ne se recoupent jamais, donc le large est
   strictement équivalent au étroit là où l'étroit était correct). Alors ce n'est pas un
   compromis, c'est une preuve — et il faut l'écrire, sinon le prochain lecteur la reprendra
   pour de la prudence et rétrécira.
4. **Un repli qui ressemble à une précaution défensive peut être la fonctionnalité.**
   `ROOMS.user(participant.userId ?? participant.id)` se lit comme un garde-fou et se supprime
   au premier « nettoyage ». C'est en réalité la seule chose qui rend le chemin de lien
   servable : ses participants sont ANONYMES, sans `User.id`. Règle : tout `?? fallback` dont
   la branche droite est le cas NOMINAL d'un appelant doit être verrouillé par un test qui
   nomme cet appelant.
5. **Quatrième cycle consécutif sur la même racine — la règle du cycle 16 (#2) tient, mais elle
   arrive trop tard.** Elle dit d'auditer les `private` dont le docstring décrit une garantie
   produit. Ici l'une des deux copies n'était même pas dans une méthode : c'était un bloc
   inline de 20 lignes au milieu d'un `_broadcastNewMessage` de 200. Formulation élargie :
   **toute obligation destinataire qui n'a pas de nom appelable est inatteignable**, qu'elle
   soit `private` ou simplement non extraite. Le critère de repérage n'est pas le mot-clé,
   c'est « existe-t-il un identifiant qu'un autre écrivain peut appeler ? ».
