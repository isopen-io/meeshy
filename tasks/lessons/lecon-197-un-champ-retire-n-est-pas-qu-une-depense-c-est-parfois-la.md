## Leçon 197 — un champ retiré n'est pas qu'une dépense : c'est parfois la fonctionnalité elle-même (2026-08-16, routine temps réel, cycle 44)

**La même frontière muette, mais l'enjeu inverse.** Le cycle 43 avait trouvé un
sérialiseur qui retirait un champ inutile : une dépense pure. Le cycle 44 trouve
le même mécanisme retirant `anonymousSender` — et là, ce qui tombe est
l'IDENTITÉ des auteurs anonymes d'un lien partagé, c'est-à-dire la population
majoritaire de ce point de service. Trois capacités entières tombaient avec elle :
pièces jointes, réactions, réponse citée. *Un champ non déclaré ne coûte pas
toujours seulement de l'argent ; devant une troncature, la première question
n'est pas « combien payait-on ? » mais « qu'est-ce qui ne s'affichait pas ? ».*

**« Le client ne lit pas ce champ » ne veut pas dire « le client n'a pas besoin
de cette donnée ».** `anonymousSender` avait zéro lecteur — web et iOS. La
conclusion tentante était de le retirer et de clore. Elle aurait laissé le fil
sans nom. La donnée était nécessaire ; c'est le CHAMP qui était le mauvais
véhicule. *Chercher les lecteurs d'un champ ne répond qu'à la moitié de la
question : il faut chercher ce que le client lit À LA PLACE — ici `sender`, que
la route jumelle du même lien remplissait déjà pour les mêmes invités.*

**Le voisin qui a raison est la meilleure preuve de conception.** Servir
l'identité anonyme par `sender` n'exposait rien de nouveau : `GET
/links/:identifier` le fait depuis toujours, sur le même lien, la même
conversation, la même population. Cette symétrie a tranché seule un arbitrage
qui aurait pu s'éterniser en discussion de confidentialité. *Avant de qualifier
un champ de « nouvelle surface de données », vérifier si une route voisine le
sert déjà : la réponse est souvent dans le dépôt, et elle est factuelle.*

**Trancher champ par champ produit des NON autant que des OUI.** Neuf champs
tombaient ; sept sont rétablis, deux ne le sont pas — `deletedAt` (la requête
filtre `deletedAt: null`, valeur constante) et `sender.systemLanguage` (jamais
servi, jamais lu). Déclarer les neuf « pour réparer » aurait rétabli deux
constantes et raté la vraie question. *Une consigne « ne pas déclarer en bloc »
ne se satisfait pas d'un examen groupé rapide : elle se vérifie au fait que la
liste finale est plus courte que la liste des symptômes.*

**Quatrième cycle consécutif : le double allégé de son sérialiseur.** Ici le
double allait plus loin encore — il remplaçait `messageSchema` par
`{ type: 'object', properties: {} }` ET le formateur par l'identité. Il ne
testait donc ni le schéma, ni le formateur, ni leur rencontre, c'est-à-dire
exactement les trois choses dont le défaut était fait. *Un double qui remplace
les deux extrémités d'un contrat ne teste plus que la plomberie entre elles ;
quand le défaut vit dans le contrat, cette suite est verte par construction.*
