# iOS UI/UX — Iteration 221i

**Date** : 2026-07-26
**Surface** : `apps/ios/MeeshyShareExtension/` (`ShareViewController.swift`, `Info.plist`)
**Axes** : localisation (i18n) — cible sans catalogue · accessibilité — rangée
tapable muette en VoiceOver
**Base** : `main` HEAD `16f819783` · Branche `claude/quirky-curie-2pvzn1`

## Contexte

Piste (a) du pointeur 220i, débloquée : le verrou #2319 (qui détenait
`ShareViewController.swift` pour la migration `NavigationStack` de 214i) est
**mergé**, et `list_pull_requests` (open) ne montre **aucune PR** touchant cette
cible. La dette avait été relevée en 214i (« la cible n'a **aucun**
`Localizable.xcstrings` propre ; ses `String(localized:)` retombent toujours sur
`defaultValue`, et trois chaînes sont crues ») et laissée ouverte comme
« chantier à part entière ».

## Défaut A — l'extension n'a aucun catalogue : elle est anglaise pour tout le monde

Une extension d'app résout `String(localized:)` contre **son propre** bundle —
dans un `.appex`, `Bundle.main` **est** l'extension, pas l'app hôte. Les 5 clés
que `ShareViewController` demandait (`share.sendTo`, `share.searchContacts`,
`share.type.video`, `share.type.file`, `share.type.location`) **existent
pourtant, traduites dans les 7 locales, dans le catalogue de l'app** — mais ce
catalogue n'est pas dans le bundle de l'extension. Résultat : chaque chaîne
retombait sur son `defaultValue` **anglais**, quelle que soit la langue de
l'appareil. Un utilisateur francophone ouvrant la feuille de partage lisait
« Send to », « Search contacts », « Video ».

Trois chaînes n'avaient même **pas de clé** : `Button("Cancel")`,
`Button("Send")`, `.navigationTitle("Share to Meeshy")`.

Et le `CFBundleDisplayName` de l'extension — « Share to Meeshy », **la chaîne la
plus visible du composant**, celle qu'iOS affiche dans la feuille de partage
système avant même que l'extension ne rende quoi que ce soit — n'était pas
localisable faute d'`InfoPlist.xcstrings`.

Enfin, `CFBundleLocalizations` de l'extension annonçait **5** locales
(`fr`, `en`, `de`, `es`, `pt-BR`) contre **7** pour l'app (`+ it`, `+ ar`) : même
traduite, une chaîne reste inatteignable si le bundle n'annonce pas sa locale.

### Correctif

1. **`MeeshyShareExtension/Localizable.xcstrings`** (neuf, `sourceLanguage: en`,
   8 clés × 7 locales). Précédent **prouvé en CI** :
   `MeeshyNotificationExtension/Localizable.xcstrings` vit exactement de la même
   façon, capté par le globbing `sources: - path: MeeshyShareExtension` de
   `project.yml` → **0 édition de `project.yml`, 0 édition de `project.pbxproj`**.
2. **Traductions reprises *verbatim* du catalogue de l'app** pour les 5 clés
   homonymes, et des clés existantes `common.cancel` / `story.viewer.action.send`
   pour « Annuler » / « Envoyer ». **Aucune terminologie neuve n'est inventée** :
   app et extension diront exactement la même chose. Seul `share.title` est une
   formulation neuve (« Partager sur Meeshy », « Auf Meeshy teilen », …).
3. **Les 3 littéraux crus** passent à `String(localized:)` sous le namespace
   `share.*` déjà utilisé par le fichier.
4. **`MeeshyShareExtension/InfoPlist.xcstrings`** (neuf) pour
   `CFBundleDisplayName`, miroir de `Meeshy/InfoPlist.xcstrings`.
5. **`CFBundleLocalizations` aligné sur l'app** (7 locales).

## Défaut B — la rangée de contact est muette et inactivable en VoiceOver

`ContactRow` est sélectionnée par un **`.onTapGesture` posé sur le `HStack`** :
ce n'est pas un `Button`. Sans élément d'accessibilité explicite, la rangée
atteint VoiceOver comme **des fragments de texte séparés** — pas de trait
`.isButton` annonçant qu'elle est activable, et un état sélectionné porté par le
**seul** `checkmark.circle.fill` + une teinte de fond (WCAG 1.4.1). Le choix du
destinataire est l'action centrale de cette feuille.

### Correctif

`.accessibilityElement(children: .combine)` (nom + statut annoncés d'un bloc,
1 arrêt au lieu de 3) et
`.accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : [.isButton])`
— l'état « sélectionné » est **localisé par iOS**, donc **0 clé neuve**. Deux
glyphes décoratifs passent `.accessibilityHidden(true)` : le `checkmark`
(redondant avec le trait) et les initiales de repli de l'avatar (« JD » lu avant
le nom complet qui suit immédiatement).

## Tests

`ShareExtensionLocalizationTests` (neuf, 6 tests). La cible étant un
`app-extension`, ses symboles sont **inaccessibles** depuis le bundle de tests →
lecture des sources et ressources sur disque, comme le fait déjà
`NavigationContainerMigrationTests`. Le test central n'est **pas** une simple
introspection : il **extrait toutes les clés `String(localized:)` du source** et
prouve que chacune est **présente dans le catalogue de l'extension** — un contrat
qui restera vrai pour toute clé ajoutée demain, et qui aurait échoué avant cette
itération pour les 5 clés existantes. S'y ajoutent : couverture des 7 locales
(catalogue + `InfoPlist`), parité `CFBundleLocalizations` app ↔ extension (lue
via `PropertyListSerialization`), absence des 3 littéraux, et les deux traits
d'accessibilité de la rangée.

## Vérification

Pas de toolchain Swift (Linux) → les 15 assertions ont été rejouées
**déterministiquement** hors Xcode (extraction de clés, lecture JSON des 2
catalogues, lecture des 2 `Info.plist`) : **15/15**. Équilibre
accolades/parenthèses/crochets **0/0/0** sur les 2 fichiers Swift. Gate réel =
CI `iOS Tests`.

## Portée

**1 fichier de production (+18/−3)**, 2 catalogues neufs (8 + 1 clés, 7 locales),
`Info.plist` +2 lignes, 1 fichier de test neuf. **0 logique / 0 réseau / 0 layout
/ 0 changement visuel** (l'extension n'est de toute façon pas encore embarquée
dans l'archive — cf. le commentaire de `project.yml`, l'App-ID de signature
n'existe pas ; le travail est donc prêt pour le jour où elle le sera).

## Clôture

- Point n° 3 du « Reste à faire » de l'analyse **214i** (catalogue de chaînes de
  `MeeshyShareExtension`) : **soldé**.
- Piste ouverte depuis 208i (« `ShareViewController.swift` : sélection contact
  état couleur-seule, manque trait `.isSelected` ») : **soldée**.

## Piste 222i+

1. **HIG — nom de l'extension** : la feuille de partage système préfixe déjà
   l'action (« Partager avec… ») ; les extensions Apple s'y affichent sous le
   **nom de l'app** (« Messages », « Mail »), pas « Share to X ». Renommer en
   « Meeshy » serait plus natif, mais c'est un **choix produit** (nom visible),
   pas un correctif — à trancher avant de le faire.
2. **`ContactRow` — cible tactile** : la rangée n'a pas de `.contentShape`, donc
   les zones vides du `HStack` ne sont pas tapables ; à vérifier avant d'y
   toucher (le `.padding()` couvre déjà l'essentiel).
3. **Arriéré de catalogue de l'app** : **1 724 des 2 586 clés** absentes de
   `Meeshy/Localizable.xcstrings` (mesuré en 220i) — itération dédiée, par
   famille de clés.
4. `VoiceProfileManageView.addSamplesSheet` (`navigationTitle` manquant),
   audit Dark Mode généralisé, `sensoryFeedback` (iOS 17+) : pistes 219i/220i
   toujours ouvertes.
