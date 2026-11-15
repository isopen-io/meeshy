## Leçon 216 — un champ qui voyage sans être déclaré ne repose que sur la lecture du code voisin, et c'est la forme de parité qui échoue (2026-08-17, routine temps réel, cycle 54 bis)

### 1. Ce qui s'est passé

`location` voyageait sur `conversation:updated` depuis trois émetteurs, sans
figurer nulle part dans le type de l'événement : une index signature de fin
(`readonly [key: string]: unknown`) le laissait passer. Un émetteur sur trois
l'avait perdu — celui qui sert REST, ZMQ et les agents — alors qu'il calculait
déjà le lieu **vingt lignes plus haut, dans la même fonction**, pour le hisser
sur `message:new`.

Le même champ était perdu une seconde fois, indépendamment, par un mapping
manuel de quinze lignes entre deux types jumeaux : décodé d'un côté, jamais
recopié de l'autre.

### 2. Pourquoi ni l'un ni l'autre ne se voyait

Parce que dans les deux cas **l'absence a exactement la forme du silence**. Une
clé non déclarée qui manque ne fait échouer aucun compilateur ; une ligne de
recopie qui n'existe pas ne se distingue pas d'une ligne qu'on n'a pas eu besoin
d'écrire. Il n'existait aucun endroit d'où l'on pouvait dire « il en manque
un » — ni le type, ni un test, ni une relecture.

Un champ optionnel toléré par une index signature n'est pas un champ « souple » :
c'est un champ dont **la parité entre émetteurs repose sur la lecture du code
voisin**. C'est-à-dire sur rien.

### 3. La règle

**Un champ que plusieurs émetteurs doivent porter à l'identique doit être
DÉCLARÉ, même si le transport l'accepte sans.** L'index signature existe pour
les champs qu'un seul émetteur pose (un renommage, un réglage) ; elle ne doit
jamais couvrir un membre d'un GROUPE que tous doivent servir de la même façon.

Et la déclaration doit porter **la règle du silence**, pas seulement le type.
Ici : *clé absente = « ce message n'a pas de lieu »*, jamais « je n'en parle
pas » — sans quoi le corollaire opposable (« un émetteur qui porte
`lastMessageId` porte le lieu du message qu'il nomme, ou aucun ») ne se déduit
d'aucune signature.

### 4. Le corollaire — un geste de remise à neutre transforme une omission en perte

`adoptLastMessage` remet à neutre TOUT ce qui décrit le message dès que
l'identité change. C'est la bonne règle, et elle rend le défaut PIRE : sans
elle, le champ non transmis restait simplement périmé ; avec elle, il est
activement effacé et jamais reposé.

Donc : **toute primitive « remets à neutre, l'appelant repose ce que le payload
porte » crée une obligation sur chacun de ses appelants**, et cette obligation
n'est vérifiée par personne. Ajouter un champ au geste de remise à neutre sans
l'ajouter au chemin qui le repose est une régression silencieuse — c'est
exactement ce qui s'est produit ici.

### 5. Le signal qu'on aurait dû lire plus tôt

Trois fois le même défaut au même endroit : `location` au cycle 50, la garde du
titre d'un DM au cycle 51, `location` de nouveau au cycle 54. Toujours parce que
**deux fusions distinctes appliquent le même événement** — celle de l'écran et
celle du store, qui écrit le cache disque.

Quand un défaut revient une TROISIÈME fois au même point de couture, le
correctif du champ n'est plus le travail : c'est la couture.

### 6. Le corollaire de méthode — deux instances de la même routine

Ce cycle a été instruit DEUX fois en parallèle, et la seconde (#3122) a fusionné
la première. Les deux avaient trouvé les deux mêmes trous, écrit six témoins
chacune, et nommé leur journal du même nom de fichier.

Ce qui a survécu de la branche perdante n'est pas son code — identique, donc
jetable — mais **la seule chose que l'autre n'avait pas faite** : déclarer le
champ dans le contrat, pour que la parité entre émetteurs cesse de dépendre de
la lecture du code voisin.

D'où la règle de reprise : quand une autre branche a livré le même correctif,
ne pas rejouer le diff. **Diffuser les deux et ne garder que le delta** — la
part qui répond à « pourquoi ça recommencera » plutôt qu'à « qu'est-ce qui est
cassé ». Repousser du code déjà présent n'ajoute qu'un conflit ; repousser la
garde manquante ajoute une fin à la série.
