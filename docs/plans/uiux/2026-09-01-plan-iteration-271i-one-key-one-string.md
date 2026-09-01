# Plan — Iteration-271i : une clé, une chaîne

**Issue** : #4651 · **Base** : `main` `8dd1aa26` · **Branche** : `claude/intelligent-noether-6mx60g`

## Objectif

Fermer l'angle mort commun à toutes les gardes de localisation — elles comparent
un site au CATALOGUE, jamais deux sites l'un à l'autre — et solder les cinq
divergences qu'il laissait vivre.

## Étapes

1. **Mesurer** la famille léguée par 270i (les `defaultValue` anglais dans un
   catalogue français) avec un miroir fidèle du scanner. → 12 clés, dont une qui
   ne ressemble pas aux autres : `feed.media.item`, **cinq** défauts pour une clé.
2. **Extraire** `LocalizedCallScanner` et `LocalizationCatalogMap` de
   `LocalizationConsistencyTests` (1203 lignes, hors budget 800–1100, donc fermé
   aux ajouts). Déplacer les bornes du scanner avec le scanner.
3. **RED** — écrire `InlineDefaultConsistencyTests` : une clé, une chaîne, par
   catalogue, sur squelette littéral. Prouver 5 violations sur `main`.
4. **GREEN** — dans l'ordre de gravité :
   - `feed.media.item` : la chaîne existe déjà sous `gallery.position` en sept
     locales ⇒ site unique `MediaPositionLabel`, branché aux trois écrans, clé
     supprimée (14 sites) ;
   - `feed.media.moreItems` : entrée composée de deux entrées existantes ;
   - `common.done` : français du SDK copié verbatim depuis le catalogue de l'app,
     deux littéraux alignés ;
   - `media.video.play`, `story.textEditor.placeholder` : littéraux alignés.
5. **Élargir le scanner aux appels imbriqués**, après avoir MESURÉ que le cliquet
   ne bouge pas (3 appels, 1 en `.module`, 2 traduites). Aligner les deux
   littéraux ainsi révélés.
6. **Miroir CLI** : DIRECTION 3 à l'identique dans `check_localization.py`.
7. **Re-épingler** : cliquet 81 → 79 ; épingler les deux écrans devenus
   conformes ; ajouter les bornes de substitution des deux entrées touchées.
8. **Vérifier** : trois directions du CLI vertes, 248 écrans épinglés, règles
   A/B à 0, catalogues JSON valides, cliquet français à 0 offender.

## Contrainte d'environnement

Aucune chaîne Swift sur cet hôte Linux : `swift` et `xcodebuild` sont absents.
La vérification locale repose sur `check_localization.py` (qui tourne) et sur un
miroir Python de `LocalizedCallScanner` reproduisant exactement les nombres du
cliquet (81 sur `main`, valeur épinglée dans le test). XCTest tranche en CI.

## Hors périmètre — et pourquoi

Les **dix** `defaultValue` anglais restants demandent une traduction NEUVE en six
langues dont l'arabe. Leur clé étant absente du catalogue, leur littéral est
**vivant** : le passer au français déplacerait le défaut vers l'anglophone au lieu
de le corriger. Entrée et littéral doivent atterrir ensemble — décision #4328.
Trois d'entre elles sont en outre plurielles (#4329).
