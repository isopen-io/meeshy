# Plan Iteration-223i — BubbleQuotedReply decorative-glyph VoiceOver hide

## Objectif

Masquer à VoiceOver les 2 SF Symbols décoratifs de `BubbleQuotedReply`
(glyphe d'aperçu de pièce jointe + `camera.fill` de l'aperçu story), accolés à
un texte porteur du sens. Doctrine 196i/213i/214i.

## Base

- Branche de travail : `claude/laughing-thompson-e0cc99` (214i mergée → resync)
- Base : `main` HEAD `d68e781`
- Itération : **223i** (strictement > 222i, plus haut en vol ; 215i déjà pris par
  #2343, 217i–222i en vol).

## Étapes

1. [x] Resync `main` (214i mergée #2334, incl. mon fix compile repost).
2. [x] `list_pull_requests` → `BubbleQuotedReply` absent (0 collision).
3. [x] Confirmer les 2 glyphes décoratifs (l.125 pièce jointe, l.287 story) +
   0 `.accessibilityHidden` sur `main`.
4. [x] Ajouter `.accessibilityHidden(true)` sur chaque `Image` décoratif ;
   laisser `storyMetric` (informatif) intact.
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit + push `claude/laughing-thompson-e0cc99` + PR.

## Portée

1 fichier iOS, +7 lignes (5 commentaire), 0 clé i18n, 0 logique / 0 réseau /
0 layout / 0 visuel / 0 test neuf. Gate = CI `iOS Tests`.

## Non-objectifs

- Pas de touche aux icônes `storyMetric` (informatives → label+value = piste 224i+).
- Pas de regroupement `.combine` des aperçus (changement plus large).
