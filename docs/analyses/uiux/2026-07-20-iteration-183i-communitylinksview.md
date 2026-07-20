# Iteration-183i — CommunityLinksView : action VoiceOver « Copier le lien » inaccessible

**Date** : 2026-07-20
**Piste** : iOS (suffixe `i`)
**Surface** : `apps/ios/Meeshy/Features/Main/Views/CommunityLinksView.swift`
**Type** : Accessibilité (VoiceOver — action secondaire sur rangée navigable)

## Contexte

`CommunityLinksView` liste les communautés administrées par l'utilisateur. Chaque
rangée (`communityLinkRow`) est enveloppée dans un `NavigationLink` vers
`CommunityLinkDetailView`, et contient — en plus du texte — un `Button`
« Copier le lien » (glyphe `doc.on.doc`) qui copie l'URL d'invitation dans le
presse-papiers.

Écran **vierge** vis-à-vis de l'essaim : aucune PR ouverte ne modifie ce
fichier (seul `CommunityLinkDetailView` — la vue **détail** — a été traité en
171i). Les notes d'autres PR le citent comme « twin déjà poli » ou candidat
futur (rotor de titres, dédup d'état vide) — aucune ne touche la rangée.

## Défaut réel identifié

**Le `Button` « Copier le lien » est imbriqué à l'intérieur du `NavigationLink`
de la rangée.** En SwiftUI, un `NavigationLink` absorbe l'intégralité de son
label comme **un seul élément** pour VoiceOver (trait lien). Conséquence : le
bouton imbriqué **n'est jamais atteignable au clavier / VoiceOver** — un
utilisateur VoiceOver ne peut pas copier le lien d'invitation d'une communauté.
Le `.accessibilityLabel` posé sur ce bouton (« Copier le lien ») était donc
mort : jamais exposé, car le bouton n'est pas un élément d'accessibilité
distinct.

Défauts secondaires sur la même rangée :
- Le nom + le sous-titre (`X membres · identifiant`) étaient exposés comme deux
  fragments de texte non groupés au lieu d'un libellé cohérent.
- Aucun `.accessibilityHint` sur la destination de navigation.

Doctrine : parité avec 181i (`KeypadTab` — « split result-row interactive
controls for VoiceOver »), mais via la voie **native recommandée par Apple**
pour une action secondaire sur une rangée navigable :
`.accessibilityAction(named:)` (précédent app : `ConversationListView+Rows`,
`RootView`, `StoryViewerView+Canvas`…).

## Correctif

Périmètre strict : `communityLinkRow(_:)` uniquement.

1. Extraction de la logique de copie dans un helper `copyJoinLink(_:)`
   (`UIPasteboard.general.string = link.joinUrl` + `HapticFeedback.success()`),
   appelé à la fois par le `Button` visible et par l'action VoiceOver — SSOT,
   pas de duplication.
2. Le `Button` visible reste **pour le tactile / pointeur** mais est masqué à
   VoiceOver (`.accessibilityHidden(true)`) : le glyphe dupliqué et le bouton
   mort disparaissent de l'arbre d'accessibilité.
3. La rangée devient un élément unique (`.accessibilityElement(children:
   .combine)`) → VoiceOver annonce « {nom}, {n} membres · {identifiant} », trait
   lien fourni par le `NavigationLink`.
4. Ajout d'un `.accessibilityHint` (destination) et — crucial — d'une
   `.accessibilityAction(named: "Copier le lien")` **ré-exposant l'action de
   copie** sur l'élément combiné. Les utilisateurs VoiceOver récupèrent l'action
   via le rotor « Actions ».

**0 changement visuel** (le bouton, le chevron, la géométrie et les polices sont
inchangés). Polices déjà en `MeeshyFont.relative` → Dynamic Type déjà correct,
aucune migration. `chevron.right` et les glyphes décoratifs restent masqués.

## Clés de localisation

- **Réutilise** `common.copyLink` (« Copier le lien ») — déjà présente (ex-label
  du bouton).
- **1 clé neuve inline** : `community.links.row.open.a11y`
  (« Ouvre les détails de la communauté ») — `defaultValue` inline, 0 churn
  `.xcstrings`.

## Portée

- **1 fichier source** : `CommunityLinksView.swift`.
- iOS uniquement. Aucun changement Android / Web / Backend / SDK.
- 0 logique produit modifiée (la copie et la navigation sont identiques),
  0 test neuf.

## Vérification

- Revue statique contre le précédent `.accessibilityAction(named: String(...))`
  de `ConversationListView+Rows.swift` (même overload, iOS 14+).
- `.accessibilityElement(children:)`, `.accessibilityHint`, `.accessibilityAction`
  sont iOS 14+ / 16+ — sous le plancher app (iOS 16). Aucun garde de
  disponibilité.
- Aucun test ne référence `CommunityLinksView` (`grep` MeeshyTests /
  MeeshyUITests / MeeshySDKTests = 0).
- Gate = CI `iOS Tests` (compile + run macOS runner). Build/VoiceOver confirmés
  en CI (auteur en conteneur Linux).

## Statut

✅ **Résolu** — l'action « Copier le lien » de chaque rangée de
`CommunityLinksView` est désormais atteignable par VoiceOver (action custom
native), la rangée est groupée et annonce sa destination. Ne plus re-flagger ce
défaut.

### Pistes restantes (hors périmètre 183i, à vérifier collision essaim)
- `ProgressView()` (ligne ~108) comme état de chargement cold-start : viole le
  principe Instant App (« SkeletonPlaceholder, pas de spinner ») — candidat
  dédié.
- État vide « hand-rolled » (bloc inline) → dédup vers `EmptyStateView` (parité
  BlockedTab 179i #2111 / ShareLinksView 176i #2096).
- Rotor de titres (`.isHeader` déjà posé sur les 2 en-têtes ; rotor OK).
- Pluralisation FR de `community.links.row.subtitle` (« 1 membres »).
