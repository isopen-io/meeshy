## Leçon 173 — Un correctif qui ajoute une AUDIENCE doit hériter des bornes de l'audience voisine (2026-08-15, routine temps réel, cycle 23)

Le cycle 22 a ajouté au bon endroit la 3e audience de `message:translation` (les
lecteurs hors ligne) et a fermé un vrai trou. Mais il l'a livrée **sans le
filtre de langue** que la 2e audience — `emitConversationPreviewUpdate`, dans la
MÊME fonction, dix lignes plus bas — applique depuis toujours via
`onlyIfPreviewCarriesLanguage`. Résultat : `L × P` entrées en file là où `P`
suffisent, dont `L−1` illisibles par construction pour leur destinataire.

**La règle.** Quand on ajoute une audience à un événement qui en a déjà une,
la question n'est pas seulement « qui manque ? » mais « **quelles bornes les
audiences existantes portent-elles, et pourquoi ?** ». Une borne déjà écrite à
côté est une connaissance métier déjà payée ; ne pas l'hériter, c'est la
redécouvrir plus tard par le symptôme. Le voisinage physique dans le fichier est
ici le signal : deux `await` consécutifs sur le même événement, l'un borné,
l'autre non.

**Pourquoi c'est resté invisible.** L'entrée surnuméraire ne casse RIEN de
visible : le client la reçoit, la met en cache sous une clé
(`messageId_targetLanguage`) qu'il n'affichera jamais, et se tait. Il n'y a ni
erreur, ni log, ni test rouge. Le coût est ailleurs — dans la file **partagée
avec les vrais messages**, et surtout dans le repli mémoire plafonné à 50
entrées, où la dilution fait évincer de VRAIS messages au profit de traductions
illisibles. **Un défaut de VOLUME sur une ressource partagée se paie chez le
voisin, jamais chez le coupable** : c'est ce qui le rend introuvable par le
symptôme.

**Corollaire de prédicat — filtrer sur l'APPARTENANCE, jamais sur la TÊTE.**
La tentation est de ne servir que la langue de rang 1 du lecteur. Elle est
fausse : un prisme `['de','en']` a besoin de son entrée `en`, qui est son repli
le jour où la traduction allemande échoue. Un prisme est une CASCADE, et filtrer
une cascade sur son premier terme échange de la bande passante contre une
régression fonctionnelle silencieuse — visible seulement en cas d'échec partiel,
c'est-à-dire jamais en test nominal.

**Corollaire d'échec ouvert.** Un filtre bâti sur une donnée qui peut manquer
(ici un prisme non résoluble : invité anonyme, préférences vides) doit échouer
OUVERT. L'asymétrie des coûts le dicte : une entrée de trop est invisible, une
traduction perdue est un défaut produit. Écrire le cas « je ne sais pas » comme
« je n'envoie pas » transforme un trou de données en trou de fonctionnalité.

**Corollaire de détection généralisé (suite de la Leçon 172).** La leçon 172
prescrivait de vérifier la FORME des events à émetteurs multiples. Le balayage
mécanique de ce cycle l'a sortie verte partout — parce que l'émetteur Socket.IO
est TYPÉ : TypeScript interdit déjà la divergence de forme. Le prédicat utile
n'est donc pas « plusieurs émetteurs » mais « **plusieurs émetteurs dont au
moins un CONTOURNE le typage** » (nom d'event en littéral de chaîne). Affiner un
prédicat d'audit qui ne trouve plus rien vaut mieux que le relancer tel quel.
