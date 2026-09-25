## Leçon 62 — quand deux écrivains d'un même champ divergent, c'est le PLUS DESTRUCTEUR qu'il faut lire en premier (2026-08-08, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). Suite immédiate du cycle 20 :
la route d'édition était le quatrième écrivain de `Message.validatedMentions`, et le seul à
extraire avec `extractMentions` (handles bruts) au lieu de
`extractMentionsWithParticipants` (qui résout aussi `@Display Name`). Comme elle PURGE les
lignes `Mention` avant de ré-extraire, corriger une faute de frappe dans un message qui
nommait quelqu'un par son nom d'affichage supprimait sa mention — inbox `/mentions` et
surlignage compris.

**Leçons :**
1. **Un écrivain qui commence par supprimer transforme toute différence d'extraction en perte
   définitive.** Deux extracteurs qui divergent sur un champ *additif* donnent un affichage
   incomplet ; sur un champ *reconstruit après purge*, ils donnent une suppression. Chercher
   d'abord, parmi les écrivains divergents, celui qui fait `deleteMany` avant de recalculer :
   c'est lui qui porte le dégât, et c'est lui qu'il faut brancher sur la source unique.
2. **Un drapeau `{ replace: true }` aurait recréé le trou qu'on venait de fermer.** Deux
   exports nommés (`resolveMessageMentions` / `replaceMessageMentions`) forcent l'appelant à
   dire quelle sémantique il demande ; un paramètre booléen a une valeur par défaut, donc un
   oubli possible — et l'oubli aurait laissé un `validatedMentions` périmé décrivant des
   lignes déjà supprimées. Quand deux variantes n'ont PAS de défaut raisonnable, ne pas leur
   en inventer un.
3. **L'absence de court-circuit peut être le contrat, pas une optimisation oubliée.** La
   variante « création » ne doit rien écrire quand le contenu n'a pas de `@` ; la variante
   « édition » doit faire exactement l'inverse (effacer). Avant de reporter une garde d'un
   chemin sur l'autre par symétrie, vérifier qu'elle veut dire la même chose des deux côtés.
4. **Un test qui assert le NOM de la méthode appelée bloque la convergence.** Trois tests
   existants verrouillaient `extractMentions` — c'est-à-dire le défaut lui-même. Les faire
   porter sur le comportement (« une mention par nom d'affichage survit à une édition »)
   change ce que le prochain refactor a le droit de casser.
