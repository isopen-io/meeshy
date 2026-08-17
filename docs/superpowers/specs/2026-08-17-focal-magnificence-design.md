# La Magnificence Focale — loupe continue, fond accentué, Lire plus

**Date** : 2026-08-17 · **Statut** : approuvé (design validé en session, choix user :
amplitude forte ~1.18, seuil 12 lignes, sheet grande hauteur)
**Périmètre** : iOS (mode Focal). La loi de courbe gelée partagée
(`packages/shared/utils/focus-curve.ts` ↔ `FocalFocusCurve.swift`) n'est PAS
modifiée — même précédent que le retrait du fondu d'alpha (écart iOS assumé,
zéro collision avec le chantier web V4 en cours).

## Problème

1. L'élu n'était magnifié qu'À L'ARRÊT (reconfigure typographique 15→16 au
   scroll stop) : pendant le défilement il restait à l'échelle de la courbe
   (1.0 max), puis SAUTAIT de taille à la pose — le « pas parfait » constaté.
2. L'élu était signalé par une carte à BORDURE (désactivée depuis, sur
   demande) : le user veut un FOND accentué, jamais un bord.
3. Un message plus grand que l'écran ne peut être ni magnifié ni posé entier
   au-dessus du composeur — et sa lecture dans le fil est pénible.

## 1. La loupe continue

La magnification est un **terme de courbe positionnel**, pas un événement
d'élection : `magnification(d) = 1 + (A − 1) · smoothstep(1 − |d|/R)` où `d`
est la distance SIGNÉE du centre de rangée à la ligne de focus,
`A = 1.18` (pic, `FocalPassConstants.magnificationPeak`) et
`R = 2 × FocalFocusCurve.focusBandHalfHeight` (rayon, dérivé — jamais un
littéral rival). Composée MULTIPLICATIVEMENT par-dessus la courbe gelée dans
`FocalPerspectiveGeometry.transform` : à `d = 0` → 1.18 ; à `|d| = R` →
retombée exacte sur la courbe gelée ; C1 partout (smoothstep). Sous la bande
(`d < 0`, courbe = 1) la loupe décroît symétriquement.

- **Ancrage inchangé** : bas de rangée fixe (la croissance part vers le
  haut, jamais sous le composeur), pivot horizontal 18 %.
- **zPosition** : le pass écrit `layer.zPosition = (m − 1) × 1000` (0 → 180)
  pour que la rangée magnifiée RECOUVRE ses voisines. Champ ajouté à
  `FocalCellTransform`, remis à 0 au reset/recyclage.
- **Réserve trailing** (aucun clip, jamais) : pour qu'une rangée pleine
  largeur magnifiée à `A` tienne dans l'écran avec pivot `p = 0.18` et inset
  leading `L = 12` : `L + Wc·(p + (1−p)·A) ≤ W` ⇒
  `Wc ≤ (W − L)/(p + (1−p)·A)`. À `W = 390` : `Wc ≤ 329` ⇒ réserve trailing
  ≈ **49 pt** (le « ~30 pt » du design conversationnel était une estimation
  basse — la formule fait foi, exposée par une fonction pure
  `magnifiedTrailingReserve(viewportWidth:)` et appliquée par le provider de
  section en mode Focal uniquement ; `.bubbles` garde 12). Côté leading, le
  débord du pivot (−11.3 pt) tient dans l'inset de 12.
- **Le reconfigure typographique 15→16 au scroll stop DISPARAÎT** (c'était le
  saut). La garde source `test_typographyReconfigure_…` (déjà rouge,
  pré-existant) est supprimée avec le mécanisme.

## 2. Le fond accentué

`FocalFocusDecoration` : FINI le chemin bordure — un **fond plein** teinte
accent de la conversation, opacité ~0.12 (sombre) / ~0.09 (clair), coins
arrondis continus, AUCUN trait. Suit l'élection (hystérésis gelée) en
continu, défilement compris, fondu doux à l'entrée/sortie. La garde
« entièrement visible » ne s'applique plus au fond (un fond coupé par le
bord d'écran est naturel ; elle protégeait un CADRE ouvert).

## 3. « Lire plus »

- Tout texte Focal rendu au-delà de **12 lignes** est tronqué
  (`lineLimit(12)`) avec un bouton « Lire plus » teinté accent. Détection de
  troncature par MESURE réelle (double rendu texte caché, jamais un compte de
  caractères — Dynamic Type). Le cap vaut pour TOUTES les rangées, élu
  compris : c'est lui qui en a le plus besoin (magnification + atterrissage).
- Tap → **sheet grand detent** : en-tête expéditeur + heure, contenu
  intégral **directement scrollable** dans la langue du Prisme (le même
  texte effectif que la rangée), drapeaux en pied, fermeture au swipe.
- Câblage : `FocalRowActions.onReadMore(localId)` → `ConversationView`
  présente `FocalReadMoreSheet`.

## Garde-fous

Pass toujours pur compositor (bump + zPosition = écritures de layer, zéro
allocation, zéro relayout par frame). Compensation d'offset (cd0eab511) et
atterrissage d'élection composent sans changement. Tests : loi du bump
(pic, symétrie, retombée exacte à |d|=R, C0), réserve (formule + application
par mode), plan de décoration (fond sans trait), cap 12 lignes, sheet
(contenu = texte effectif Prisme), gardes de câblage. Vérification
simulateur frame par frame (deux sens + pose).

## Phases d'implémentation

1. **Loupe** : loi pure + transform + zPosition + réserve + retrait du
   reconfigure typographique.
2. **Fond** : décoration fill accent, retrait de la garde de pleine
   visibilité pour le fond.
3. **Lire plus** : cap + détection + bouton + sheet + câblage.

Chaque phase : RED → GREEN → suites voisines → simulateur.
