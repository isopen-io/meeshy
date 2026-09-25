## Leçon 204 — quand deux causes produisent le même symptôme, le discriminant ne peut pas venir du symptôme (2026-08-16, routine temps réel, cycle 46 bis)

**Le motif.** Un client tenait une garde monotone sur l'aperçu de la ligne de
liste : un `lastMessageAt` qui RECULE désigne un message périmé, tout le groupe
est jeté. La garde est juste — une diffusion arrivée dans le désordre recule
bien. Elle était aussi FAUSSE pour un second cas : un recalcul autoritatif du
serveur (suppression pour tous du dernier message, masquage personnel du dernier
message visible) recule lui aussi, et légitimement.

Les deux causes produisent le MÊME symptôme, au champ près : `lastMessageAt`
recule, `lastMessageId` change. J'ai cherché pendant un moment un prédicat plus
fin sur le payload — comparer les identifiants, comparer les horodatages
d'émission, dériver l'intention du contenu. *Aucun ne pouvait marcher, et pas
par manque d'astuce : l'information n'était pas dans le payload.* Elle était
chez l'émetteur, qui sait toujours lequel des deux il envoie.

**La règle.** Devant une garde client qui écarte à tort une classe de messages :
d'abord établir si le symptôme DISCRIMINE. Énumérer les causes qui produisent la
même observation ; si elles sont plusieurs et que le payload ne les sépare pas,
arrêter de chercher un prédicat et faire déclarer l'émetteur. Un champ optionnel
qui dit « ceci est un recalcul » est plus honnête, plus court et plus testable
que n'importe quelle heuristique reconstruisant l'intention à partir de ses
effets.

**Le contre-témoin est la moitié du correctif.** Ouvrir une garde se teste par
DEUX témoins, pas un : le cas qui doit désormais passer, et le MÊME cas sans la
déclaration, qui doit rester bloqué. Sans le second, un correctif qui aurait
simplement supprimé la garde serait passé pour bon — et aurait rouvert le défaut
que la garde fermait. *Quand on relâche une contrainte, le témoin qui compte est
celui qui prouve qu'elle tient encore ailleurs.*

**Compter les frontières avant de se déclarer prêt.** Le champ traversait trois
couches : contrat partagé, décodage, et le mapping store. Ce dernier ne recopie
qu'un SOUS-ENSEMBLE des champs décodés — il perdait déjà `updatedAt` en silence.
*Un drapeau décodé mais non transmis est exactement aussi inerte qu'un drapeau
absent, et rien ne le signale : ni le compilateur, ni un test de la règle de
fusion seule.* Le témoin qui l'attrape est celui qui part de l'événement du fil
et finit sur l'état du store.

**Écarter une piste héritée est un résultat.** Le cycle 45 léguait une piste
précise ; l'établir a montré qu'il n'y avait pas de défaut (la route est fermée
aux sessions anonymes, les deux bouts s'accordent pour la bonne raison). La
consigner comme close, avec les deux citations qui tranchent, vaut mieux que de
la laisser ouverte pour qu'un cycle suivant la ré-instruise.

**Post-scriptum — la leçon 198 s'est reproduite, à l'identique.** Une AUTRE
exécution de cette routine tournait en parallèle et a livré son propre « cycle
46 », avec sa propre leçon (aujourd'hui la 200, après le renumérotage global
#3075). Les deux sont parties de la même piste
héritée et ont conclu la même chose sur elle, indépendamment — ce qui la confirme
à deux voix — avant de diverger sur des surfaces sans recouvrement. Le coût réel
n'a donc pas été du travail perdu mais une COLLISION DE NOMS, découverte au
merge : deux numéros de cycle, deux numéros de leçon. *Le numéro de cycle et le
numéro de leçon sont attribués en début de course, à partir d'un état du dépôt
qui peut déjà être périmé ; les traiter comme réservés est l'erreur.* Rien ne les
alloue, et rien ne le fera tant que la réservation ne sera pas écrite quelque
part que les deux exécutions lisent. En attendant : au moment du merge, relire
`tasks/lessons.md` et `tasks/todo.md` AVANT de résoudre, et renuméroter la
sienne — le suffixe « bis » (leçon 198, cycle 44) est la convention établie.
