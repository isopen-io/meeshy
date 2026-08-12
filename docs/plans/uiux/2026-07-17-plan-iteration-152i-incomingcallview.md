# Plan Itération 152i — `IncomingCallView` (Dynamic Type freeze + dead-code cleanup)

**Date** : 2026-07-17 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `dda190e`
**Branche** : `claude/laughing-thompson-ir2m79` · **Gate** : CI `iOS Tests`

## Objectif

Solder l'audit Dynamic Type + a11y de `IncomingCallView` (écran d'appel entrant) et retirer une propriété
morte. Surface fraîche, 0 contention (essaim 140i→151i cible d'autres vues).

## Étapes

1. **Retirer le code mort** : propriété calculée `theme` inutilisée (référée seulement dans un commentaire).
2. **Figer les 3 glyphes** bornés par conteneurs de dimension fixe + commentaires doctrine 82i :
   - initiale d'avatar (cercle fixe 110×110, décorative + déjà `accessibilityHidden` via ring parent) ;
   - `phone.down.fill` (cercle bouton fixe 70×70, Button labellisé) ;
   - `video.fill`/`phone.fill` (cercle bouton fixe 70×70, Button labellisé).
3. **Ne rien migrer en `relative`** : tous les vrais libellés texte utilisent déjà des polices sémantiques
   scalables (`.title`, `.callout`, `.caption2`).
4. **Ne pas toucher** : a11y (labels/hints/screenChanged déjà en place), palette (tokenisée + `.white`
   fixe intentionnel), animations (reduceMotion déjà respecté).

## Contraintes

- 1 fichier, 0 logique, 0 test neuf, 0 clé i18n, 0 swap palette.
- Numéro 152i strictement > 151i (le plus haut en vol, `EditProfileView` #1988).

## Vérification

- Grep : 0 usage compilé de `theme` restant (comment-only).
- Grep : 3 `.font(.system(size:))` conservés, chacun commenté doctrine 82i.
- CI `iOS Tests` verte.
