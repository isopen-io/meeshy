## 2. « Le test passe » ne veut pas dire « le test verrait la régression »

Deux tests écrits pour ce cycle passaient au VERT sur du code **volontairement défectueux**, dans
deux fichiers différents et pour la même raison structurelle : le double `io` de Socket.IO déverse
toutes les chaînes dans un `io.to` unique. `expect(io.to).toHaveBeenCalledWith(room)` prouve alors
qu'**un** émetteur a adressé cette room, **jamais lequel** — et sur ce chemin, un second émetteur
déjà correct visait la même room.

La méthode qui l'a établi vaut plus que le constat : **re-casser volontairement le défaut et
relancer le test.** S'il reste vert, il ne couvre rien. À faire systématiquement quand un test est
écrit pour verrouiller un correctif dont l'audience est aussi atteinte par un émetteur voisin.

Trois doubles étaient concernés, dont un (`target.to.mockReturnValue(target)`) qui rabattait toute
chaîne sur son **premier** salon : un émetteur chaîné y était indiscernable d'un émetteur ayant
oublié tous les salons sauf le premier. **Un double qui simplifie l'API qu'il simule fabrique des
faux verts** — s'il modélise `to()`, il doit modéliser le chaînage.
