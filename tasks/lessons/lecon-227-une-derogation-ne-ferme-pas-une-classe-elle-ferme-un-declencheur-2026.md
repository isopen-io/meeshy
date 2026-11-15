## Leçon 227 — une dérogation ne ferme pas une CLASSE, elle ferme un DÉCLENCHEUR (2026-08-17, routine messagerie, cycle 60 bis)

Le cycle 59 a posé `refetchOnWindowFocus: false` + `refetchOnReconnect: false` sur
la liste infinie, et a proposé pour suite un garde « toute query infinite paginée
par OFFSET porte les deux dérogations ». Ce garde aurait été VERT au-dessus de
trois défauts vivants : **les deux dérogations ne désarment que les déclencheurs
GLOBAUX du QueryClient ; un `invalidateQueries` explicite passe à travers.**

Règle : quand on désarme un déclencheur d'un geste destructeur, **énumérer tous
les chemins qui produisent ce geste**, pas seulement celui qu'on vient de voir.
Ici la question à poser était « qui d'autre peut invalider ce cache ? » (`grep`
du préfixe), et non « le déclencheur global est-il désarmé ? ». Un garde formulé
sur la DÉFENSE au lieu du DOMMAGE se pose à côté de la panne.

### Un témoin qui asserte le geste est un VERROU, pas une mesure

Troisième cycle d'affilée où le correctif commence par retourner des témoins
verts. `expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['conversations'] })`
**demandait** la panne. Mesurer le geste (un appel à `invalidateQueries`) au lieu
de son EFFET (des pages relues) verrouille l'implémentation et rend le défaut
indéfendable à la relecture, puisque la suite est verte.

Forme correcte, systématiquement : monter le vrai consommateur, provoquer le vrai
déclencheur, compter les **requêtes**. Ici : liste réelle + deux pages chargées
(pour que la frontière que le rejeu duplique existe) + comptage des appels au
service. Le ROUGE devient alors le dommage lui-même, chiffré.

### Avant de router un besoin vers le mécanisme « propre », vérifier qu'il le SERT

Router `message:pending-delivered` vers le delta borné était la réponse évidente
— même besoin, mécanisme déjà écrit, déjà testé. Elle est fausse : le watermark du
delta est DÉDUIT du cache, et le handler qui tourne juste avant vient de l'avancer
au-delà du changement à rattraper. Le delta n'aurait rien rendu, silencieusement.

Règle : un mécanisme de rattrapage borné par un curseur **dérivé de l'état local**
est aveugle à tout fait serveur attaché à un changement que la socket a déjà
partiellement écrit. Avant de lui déléguer un besoin, tracer l'ORDRE des écritures
et vérifier que le curseur n'a pas déjà dépassé. La garantie « une écriture socket
ne peut que faire AVANCER le watermark » est une garantie de sûreté, pas de
complétude — et son corollaire n'était écrit nulle part.

### La règle en CAPITALES à vingt lignes du handler qui la viole

`handleNewMessage` porte « DO NOT invalidate here », majuscules comprises, avec sa
raison. Le handler suivant dans le même fichier invalidait un préfixe PLUS LARGE.

La classe n'est pas « deux mécanismes pour un job » (cycle 59) ni « corrigé d'un
côté, pas de l'autre » (cycles 51-58) : c'est **une règle écrite au bon endroit et
démentie par le voisin**. Un commentaire, même impératif et même juste à côté, ne
garde rien. Seul un témoin qui mesure l'effet garde. Quand on trouve une règle
énoncée en commentaire, **vérifier ses voisins immédiats** — c'est là qu'elle est
le plus souvent violée, parce que la proximité a fait croire qu'elle était lue.
