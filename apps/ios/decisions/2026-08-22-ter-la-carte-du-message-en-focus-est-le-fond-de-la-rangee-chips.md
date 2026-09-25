## 2026-08-22 (ter) : la carte du message en focus est le FOND de la rangée — chips consolidées sur ses lignes ; reconfiguration différée et coalescée

**Statut**: Accepté (retour utilisateur capture d'écran : « les icônes en bordure ne restent pas à leur place… les lignes doivent venir englober ces boutons exactement comme pour la liste »)

**Décision**:
1. **Carte = fond SwiftUI du bloc de contenu** (`FocalRow.focusCardBackground`, mêmes cotes que `focusCardInsets` : `focusCardInnerMargin` en haut/bas, `focusCardHorizontalInset` du bord). La carte UIKit bornée à la CELLULE (`showFocusCard`) n'est plus montrée pour la rangée plate : tant que la cellule n'était pas posée (hauteur estimée), son trait dérivait de 4–12 pt des chips SwiftUI. Carte, chips (`FocusStrip.overhang` = demi-chip + marge) et identité (`identityOverhang`) partagent désormais le même repère — consolidées en mouvement comme au posé, le trait continue derrière les chips opaques comme l'encoche de la liste.
2. **`syncFocalFocusDetails()` ne fait JAMAIS d'`apply` synchrone** : appelée depuis des complétions d'`apply` (pose, aplatissement) et depuis le tick d'élection — qui peut tourner dans la complétion de l'apply de reconfiguration — un apply imbriqué fait abandonner UIKit (`BUG_IN_CLIENT_OF_DIFFABLE_DATA_SOURCE__APPLYING_SNAPSHOTS_REENTRANTLY…`, crash reproduit au simulateur). Elle est différée au tour suivant de la boucle principale, coalescée (`focalDetailsSyncScheduled`), un seul apply en vol (`focalReconfigureInFlight`), l'élection changée pendant l'apply reprise à sa fin.
3. La méta-rangée d'une continuation garde l'heure seule ; la date complète vit sur la chip d'identité.

**Alternatives rejetées**: corriger la carte UIKit par un décalage mesuré (le décalage dépend de l'état de pose de la cellule) ; garder un apply synchrone gardé par un drapeau (la complétion d'`apply` n'est pas un contexte sûr pour un nouvel apply).
