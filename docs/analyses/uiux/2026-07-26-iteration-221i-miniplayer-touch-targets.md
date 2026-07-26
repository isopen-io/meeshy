# iOS UI/UX — Iteration 221i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MiniAudioPlayerBar.swift`
**Axe** : HIG / accessibilité motrice — cibles tactiles 44×44 pt
**Base** : `main` HEAD `242a82c50`
**Essaim** : 20 PR ouvertes ; `search_pull_requests … MiniAudioPlayerBar` → **0 résultat**
⇒ surface non contestée

## Le défaut

Le mini-lecteur audio est une **barre persistante** : elle flotte au-dessus de
l'app tant qu'un audio de conversation joue. Ses trois commandes de transport
sont donc parmi les contrôles les plus exposés de l'app.

Les trois portent `.buttonStyle(.plain)`. C'est le point clé : ce style
**n'ajoute aucun padding**, donc la région tactile d'un `Button` est
**exactement** le `frame` de son label. Le `frame` *est* la cible tactile.

| Contrôle | Frame (= cible) | Plancher HIG | Écart |
|---|---|---|---|
| Lecture / Pause | 32 × 32 | 44 × 44 | −27 % de côté |
| Suivant | 28 × 28 | 44 × 44 | −36 % |
| **Fermer** | **24 × 24** | 44 × 44 | **−45 %** |

La règle n'est pas seulement celle d'Apple : `apps/ios/CLAUDE.md` l'énonce déjà
noir sur blanc — « Minimum touch target: 44x44pt (Apple HIG requirement) ».

### Pourquoi c'est plus grave que trois nombres trop petits

1. **Le pire des trois est le plus destructeur.** À 24 pt, « Fermer » coupe la
   lecture en cours. C'est le contrôle le plus dur à viser et celui dont le
   ratage coûte le plus cher.
2. **Ils sont épaule contre épaule.** Trois cibles sous-dimensionnées alignées :
   un doigt qui manque « Suivant » ne tombe pas dans le vide, il tombe sur
   « Fermer » ou sur « Pause ». Des cibles trop petites *adjacentes* ne
   s'additionnent pas, elles se piègent mutuellement.
3. **Accessibilité motrice.** Tremblement, mobilité réduite, usage en marche ou
   en transport : 24 pt est hors de portée fiable. Le VoiceOver de cette barre
   est irréprochable (les trois `.accessibilityLabel` sont localisés, le cluster
   now-playing est un élément unique avec action) — c'est précisément ce qui
   rend le trou révélateur : la passe **lecteur d'écran** a été faite, la passe
   **motrice** ne l'a jamais été.

### Le précédent existait déjà dans le fichier voisin

`MiniAudioPlayerBar` se documente lui-même, l. 196 :

> `// Same atom + pattern as the floating call pill.`

Or `FloatingCallPillView` dimensionne ses **trois** commandes
(`muteButton`, `speakerButton`, `hangupButton`) à `.frame(width: 44, height: 44)`
— glyphe piloté par la police, boîte à 44. La barre revendiquait donc un patron
qu'elle n'appliquait pas. 221i rend la phrase vraie.

## Correctif

Les trois `frame` passent à `44 × 44`, **glyphes inchangés** (leur taille vient
de `.font(...)`, pas du frame) — exactement l'idiome du call pill.

Les trois boutons sont regroupés dans un `HStack(spacing: 0)`. Ce n'est pas
cosmétique, c'est ce qui rend le correctif gratuit en largeur :

- **Avant** : `32 + 10 + 28 + 10 + 24` = **104 pt** de cluster.
- **44 pt avec l'ancien `spacing: 10`** : `44+10+44+10+44` = **152 pt** (+48).
- **44 pt avec `spacing: 0`** : `44 × 3` = **132 pt** (+28).

Et le rythme visuel ne bouge quasiment pas : un symbole SF d'environ 14 pt
centré dans 44 pt laisse ~15 pt de blanc de chaque côté, contre ~9 pt de blanc
+ 10 pt d'espacement = ~19 pt auparavant entre deux bords de glyphes… soit
~30 pt entre glyphes avant comme après. **Les boîtes de 44 pt sont devenues
l'espacement.**

## Impact visuel (assumé, non nul)

Contrairement aux itérations précédentes, celle-ci **n'est pas** un no-op visuel,
et il serait malhonnête de le prétendre :

- **Largeur** : le cluster gagne 28 pt, pris sur le titre de piste — qui est
  `.lineLimit(1)` et tronque déjà. Le titre tronquera ~28 pt plus tôt.
- **Hauteur** : la rangée était haute de `max(36 avatar, VStack méta, 32)` ;
  elle devient `max(…, 44)`. La capsule peut gagner jusqu'à ~8 pt.

C'est le prix explicite de la conformité HIG, et c'est exactement la hauteur
qu'occupe déjà le call pill voisin — les deux barres flottantes s'alignent donc
au lieu de diverger.

## Vérification

- Pas de toolchain Swift sous Linux → 7 assertions vérifiées par correspondance
  de chaînes ; **RED prouvé 5/6** contre `main` `242a82c50` (la 6ᵉ — le
  précédent du call pill — passait déjà, c'est ce qui en fait un précédent).
  **GREEN 7/7**.
- Équilibre accolades / parenthèses / crochets des 2 fichiers au tokenizer :
  **0 / 0 / 0**.
- Avatar `36 × 36` **non touché** : ce n'est pas un contrôle, c'est le visuel du
  cluster now-playing, lequel est déjà un seul élément tappable/VoiceOver dont
  la hauteur de rangée passe justement à 44.
- Gate réel = CI `iOS Tests`.

## Test

`MeeshyTests/Unit/Components/MiniAudioPlayerBarTests.swift` est **étendu**
(pas dupliqué) : la suite comportementale du mini-lecteur existait déjà, la
doctrine tactile lui appartient. 3 tests neufs (14 au total) :

1. les trois commandes portent une cible de 44×44 et **aucun** frame sous-44 ne
   subsiste ;
2. le cluster est en `spacing: 0` (les cibles fournissent l'espacement) ;
3. le précédent `FloatingCallPillView` reste lui-même au plancher — un
   verrou croisé, pour que la phrase « same pattern as the floating call pill »
   ne redevienne pas fausse par dérive de l'un ou de l'autre.

## Piste ouverte (222i+)

Le scan a relevé **18 frames de bouton sous 44 pt sur 13 fichiers**. Les plus
nets après celui-ci : `MessageOverlayMenu:1028` (**14 × 14**),
`CommentMediaView:33` (18 × 18), `ConversationListHelpers:375` (34),
`FriendRequestListView:184/195` (36), `MyStoriesView:162` (32),
`StoryViewerContainer:175` (32). Chacun demande la même analyse au cas par cas
(certains sont peut-être enveloppés d'un `.contentShape` plus large ou d'un
parent tappable) — ne pas les convertir en masse sans lire le contexte.
