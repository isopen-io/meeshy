## Leçon 144 — Une règle tenue par ses lecteurs CANONIQUES n'est pas tenue ; deux lecteurs corrects sont un camouflage

**Contexte** : cycle 107. `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` est nommée
dans `CLAUDE.md` comme la source de vérité iOS du Prisme Linguistique pour l'aperçu de conversation, avec
sa jumelle gateway. Elle est appelée par `ThemedConversationRow` (la ligne de liste) et par
`GlobalSearchViewModel` — les deux lecteurs que n'importe qui citerait si on demandait « où l'aperçu
s'affiche-t-il ? ». Les deux sont corrects, testés, et portent des commentaires qui expliquent la règle.
Pendant ce temps `WidgetDataManager.formatLastMessage`, `SharePickerView` et `WidgetPreviewView` lisaient
`lastMessagePreview` brut et affichaient le dernier message dans la langue de l'expéditeur — dont un sur
l'écran d'accueil, hors de portée de toute résolution ultérieure.

**La leçon** : la leçon 143 disait qu'une garde LOCALE sur un défaut GLOBAL rassure autant qu'une garde
globale. Le onzième membre de la famille en est la version sans garde du tout : **une règle appliquée par
ses lecteurs canoniques est PLUS difficile à auditer qu'une règle appliquée nulle part.** Un audit qui
cherche « le Prisme est-il appliqué à l'aperçu ? » tombe sur `ThemedConversationRow`, lit le commentaire,
et conclut « oui ». La réponse juste à cette question n'est jamais un exemple — c'est un **dénombrement**.

**Le réflexe** : devant une règle de présentation dont le dépôt nomme le résolveur, ne pas chercher si
le résolveur est APPELÉ. Grepper le champ BRUT qu'il consomme, et trier les lecteurs un par un. Ici :
`resolvedLastMessagePreview` → 2 appels de production ; `.lastMessagePreview` → 6 fichiers. C'est l'écart
entre les deux chiffres qui EST le défaut, et il se lit en deux greps.

**Corollaire de sortie de périmètre** : la surface la plus grave n'est pas la plus visible, c'est la
**dernière** — celle après laquelle plus personne ne peut résoudre. Un texte publié dans un App Group,
poussé dans une notification, ou gravé dans un export a quitté le domaine où la règle existe. Toute
fonction qui écrit hors de l'app est un point de résolution OBLIGATOIRE, jamais un simple relais.

**Corollaire de cohérence intra-écran** : le même fichier peut se contredire. `ThemedConversationRow`
résolvait à l'affichage mais calculait son test d'existence (`hasText`, qui arbitre entre texte, pièce
jointe et position) sur le champ brut. Deux valeurs différentes pour une même ligne : la place d'un
texte réservée pour un texte qui ne s'affichera pas. Un test d'existence doit porter sur la valeur
RENDUE, pas sur celle dont elle dérive.

**Corollaire de balayage** (repris de la 231, payé à nouveau) : la garde qui dénombre doit refuser un
balayage vide. `XCTAssertFalse(readers.isEmpty)` ET la présence de chaque entrée d'allowlist — sans quoi
un découpeur de commentaires trop gourmand, ou une arborescence déplacée, rendent la garde verte en
n'ayant rien vérifié.
