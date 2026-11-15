## Leçon 374 — Décrire le MÉCANISME d'un défaut et corriger la seule occurrence qu'on regarde

**Contexte (2026-08-31, #4609).** `ComposerSceneSurface` gouvernait la bande de
la scène par la PRÉSENCE d'une vue :

```swift
if let toolOptions { toolOptions }
else if let band { ComposerSceneBandView(…) }
```

pendant que le meuble passait cette vue **inconditionnellement** :

```swift
toolOptions: AnyView(MeeshyToolOptionsPanel(viewModel: viewModel)),
```

avec, en commentaire, une justification correcte : « `MeeshyToolOptionsPanel`
rend `EmptyView` quand rien n'est déplié, donc le montage est inconditionnel et
la loi 4 est tenue par la vue elle-même ».

C'est une bonne décision de VUE et une mauvaise source de VÉRITÉ.
`toolOptions == nil` était **toujours faux** ⇒ `ComposerSceneBandView` n'a
**jamais** été montée. Trois surfaces mortes d'un coup : la palette de fond
(vue `1b`), la bande de rognage (`2d`), et **tout jeton d'objet dont la
destination est une bande** (`1c`) — c'est-à-dire la livraison du lot
précédent, inerte le jour de sa livraison.

### Ce qui rend la leçon dure

Le commentaire qui DIAGNOSTIQUE ce mécanisme était déjà écrit, **douze lignes
plus bas**, sur la rangée de jetons, dans le lot qui l'y avait corrigé :

> « Le témoin d'"outil ouvert" est le MODE DU RAIL, jamais la présence du
> panneau d'options : l'hôte passe ce dernier inconditionnellement (il se vide
> lui-même), donc `toolOptions == nil` était toujours faux et la rangée n'a
> jamais pu paraître. Mesuré à l'écran, pas déduit. »

J'avais donc : trouvé le défaut, mesuré son symptôme à l'écran, nommé sa cause
avec précision, écrit la règle générale — et corrigé **une** des deux
occurrences, l'autre étant dans le champ de vision au moment où j'écrivais la
phrase.

> **Un diagnostic posé au-dessus d'une ligne qui a encore le défaut ne le
> signale pas : il prouve qu'on le savait.**

### La règle

Quand un correctif fait écrire une phrase de la forme *« X n'est pas le bon
témoin de Y, le bon témoin est Z »*, ce n'est pas un commentaire — c'est une
**requête à lancer** :

1. `grep` le mauvais témoin (`toolOptions`, ici) dans le fichier ET chez ses
   hôtes, avant d'écrire la phrase ;
2. compter les occurrences ; corriger toutes ou dire lesquelles restent et
   pourquoi ;
3. et de préférence, **rendre le mauvais témoin inutilisable** — ici en
   extrayant `ComposerLowZone.resolve(toolIsOpen:band:)`, une règle pure que les
   deux sites consultent. Un `if toolIsOpen` recopié dans la vue serait redevenu
   une seconde loi divergeant de `ComposerObjectChips.isServed`.

C'est la variante « au sein d'un même fichier » de la leçon 373 : là, cinq sites
se citaient l'un l'autre à travers le dépôt ; ici, deux sites voisins posaient la
même question et un seul a reçu la bonne réponse. **Le voisinage ne protège
pas — il endort.**

### Corollaire sur les gardes

La garde qui referme ce défaut est NÉGATIVE (« la source ne contient plus
`if let toolOptions … else if let` »). Vérifié : elle aurait été **rouge** sur
l'état d'avant — une garde négative dont on n'a pas prouvé qu'elle attrape
l'état corrigé est une garde qui naît morte
([[reference_negative_source_guards_die_silently]]).

Voir aussi leçon 369 (les cinq natures d'un contrôle qui ne fait pas ce qu'il
annonce), leçon 373 (le cercle d'absences),
[[reference_inert_control_vs_unfed_feature]].
