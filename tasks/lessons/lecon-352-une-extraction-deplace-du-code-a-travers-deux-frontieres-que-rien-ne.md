## Leçon 352 — Une extraction déplace du code à travers DEUX frontières que rien ne signale, et la parade n'est pas celle qu'on croit

**Trois occurrences en une soirée, quatre formes différentes, toutes de la même
main.** Le 2026-08-31, en découpant `StoryViewerView+Sidebar.swift` (1 369
lignes, deux vues) pour la vue `2f`, neuf gardes qui nommaient ce fichier sont
devenues aveugles d'un coup. En les repointant, deux se sont révélées **déjà
rouges sur `dev` depuis mes lots précédents** — et une suite complète, lancée
plus tard le même soir, en a sorti quatre autres que personne ne regardait.

Les frontières, et pourquoi elles ne se signalent pas :

1. **les GARDES qui nomment un fichier.** Le code déplacé compile et se comporte
   à l'identique ; c'est le chemin qui a changé sous la garde ;
2. **l'AMNISTIE.** Les cliquets à liste de fichiers (`bearingFiles` des tailles
   figées, `fullyLocalizedScreens`, `legacyOverBudget`) couvrent des NOMS. Le
   code sort de leur couverture sans qu'une ligne change.

### Ce qui coûte le plus n'est pas ce qui rougit

| garde | ce qu'elle devient en perdant son fichier |
|---|---|
| POSITIVE (`XCTAssertTrue(text.contains(…))`) | **rouge** — désagréable, mais honnête |
| NÉGATIVE (`XCTAssertFalse(…)`) | **verte en ne regardant plus rien** — elle se déguise en succès |

Deux des neuf étaient négatives. Elles ne se plaignaient pas : elles avaient
cessé d'interdire.

Et une troisième forme, plus perverse encore, relevée par la session voisine sur
`EditParityInventoryTests` : une garde qui MESURE une capacité et lit le fichier
que le code vient de quitter **conclut que la capacité a disparu**.

> **Une garde qui perd son sujet ne dit pas « j'ai perdu mon sujet ».** Elle dit
> « la capacité a disparu », « un site interdit est apparu », « le composant
> n'est pas utilisé » — et envoie chercher une régression qui n'existe pas.

### La parade qui NE marche pas

« `grep` le nom du fichier dans `MeeshyTests/` avant d'extraire » — je l'avais
écrite en mémoire, et je ne l'appliquais qu'aux gardes que je CONNAISSAIS.
Elle rate tout ce à quoi on ne pense pas : un cliquet d'accessibilité, une liste
d'amnistie, une garde d'architecture nommée d'après un concept et non d'après la
feature.

Le glob ne sauve qu'un cran : `AppSourceGuard.unit(".../FeedPostCard.swift")`
attrape bien `FeedPostCard+*`, mais `unit(".../FeedPostCard+Header.swift")` a
pour base `FeedPostCard+Header` et ne rend que lui. Pire : `ReelPageView
+Info.swift` a pour base `ReelPageView`, **pas** `ReelsPlayerView` — l'extraction
avait changé le TYPE porteur, pas seulement le fichier. Aucun motif ne relie les
deux ; seule une liste explicite le dit.

### La parade qui marche

**Faire tourner la suite ENTIÈRE après une extraction.** Pas les classes qu'on
croit concernées — celles-là sont précisément celles auxquelles on a pensé. Sur
ce dépôt : ~9 345 tests, six minutes, et elle a sorti d'un coup les six rouges
que trois runs ciblés successifs avaient laissés passer.

### Corollaire — le même rouge se répare de deux façons OPPOSÉES

Devant un cliquet qui rougit après une découpe, la question n'est pas « comment
le faire passer » mais **« ce code est-il NOUVEAU ? »** :

- **relocalisation pure** ⇒ inscrire le nouveau nom, **plafond inchangé** ;
- **vrai ajout** ⇒ monter le plafond d'un cran, avec sa raison écrite.

Les confondre avale en silence exactement l'ajout que le cliquet existe pour
refuser. Les deux cas se sont présentés la même nuit, et une fois **dans le même
fichier** : le carrousel de la vue `3f` porte un glyphe de lecture RELOCALISÉ
depuis `galleryImageView` et une chevronnette AJOUTÉE — le nom entre dans la
liste, le plafond monte d'un seul cran.

### Corollaire de forme — nommer la SURFACE, pas le fichier

`AccessibilityValueAttributionGuardTests` tenait une liste de fichiers de
surfaces à portée. Elle tient désormais une table **surface → fichiers**,
satisfaite dès qu'un des fichiers porte le composant. Une garde qui nomme un
fichier mesure un CHEMIN ; ce qu'elle veut mesurer est une SURFACE.

Sites : `RepostAttributionGuardTests`, `MediaSaveLabelGuardTests`,
`AccessibilityValueAttributionGuardTests`, `BackgroundAnnouncementWiringGuard
Tests`, `MuteButtonExistenceGuardTests`, `StoryViewerAnchorGlyphGuardTests`,
`ReportMessageSheetPaletteTests`, `StoryRepublishWiringGuardTests`,
`StoryHeaderMetaGuardTests`, `FixedFontSizeGuardTests`,
`LocalizationConsistencyTests`, `FileSizeBudgetGuardTests`.
