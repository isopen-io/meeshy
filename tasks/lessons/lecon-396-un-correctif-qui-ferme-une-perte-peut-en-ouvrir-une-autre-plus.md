## Leçon 396 — Un correctif qui ferme une perte peut en OUVRIR une autre, plus discrète

**Contexte.** #4676 corrigeait un défaut réel : poser un son en fond alors qu'un
fond existait ne faisait rien — trois gestes, trois no-op, et un enregistrement
perdu dans un cas sur trois. Le remède : retirer l'occupant avant de poser le
nouveau. Le symptôme visé a disparu. Une perte de données est née à sa place.

Le porteur l'a nommé au geste suivant : « normalement deux vocaux en fond =
2 cartes ». Chaque remplacement DÉTRUISAIT le son précédent, définitivement, sans
qu'aucun écran ne le dise — et comme la disparition ressemble exactement à ce
que l'auteur vient de demander, elle ne se lit pas comme une perte.

**La leçon.** Devant tout correctif de REMPLACEMENT, poser la question qui n'a
rien à voir avec le symptôme : **qu'advient-il de ce qui occupait la place ?**
Trois réponses possibles, et deux d'entre elles sont des pertes — il meurt, il
s'en va sans qu'on sache où, il DESCEND quelque part de visible. Seule la
troisième est un produit.

Ici, la troisième existait déjà : la colonne CONTENU dessine une carte par son.
Le fond remplacé y descend, et la carte le rend visible, ré-ouvrable et
supprimable. Corollaire trouvé en l'écrivant : la descente est impossible pour un
son EMPRUNTÉ (pas de fichier — sa carte serait muette) et inutile pour un son
DÉJÀ servi en contenu (elle la doublerait). Ces trois cas ne diffèrent pas par
leur gravité mais par **ce que l'écran peut MONTRER** — d'où un type somme
(`ComposerSupersededBackground.Fate`) plutôt qu'un `deleteElement` au site
d'appel.

**Le témoin.** Il s'écrit sur le second son, jamais sur le premier : au premier,
« remplacer » et « détruire » rendent le même écran.
