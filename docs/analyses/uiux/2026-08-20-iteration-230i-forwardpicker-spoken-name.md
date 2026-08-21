# Iteration-230i — `ForwardPickerSheet` : le nom prononcé n'était pas le nom affiché

**Date** : 2026-08-20
**Piste** : iOS (suffixe `i`)
**Surface** : `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift`
**Base** : `main` HEAD `3ccd8a72`
**Branche** : `claude/intelligent-noether-kana7q`

## Pourquoi cette surface

Le picker de transfert est arrivé en **août 2026** (spec
`docs/superpowers/specs/2026-08-19-media-forward-reliability-and-more-menu-design.md`,
commits `62068b47`, `5d0c490d`, `3ee71d5a`). Toutes les analyses de la piste
s'arrêtent au **2026-07-27 / 229i** : cet écran n'a **jamais** été audité par
la routine UI/UX. Il n'apparaît dans aucune PR ouverte au moment du choix
(`list_pull_requests` : seule PR iOS en vol = #3217, qui touche
`AudienceUserPickerView`, `MentionSuggestions`, `ProfileSheetUser`,
`JoinFlowViewModel`, `NotificationToastManager`, `SharedAVPlayerManager`,
`ImageEditorViewModel`, `VoiceProfileWizardView` — **0 collision**).

L'écran est par ailleurs déjà très soigné : cache-first, `LazyVStack`,
`.equatable()` sur la rangée, `EmptyStateView` distinguant l'échec de
chargement de la liste vide, raison d'échec affichée par cible, `.searchable`
natif, tokens de couleur. Un seul défaut objectif en est ressorti — mais il
porte sur l'**action primaire** de l'écran.

## Le défaut

La rangée affiche `conv.displayName` :

```swift
ForwardPickerRow(
    id: conv.id,
    name: conv.displayName,      // ← ce que l'utilisateur VOIT
    …
    a11yName: conv.title ?? String(localized: "forward.this-conversation",
                                   defaultValue: "cette conversation"),  // ← ce que VoiceOver DISAIT
```

`Conversation.displayName` (SDK, `CoreModels.swift:353`) vaut
`userState.customName ?? title ?? identifier` — **jamais nul**. `title` est
`String?` et ne connaît ni le renommage local, ni les conversations directes.
Deux conséquences distinctes, toutes deux sur les boutons d'envoi / de réessai
de chaque ligne :

### 1. Rupture « Label in Name » (WCAG 2.5.3)

Une conversation renommée localement s'affiche « Maman » et s'annonçait
« Transférer à Groupe famille ». Sous **Voice Control**, la commande naturelle
— « Appuyer sur Transférer à Maman » — ne correspondait à aucun libellé et ne
commandait donc rien. Le critère 2.5.3 exige précisément que le nom accessible
CONTIENNE le texte visible.

### 2. Cibles indiscernables à l'oreille — le défaut grave

`title` est **nul pour les conversations directes** — le repo le documente
lui-même ailleurs : « `conv.title` brut, `nil` pour une conversation directe »
(`ShareConversationStoreTests.swift:83`). Or les conversations directes sont
l'essentiel d'un picker de transfert. Toutes leurs lignes tombaient donc sur le
même repli, et **tous leurs boutons d'envoi annonçaient la même chose** :

> « Transférer à cette conversation », « Transférer à cette conversation »,
> « Transférer à cette conversation », …

Un utilisateur VoiceOver parcourant la liste ne pouvait plus savoir **à qui**
il s'apprêtait à transférer un message. Sur un écran dont l'action primaire est
« choisir une cible », c'est l'action primaire elle-même qui devenait
inutilisable — et l'erreur est silencieuse et irréversible : le message part.

Le mode multi-sélection ne rattrapait rien : la barre basse annonce
« Envoyer (3) » sans nommer les trois cibles.

## Le correctif

Ne pas corriger la valeur : **supprimer la possibilité de la divergence**.

`a11yName` était une seconde entrée de nom là où la rangée en a déjà une, et
c'est cette dualité qui a permis aux deux de s'écarter. Le paramètre est retiré
du type ; les deux libellés se composent depuis `name` — la valeur affichée —
via deux helpers purs :

```swift
static func sendAccessibilityLabel(name: String) -> String
static func retrySendAccessibilityLabel(name: String) -> String
```

Bénéfices en cascade :

- le nom prononcé **est** le nom affiché, par construction — plus par vigilance ;
- `ForwardPickerRow` perd un paramètre et son `==` un terme redondant (`name`
  le couvrait déjà) — le portillon `.equatable()` reste strictement aussi fin ;
- les libellés deviennent **testables** hors hôte SwiftUI (idiome 208i,
  `reelCardAccessibilityLabel(for:)`) ;
- la clé `forward.this-conversation` — un repli qui ne nommait aucune cible —
  disparaît du catalogue, 7 locales comprises.

Fait notable : le test d'égalité existant passait déjà `a11yName: name`.
La valeur naturelle était connue ; seul le site de production s'en écartait.

## Vérification

Aucune toolchain Swift sous Linux — le gate réel est la CI `iOS Tests`.
Contrôles déterministes effectués :

- **Tests de comportement** (`ForwardPickerSpokenNameTests`, 6 assertions) : le
  libellé porte le nom de la cible ; **deux cibles distinctes produisent deux
  annonces distinctes** (la régression du défaut 2 — avant, elles étaient
  identiques) ; envoi ≠ réessai. Assertions par `contains`, robustes à la
  locale : les 7 traductions de `forward.send-a11y` / `forward.retry-send-a11y`
  portent toutes `%@`, et leurs valeurs `en`/`fr` diffèrent bien entre elles.
- **Test de câblage** : `ForwardPickerSheet.swift` doit contenir
  `name: conv.displayName` et **ne plus contenir** `conv.title`
  (idiome `AppSourceGuard.stripComments`, précédent `WindowMetricsSSOTTests`).
- **Clé morte** : `test_everyAppCatalogIdentifierKeyIsReferencedInCode`
  (`LocalizationConsistencyTests`) rougirait si la clé restait au catalogue
  sans site d'appel → suppression chirurgicale de ses 47 lignes (JSON revalidé,
  3218 → 3217 clés, aucune autre ligne du catalogue touchée). La clé n'est
  citée par aucune liste de dette (`FrenchDefaultValueRatchetTests`).
- **Clés conservées** : `forward.send-a11y` et `forward.retry-send-a11y` sont
  présentes dans les 7 locales (`ar`, `de`, `en`, `es`, `fr`, `it`, `pt-BR`) —
  0 clé i18n neuve.
- **Équilibre syntaxique** des 3 fichiers Swift au tokenizer (accolades /
  parenthèses / crochets : 0 / 0 / 0 hors littéraux).
- `ForwardPickerRow` n'a que **2 sites de construction** (production + test),
  tous deux mis à jour ; `grep a11yName` = 0 occurrence résiduelle.

## Bilan

**1 fichier de production** (−1 paramètre, −1 terme de `==`, +2 helpers purs),
**1 fichier de test mis à jour**, **1 fichier de test neuf**, **1 clé de
catalogue retirée**. 0 clé i18n neuve · 0 changement visuel · 0 logique ·
0 réseau · 0 SDK.

## Suites (231i+)

1. **`ForwardPickerRow` : la sélection de ligne n'est pas exposée à VoiceOver.**
   Le tap de ligne — moitié « multi-sélection » du design hybride — passe par
   `.contentShape(Rectangle())` + `.onTapGesture`, et non par un `Button` : le
   seul contrôle atteignable par les technologies d'assistance reste le bouton
   d'envoi immédiat en fin de ligne. Le trait `.isSelected` est par ailleurs
   posé sur la racine de la rangée, qui n'est pas elle-même un élément
   d'accessibilité. **À arbitrer sur simulateur** (l'avatar porte son propre
   `onMoodTap` : l'envelopper dans un `Button` perdrait ce geste) — c'est
   pourquoi ce n'est pas traité ici.
2. **`forward.members-count` grave sa règle de pluriel** :
   `String(format: "• %d membres", memberCount)` rend « • 1 membres » à
   `memberCount == 1`, et la variation ne peut pas être choisie par le
   catalogue puisque le compte n'est pas passé au moment de la résolution. La
   clé existe au catalogue en 7 locales à plat — le correctif est une
   conversion en `variations.plural` + l'idiome d'interpolation ratifié par
   `PostStatAccessibility`. Défaut de la même famille que 185i/226i, à traiter
   pour lui-même. **L'arabe y perd le plus** (6 formes plurielles).
3. Les mêmes questions sur les frères du picker jamais audités du même lot
   d'août 2026 : `MessageMoreSheet` (504 l.), `ForwardPickerModel`,
   `MessageActionResolver`.
