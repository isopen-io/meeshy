## Leçon 233 — un durcissement posé sur UNE des deux portes jumelles n'est pas une correction, et seule une garde de PARITÉ le dit (2026-08-18, routine messagerie, cycle 65)

`AuthHandler` a deux portes qui font le même geste : rejoindre les rooms de
conversation avant d'inscrire la socket dans `connectedUsers`. La porte inscrite
(JWT) a reçu, dans un cycle antérieur, un réessai borné —
`_joinConversationRoomsWithRetry` — avec le commentaire qui en donne la raison :
« a failed-and-un-retried join is silent message loss ». La porte invitée (lien
partagé), dans la même classe, à quatre-vingts lignes de là, appelait toujours un
`socket.join` nu.

C'est la Leçon 225 dans l'autre sens. Là, une dérogation manquait sur un membre
d'une paire ; ici, c'est un DURCISSEMENT qui n'a été posé que d'un côté. Le
symptôme est le même et le réflexe qui le rate aussi : on lit le mécanisme, on
voit qu'il existe, et on coche « traité » sans compter ses appelants. **Un
mécanisme de sûreté présent dans un fichier n'est pas un mécanisme appliqué :
compter ses SITES D'APPEL contre le nombre de chemins qui en ont besoin.**

### Ce qui rendait l'écart pire que la moyenne : l'asymétrie penchait contre la sévérité

Le réflexe, devant deux portes, est de supposer que la plus riche mérite le plus
de soin. C'était l'inverse. Un inscrit qui perd une room sur trente perd une
FRACTION de sa livraison ; un invité de lien partagé n'a qu'UNE conversation, où
la même panne vaut la TOTALITÉ de son temps réel pour toute la session. La porte
qui avait le plus besoin du réessai était la seule à ne pas l'avoir.

Corollaire à chercher ailleurs : quand deux chemins traitent N objets et 1 objet,
le chemin à 1 objet n'est pas le cas facile — c'est celui où une panne unitaire
n'a aucune redondance pour l'absorber.

### Le point de fond : s'inscrire comme connecté n'est pas un acte NEUTRE

Ce qui transforme un accroc d'adaptateur en perte est que la porte de livraison
(`connectedUsers.has(clé)`, `offlineParticipantQueue.ts`) traite « inscrit »
comme « joignable ». S'inscrire **désarme la file hors ligne**. Une socket qui a
raté sa room et s'inscrit quand même coupe les DEUX chemins du même geste : pas
d'émission vivante (absente de la room), pas d'entrée en file (crue en ligne), et
donc pas de rejeu ultérieur — rien n'a été enfilé à rejouer.

À généraliser : avant d'écrire un état « prêt / connecté / enregistré », demander
ce que cet état DÉSACTIVE en aval. Un drapeau qui n'active que des choses peut
être posé optimistement ; un drapeau qui éteint un filet de sécurité doit être
posé sur preuve, jamais sur intention.

### La garde : elle doit porter sur la RELATION, pas sur la valeur

Deux témoins « la porte invitée réessaie » et « le réessai est borné » décrivent
fidèlement le correctif — et resteraient VERTS si un cycle futur portait la porte
inscrite à cinq tentatives en laissant l'invitée à trois. C'est-à-dire sous la
récidive exacte du dossier, qui n'est pas « il manque un réessai » mais **« un
réessai n'a été ajouté que d'un côté »**. La garde livrée ne nomme donc aucun
nombre : elle fait rejeter la même room sur les deux portes et compare les
tentatives entre elles. Elle tombe dès qu'elles divergent, dans un sens comme
dans l'autre.

Même famille que la Leçon 231 et que le cycle 64 : **quand le défaut est un
ÉCART, le témoin doit mesurer l'écart.** Un témoin qui fixe la bonne valeur d'un
seul côté re-gèle la moitié du problème qu'il prétend garder. Le ROUGE l'a
d'ailleurs affiché en clair — `Expected: 3` (porte inscrite), `Received: 1`
(porte invitée) : la garde de parité ne s'écrit pas seulement pour l'avenir, elle
CHIFFRE le défaut au présent.

### Trouvé en passant, même famille : « joint, jamais adressé »

L'inventaire des adhésions a rendu `conversation:any` — rejointe à chaque
connexion inscrite, jamais visée par une émission, à AUCUN commit de
l'historique. Le cycle 64 avait retiré la symétrique (« émis, jamais écouté »).
Les deux se trouvent de la même façon et pour un coût de recherche quasi nul :
**pour chaque nom de room ou d'événement, compter ses deux extrémités.** Une
extrémité à zéro est soit du code mort, soit un contrat non honoré ; les deux
méritent une décision, aucune ne mérite d'être supposée.

---
