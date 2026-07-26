# Plan — iOS UI/UX Iteration 218i

**Objet** : localiser les retours de mise en favori d'une publication et les
consolider sur trois clés partagées, entièrement traduites.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-218i-bookmark-feedback-i18n.md`
**Base** : `main` HEAD `ffef1339e` · **Branche** : `claude/quirky-curie-gxwr9m`
**Numérotation** : 218i — 217i était déjà revendiqué par #2344 (haptics onboarding) au moment de pousser ; strictement > tout numéro en vol

## Étapes

- [x] Resync depuis `origin/main` après merge de 216i
- [x] Audit d'adoption native : `PhotosPicker` (0 legacy), `.refreshable`,
      `.confirmationDialog` déjà adoptés ; champs de recherche faits main
      écartés (refonte visuelle, décision produit)
- [x] Balayage i18n : 69 chaînes visibles sur 13 fichiers utilisent une phrase
      française comme clé, absente du catalogue → rendues en français partout
- [x] Cible choisie : le cluster favoris (non traduit **et** triplé sur 3 fichiers)
- [x] 3 clés `post.bookmark.*` ajoutées au catalogue, 7 locales, vocabulaire
      repris de `a11y.post.bookmark_add/remove`
- [x] 9 sites d'appel migrés ; littéral nu de `PostDetailView` enveloppé
- [x] Test neuf lisant le catalogue (4 tests / 35 assertions)
- [x] RED 35/35 prouvé contre `main`, GREEN 35/35
- [x] Diff catalogue vérifié strictement additif (+138/−0), JSON re-parsé
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Tester le catalogue, pas la forme de la clé.** Renommer `"Retire des favoris"`
en `post.bookmark.removed` ne traduit rien par soi-même : le dépôt contient déjà
des clés namespacées absentes du catalogue (`profile.save.error`), qui rendent
donc leur `defaultValue`. Ce qui localise, c'est l'entrée traduite. Le test
échoue donc si une locale manque ou n'est pas `state: "translated"` — pas si la
clé « a l'air » propre.

**Traduire depuis le vocabulaire du catalogue.** `a11y.post.bookmark_add` fixe
déjà le terme par langue (« Lesezeichen », « favoritos », « preferiti »,
« المفضلة »). Les toasts en reprennent la forme au participe passé plutôt que
d'introduire un synonyme concurrent.

**Splice textuel du `.xcstrings`, pas de re-sérialisation.** Un
`json.dump` réécrivait les 29 000 lignes du catalogue (14 557 insertions) pour
3 clés. Les entrées sont donc insérées au niveau du texte, dans le style
dominant du fichier (1364/1365 entrées), et le résultat est re-parsé : **+138/−0**.

**Périmètre : un cluster, pas les 69 chaînes.** Le cluster favoris est traité en
entier (les 3 fichiers, les 9 sites) plutôt que d'effleurer les 13 fichiers. Les
suivants sont listés par valeur décroissante dans l'analyse.

## Suites (219i+)

1. `RootView` + `iPadRootView+Navigation` — erreurs de deep-link dupliquées
   verbatim entre les deux fichiers (11 chaînes).
2. `AudioPostComposerView` (15 chaînes).
3. `FeedView` restantes (18) + `FeedView+Attachments` (6).
4. `StoryViewerView+Content.shareStory()` — dernier parcours de fenêtres
   impératif, quand la surface story refroidit (hérité de 216i).
