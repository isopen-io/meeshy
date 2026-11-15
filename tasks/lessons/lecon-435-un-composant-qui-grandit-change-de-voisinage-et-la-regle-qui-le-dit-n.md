## Leçon 435 — un composant qui GRANDIT change de voisinage, et la règle qui le dit n'a été appliquée qu'à UNE dimension

**Le fait (2026-09-02, #4831).** Quatre directives du porteur sur le corpus déplié
d'une story — retirer le fond sombre, laisser défiler sans faire tourner la
story, garder l'invite visible, ramener en tête au toucher du haut. Les quatre
sont des symptômes du même fait : **la légende repliée ne rencontre personne, la
légende dépliée rencontre tout le monde** — le rail d'actions, le drag du
lecteur, le chrome du haut, la couche de gestes.

Le dépôt le savait déjà. Le doc-comment de `expandedTrailingInset`, écrit un jour
plus tôt (#4762), dit exactement :

> Un bloc qui grandit ne rencontre pas les mêmes voisins que le bloc replié. Ce
> qui ne se chevauchait pas dans un état peut se chevaucher dans l'autre — la
> place se vérifie DÉPLIÉE, pas au repos.

Elle n'avait été appliquée qu'à **la place**. Trois autres dimensions du même
voisinage étaient restées non vérifiées, et chacune portait un défaut :

| dimension | le défaut, à l'état déplié seulement |
|---|---|
| la place | *corrigée en #4762* — le texte passait sous les icônes |
| les **touchers** | la `ScrollView` du corpus, en `frame(maxWidth: .infinity)`, prenait la bande du rail : Send, Vues, Partager, Enregistrer **visibles et inertes** |
| le **z** | la légende avait pris `zIndex(60)` pour recevoir son propre tap ; le rail, déclaré plus bas sans `zIndex`, était passé dessous |
| les **gestes** | `unifiedDragGesture`, monté sur un ancêtre, restait actif sur le corpus : lire le faisait tourner ou refermer la story |

> **Une règle appliquée à UNE dimension a l'air appliquée.** Le commentaire était
> là, juste, cité, et il n'a protégé que ce qu'il avait servi à corriger. Quand
> une règle parle de VOISINAGE, elle en gouverne au moins quatre : la place, les
> touchers, l'ordre de superposition et les gestes — et il faut les nommer, sinon
> seule la première est relue.

**La forme générale, dégagée avec la session voisine le même jour** (leçon 434,
qui déroule la question « qui touche ce CHAMP ? » là où celle-ci déroule « qui
touche cet ESPACE ? ») :

> **Quand une règle naît d'un symptôme, elle hérite de la dimension de ce
> symptôme et d'aucune autre.** Ce qu'il faut écrire n'est donc pas la phrase
> seule mais la LISTE des dimensions qu'elle couvre — sans quoi la relecture
> suivante retrouve la phrase, la trouve juste, et ne la rejoue que sur le cas
> qui l'a fait naître. Les dimensions manquantes sont invisibles à la recherche
> qui a produit la règle, par construction.

### Trois corollaires, chacun payé séparément

**Le conteneur prend les touchers que le contenu évite.** Le corpus s'écartait
soigneusement du rail ; c'est sa `ScrollView` qui captait. Une marge est une
propriété du CONTENU, le hit-test une propriété du CONTENEUR — les deux ne se
rencontrent jamais. *Écarter un texte d'un voisin ne lui rend pas ses touchers.*
Et un contrôle **visible et inerte** est pire qu'un contrôle caché : rien
n'indique pourquoi il ne répond pas.

**Un nombre juste dans un repère est faux dans l'autre.** `expandedTrailingInset:
68` était exprimé dans la colonne du canvas, qui déborde volontairement le
viewport (491,3 pt pour un écran de 402 — le cadrage même qui avait sauvé le
texte en #4762). **68 pt de colonne n'en valent que 24 à l'écran.** Rien ne le
signale : les deux s'écrivent « 68 ». Le correctif qui répare une dimension
fournit le repère qui trahit la suivante.

**Un mécanisme REMPLACÉ ne disparaît pas de lui-même.** L'assombrissement du fond
était passé du voile de la légende à l'effacement de la scène (`storySceneOpacity`,
directive du même jour) — et les deux se sont cumulés pendant une journée. Aucun
témoin ne pouvait rougir : chacun faisait exactement ce pour quoi il avait été
écrit. *Quand une directive change la MANIÈRE d'obtenir un effet, quelqu'un doit
retirer l'ancienne manière — ce n'est jamais automatique.*

### Le sixième défaut, et c'est moi qui l'ai écrit

Le correctif du voile a d'abord retiré le dégradé du composant **pour ses trois
hôtes**. La directive n'en nommait qu'un — la story — et c'est le seul qui a le
mécanisme de remplacement : sa scène s'efface d'elle-même. Le lecteur de réel et
le plein écran média n'ont, eux, qu'un voile de BAS DE PAGE
(`[.clear, .black.opacity(0.75)]`), calibré pour une légende repliée et presque
transparent là où un corpus déplié monte. Leur retirer celui du composant, c'était
poser du texte blanc sur une vidéo claire — en croyant appliquer une directive qui
ne parlait pas d'eux.

> **Une directive formulée sur UN hôte ne se code pas dans le composant PARTAGÉ.**
> Elle se code en PARAMÈTRE, avec le défaut qui préserve les hôtes qu'elle ne
> nomme pas. Sinon on « applique » la demande en dégradant deux surfaces dont
> personne ne s'est plaint — et l'auteur du correctif est le dernier à le voir,
> puisqu'il regarde l'écran sur lequel la demande a été faite.

C'est la même leçon que ci-dessus, sur l'axe des HÔTES au lieu de celui des
dimensions : un changement hérite du périmètre du symptôme qui l'a déclenché, et
il faut nommer ce périmètre explicitement pour ne pas l'étendre par distraction.

### Et une jumelle de la 433

`hasScrollableReaderSurface` ÉNUMÈRE les surfaces auxquelles le drag du lecteur
rend la main : commentaires, sélecteur d'emojis, explorateur de langues. Le
mécanisme est bon, testé, documenté — et la légende dépliée n'y avait jamais été
inscrite, parce qu'elle est née après lui. C'est la 433 (*ce qui s'énumère se
périme, ce qui se dérive tient*) sur un objet qui n'est ni une clé de charge ni
une entrée de rangée, mais un AYANT DROIT. Toute nouvelle surface défilante naît
hors de cette protection, en silence.

**Le témoin qui attrape la classe** serait dérivé, pas énuméré : « toute vue du
lecteur qui monte une `ScrollView` figure dans `hasScrollableReaderSurface` ».
Ouvert en suivi de #4831 → #4837.
