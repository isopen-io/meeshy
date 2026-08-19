# Republication de story + partage en poste — plan (2026-08-19)

Demande utilisateur : « Il faut permettre la republication de story ! Actuellement
on a le partage mais il faut plutôt mettre la republication (ça ouvre le story
composeur permettant d'ajouter plus du texte). Une story se republie avec la MÊME
audience ou une audience plus restreinte, jamais une audience plus large ! Mettre
l'option partage dans le menu en haut à droite (...) sous deux formes Republier en
poste […] ou Citer en poste […] et enfin le partager qui existe déjà. »

## État constaté (lecture du code, 2026-08-19)

Beaucoup de briques existent déjà — le travail est surtout du CÂBLAGE et une
règle d'audience, pas une construction.

| Brique | État |
|---|---|
| `StoryComposerViewModel.init(reposting:authorHandle:)` — canvas prérempli avec la slide source + badge d'attribution verrouillé | **EXISTE, AUCUN site d'appel de production** |
| `StoryComposerView.init(viewModel:…)` « repost-aware » (C.1) | EXISTE |
| `StoryComposerView(initialVisibility:)` | EXISTE — mais aucun PLAFOND d'audience |
| Menu (...) → « Republier en post » (`repostAsPostDirect`) | EXISTE |
| Menu (...) → « Éditer et republier en post » (`editAndRepostAsPostSource`) | EXISTE — c'est le « Citer en poste » demandé, à renommer |
| Menu (...) → « Partager hors Meeshy » (share sheet système) | EXISTE |
| Rail → « Partager » interne (`sharedContentWrapper`, vers conversation/contact) | EXISTE, dans le RAIL et non dans (...) |
| Rail → bouton repost | EXISTE mais **un seul tap, côté serveur, sans composeur ni choix d'audience** — et son libellé affiche « Partager » (`story.viewer.action.repost`, defaultValue « Partager ») |
| Modèle d'audience | `StoryVisibility` = `PUBLIC` > `FRIENDS` > `PRIVATE` — ordre TOTAL, donc règle encodable en fonction pure |
| Gating du repost | `showsRepost: !isOwnStory && isPublicStory` — les stories FRIENDS/PRIVATE ne sont PAS republiables aujourd'hui |

## Écarts réels à combler

1. **La republication doit ouvrir le Story composer** (aujourd'hui : un tap
   serveur). Brancher le bouton du rail sur
   `StoryComposerViewModel(reposting:authorHandle:)` — la brique attend son
   premier appelant.
2. **Règle d'audience** « même ou plus restreinte, jamais plus large ». Nouvelle
   loi pure (`StoryRepostAudience`) + PLAFOND passé au composeur
   (`maximumVisibility`) pour que le sélecteur ne puisse pas élargir. Le
   `RepostRequest.visibility` existe déjà côté SDK pour la transporter.
3. **Ouvrir la republication aux stories non publiques.** La règle d'audience
   demandée implique qu'une story FRIENDS se republie en FRIENDS ou PRIVATE.
   Le gating actuel (`isPublicStory`) l'interdit — à relâcher, ce qui est un
   ÉLARGISSEMENT de portée produit à confirmer.
4. **Déplacer le partage interne du rail vers (...)**, en 3e forme, à côté de
   « Republier en poste » et « Citer en poste ».
5. **Nommage** : le libellé du repost du rail dit « Partager » ; « Éditer et
   republier en post » devient « Citer en poste ». 7 langues à mettre à jour.

## Décisions — TRANCHÉES par l'utilisateur le 2026-08-19

- **D1 — OUI, les stories FRIENDS/PRIVATE deviennent republiables**, à audience
  égale ou plus restreinte. Le gating `showsRepost: !isOwnStory &&
  isPublicStory` est donc à relâcher en `!isOwnStory`, la restriction
  d'audience prenant le relais. FRIENDS → {FRIENDS, PRIVATE} ;
  PRIVATE → {PRIVATE}.
- **D2 — Le rail GARDE un bouton, renommé « Republier »**, qui ouvre le Story
  composer. Les 3 formes de partage vont dans (...). La republication reste à
  un geste.
- **D3 — « Republier en poste » reste DIRECT (un tap)**, sans composeur : c'est
  ce qui le distingue de « Citer en poste ». Comportement actuel de
  `repostAsPostDirect` conservé tel quel.

## Ordre d'exécution proposé (TDD)

1. Loi pure `StoryRepostAudience.allowedVisibilities(source:)` + témoins
   (PUBLIC → {PUBLIC, FRIENDS, PRIVATE}, FRIENDS → {FRIENDS, PRIVATE},
   PRIVATE → {PRIVATE}) et refus de tout élargissement.
2. `maximumVisibility` sur le sélecteur du composeur + garde de source.
3. Câblage du bouton rail → composeur repost (`init(reposting:)`).
4. Transport de `visibility` dans `RepostRequest` au publish.
5. Réorganisation du menu (...) en 3 formes + libellés 7 langues.
6. Gate : suite MeeshyTests + vérification device.
