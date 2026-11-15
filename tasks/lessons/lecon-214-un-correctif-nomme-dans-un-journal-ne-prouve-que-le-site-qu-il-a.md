## Leçon 214 — un correctif nommé dans un journal ne prouve que le site qu'il a touché, jamais le champ qu'il a nommé (2026-08-17, routine realtime, cycle 54)

**Le constat.** Le cycle 50 a « corrigé `location` » sur le chemin
`conversation:updated`. Les cycles 51, 52 et 53 ont hérité de cette phrase, et
le cycle 53 est même allé plus loin : il a écrit, en léguant sa piste n°3, que
`ConversationUpdatedEvent` et `ConversationUpdatedStoreEvent` sont « reliés par
un mapping manuel de quinze lignes » et que **« c'est ce mapping qui a laissé
tomber `location` au cycle 50 »**. La phrase nommait le mécanisme, le fichier et
le champ. Elle a été relue trois cycles de suite sans que personne n'aille
vérifier si le mapping avait changé. Il n'avait pas changé : le cycle 50 avait
réparé le consommateur APP (`ConversationListViewModel`), et le SDK n'a jamais
reçu l'épingle — ni dans son store RAM, ni dans le cache disque que la même
fusion écrit.

**Pourquoi l'inertie a tenu si longtemps.** Parce qu'un journal qui dit « le
champ X a été corrigé » se lit spontanément comme « le champ X est correct
partout », alors qu'il n'atteste que du site touché. Le piège est plus fort ici
que dans la leçon 213 : là-bas, une vague affirmait sans preuve qu'un site
restait correct, et l'absence de preuve était visible. Ici, la preuve ÉTAIT
faite — un vrai défaut, un vrai correctif, un vrai témoin — et c'est justement
sa qualité qui a dispensé les cycles suivants d'y revenir. **Une piste léguée
avec son diagnostic complet a l'air d'une piste déjà résolue.**

**Le corollaire technique.** Quand deux consommateurs appliquent le même
événement (ici : le ViewModel de l'app et la fusion du SDK — quatrième cycle
consécutif à devoir corriger aux deux endroits, le cycle 52 le notait déjà),
corriger l'un ne dit RIEN de l'autre. Et le consommateur oublié est
systématiquement le moins visible : celui qui n'a pas d'écran. Ici c'était le
SDK, dont la fusion écrit aussi le cache disque — donc le défaut y était plus
grave qu'à l'endroit corrigé, puisqu'il survivait au redémarrage.

**La règle.** Un audit qui rencontre, dans un journal ou une piste léguée, la
mention « le champ X a été corrigé au cycle N » doit **re-tracer le champ X sur
TOUS ses consommateurs avant de chercher un défaut ailleurs** — et la mention
est un signal de priorité, pas de clôture : elle prouve que ce champ a déjà
démontré sa capacité à se perdre. Le test qui tranche n'est pas « ce site a-t-il
été corrigé ? » mais **« combien de sites appliquent cet événement, et lequel a
été touché ? »**. Compter les consommateurs coûte un grep ; hériter d'une
correction coûte trois cycles.

**La contre-épreuve à écrire.** Un témoin qui protège un champ ne protège QUE ce
champ. Le pont du SDK portait déjà, deux lignes au-dessus du champ perdu, un
témoin dont le commentaire énonce exactement le défaut en cause — « un drapeau
décodé mais jamais transmis serait exactement aussi inerte qu'un drapeau
absent ». La phrase était juste, le témoin était vert, et le champ voisin
tombait quand même. Quand un témoin doit énoncer une règle de CLASSE (« tout
champ décodé doit être transmis »), le fixer sur un seul champ le réduit à un
témoin d'instance : c'est un témoin d'exhaustivité qu'il faut, ou la
suppression du mapping manuel qui rend la classe possible.
