# Itération 140i — Analyse UI/UX iOS : `MyStoriesView`

**Date** : 2026-07-17
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`
**Base** : `main` HEAD (`14030ae`)
**Branche** : `claude/laughing-thompson-943hzw`
**Gate** : CI `iOS Tests`

## Contexte

`MyStoriesView` est la feuille « Mes stories » présentée depuis le tray « Moi » : liste des stories
envoyées par l'utilisateur (vignette + ancienneté + compteurs vues/j'aime/commentaires), menu d'actions
par ligne (`contextMenu` : Ouvrir, Éditer les vues, Partager, Republier, Supprimer), `swipeActions`
destructrices, mode multi-sélection avec barre de suppression en masse. Surface **fraîche** :
6 `.font(.system(size:))`, 0 `MeeshyFont.relative`, 0 commentaire doctrine.

`IncomingCallView` (envisagé d'abord) **écarté** : ses 3 `.system` restants sont tous liés à un cadre
fixe (initiale d'avatar dans cercle 110×110 ; glyphes de contrôle 28pt dans cercle de verre 70×70) — les
glyphes de contrôle ont été **explicitement figés en 79ib** (« NE PAS re-flagger »). Surface déjà mûre,
0 migration réelle.

## Constat (avant 140i)

**6 `.font(.system(size:))`** — **aucun** n'est contraint par un cadre de dimension fixe → tous migrables :
1. barre de suppression en masse `Text("Supprimer (N)")` (15 semibold, `.frame(maxWidth: .infinity)`) ;
2. titre de ligne `Text(story.timeAgo)` (15 semibold) ;
3. affordance menu `Image("ellipsis")` (16 semibold, `.padding(8)` — pas de cadre fixe) ;
4. glyphe de sélection `checkmark.circle.fill`/`circle` (22) ;
5. icône de compteur `Image(icon)` (11) ;
6. valeur de compteur `Text("\(value)")` (13 medium).

**Lacune VoiceOver réelle** : le compteur `metric(icon:value:)` rendait `Image` + `Text("\(value)")`
sans regroupement → VoiceOver annonçait **un nombre nu** (« 5 », « 3 », « 2 ») sans dire de quoi
(vues ? j'aime ? commentaires ?). L'icône SF Symbol seule ne porte aucune sémantique VoiceOver.

## Corrections appliquées (1 fichier, 0 logique)

- **6/6 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (weight préservé) : tous ces libellés et
  glyphes scalent désormais sous Dynamic Type. Aucun gel — la vignette (64pt fixe) ne porte aucune police.
- **VoiceOver — lacune comblée** : `metric(icon:value:label:)` gagne un paramètre `label` +
  `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(label)`. VoiceOver annonce désormais
  « 5 vues » / « 3 j'aime » / « 2 commentaires » au lieu de « 5 ». **3 clés i18n neuves** suffixées `.a11y`
  (`story.mine.metric.{views,reactions,comments}.a11y`), VoiceOver-only, pas d'UI visible.
- **VoiceOver — bruit retiré** : le glyphe `ellipsis` (affordance pure) reçoit `.accessibilityHidden(true)`
  — les actions sont déjà exposées via le rotor du `contextMenu` et les `swipeActions`.

Accessibilité déjà en place → **intacte** : boutons de toolbar labellisés (Créer, Sélectionner/Annuler),
barre de suppression en masse déjà `.accessibilityLabel` + `.accessibilityHint`, glyphe de sélection déjà
`.accessibilityHidden` (état coche transmis par le trait `.isSelected` de la ligne). Palette déjà
tokenisée (`MeeshyColors.error`, `theme`/`accentColor`, `.secondary`) → **0 swap**. `import MeeshyUI`
déjà présent.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique métier, 0 mutation d'état, 0 test neuf. Le seul changement de signature
  (`metric` gagne `label:`) est interne à `MyStoryRow` (`private`), 3 sites d'appel mis à jour.
- Aucun test ne référence `MyStoriesView` → aucune régression de test.
- Clés `.a11y` suivant le pattern inline `String(localized:defaultValue:)` du fichier (les `story.mine.*`
  existantes ne sont pas non plus pré-enregistrées dans `Localizable.xcstrings` — extraction au build).

## Statut

**TERMINÉE** — `MyStoriesView` Dynamic Type + VoiceOver soldé (6/6 polices → `relative` ; compteurs
labellisés ; ellipsis masqué). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `MyStoriesView` — 6/6 `.font(.system(size:))` → `MeeshyFont.relative` (aucun gel, aucune police liée à
  la vignette 64pt fixe) ; VoiceOver = compteurs vues/j'aime/commentaires labellisés
  (`.accessibilityElement(.ignore)` + `.accessibilityLabel`, 3 clés `.a11y` neuves) + ellipsis
  `.accessibilityHidden` ; palette tokenisée 0 swap. **SOLDÉ 140i.**
- `IncomingCallView` — **écarté 140i** (déjà mûr) : 3 `.system` restants tous en cadre fixe (initiale
  avatar cercle 110×110 ; glyphes de contrôle 28pt cercle de verre 70×70, figés en 79ib). Texte déjà
  sémantique (`.title`/`.callout`/`.caption2`). Ne pas re-flagger.
