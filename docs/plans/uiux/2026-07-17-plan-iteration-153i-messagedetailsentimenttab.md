# Plan — Itération 153i (iOS) : `MessageDetailSentimentTab`

**Base** : `main` HEAD (`1841244`) · **Branche** : `claude/laughing-thompson-2ymvij`
**Thème** : Accessibilité VoiceOver (jauge de sentiment custom muette) · **édits a11y + 1 i18n**
**Gate** : CI `iOS Tests`

## Constat

Traîne `.font()`-only asséchée (140i→152i pris par PR ouvertes ; reste décoratif/déjà mûr). Passe
state-of-the-art → vraie lacune VoiceOver de l'onglet Sentiment : jauge `GeometryReader` (barre dégradée
+ curseur) **illisible**, emoji hero lu en doublon, score codé en dur, 3 éléments disjoints, 0 modifier a11y.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| emoji hero `.system(size: 56)` | **figé** (doctrine 84i/86i) + `.accessibilityHidden(true)` (décoratif) |
| jauge `GeometryReader` (barre + curseur) | `.accessibilityHidden(true)` (visuel custom muet) |
| conteneur `VStack` | `.accessibilityElement(.ignore)` + label « Sentiment » + value « <libellé>, score X.XX » |
| score `"Score : %.2f"` (codé en dur) | localisé `message-detail.sentiment.score` (defaultValue inchangé) |
| helper | `static accessibilityValueText(label:score:)` (pur, miroir `ContactCardView`) |

## Règles respectées

1. Emoji hero à taille fixe **figé** (scaling XXXL déborderait) — pas de `relative`, comme doctrine 84i/86i.
2. Libellés visibles **déjà sémantiques** (`.callout`/`.footnote`) → scalent, aucune migration de taille.
3. Élément custom non exposable → `.accessibilityHidden` + magnitude repliée dans la `value` groupée.
4. `Equatable` intact (props stockées inchangées) → `.equatable()` du call-site préservé.
5. i18n inline `String(localized:defaultValue:bundle:.main)` (pas d'édition `.xcstrings`, parité pattern existant).
6. 1 fichier, 0 logique d'analyse, 0 test neuf requis (helper pur testable si besoin).

## Étapes

1. [x] Resync `main` (`1841244`) ; contention vérifiée (140i→152i = autres surfaces → 0 conflit).
2. [x] Emoji figé + masqué ; jauge masquée ; conteneur groupé (label + value) ; score localisé ; helper pur.
3. [x] Vérifier : 1 seul `.system(size:)` restant (emoji hero, intentionnel+masqué) ; 0 test cassé.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte.

## Différé 154i+

Gros lot risqué `StoryViewerView+Content` (31 `.system`, ⚠️ i18n #1174 + piège `@State private` cross-file).
Sinon suite state-of-the-art : siblings `MessageDetail` (`MessageReactionsDetailView`,
`MessageForwardDetailView`, `MessageEditsDetailView`, `MessageTranscriptionDetailView` — 1 `.system`
chacun, à auditer pour lacunes VoiceOver réelles), ou décoratifs `ConversationBackgroundComponents` /
`ConversationAnimatedBackground` (freeze + `.accessibilityHidden` si non déjà masqués par le parent).
