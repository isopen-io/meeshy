## Une directive qui DÉGÈLE périme les négations écrites pendant le gel

**Date** : 2026-11-21. **Lot** : cycle 206, #20228. **Famille** : « un commentaire
d'état est une AFFIRMATION » (cycle 94, cycle 203, leçon du 2026-11-20 sur les
symétries).

## Le fait

Le site d'émission de `participant:rights-updated` justifiait la forme RÉDUITE
de sa charge par une phrase qui NOMMAIT ses consommateurs :

> Les deux consommateurs le font (`carriesHistoryGrant` côté iOS, `!== undefined`
> côté web) ; Android n'a pas de consommateur.

Mesurée, elle était fausse **sur ses deux moitiés, et pas pour la même raison** :

| moitié | forme de l'erreur | ce qui l'a produite |
|---|---|---|
| « côté web » | une AFFIRMATION jamais vraie | un consommateur supposé, jamais écrit (0 occurrence) |
| « Android n'a pas de consommateur » | une NÉGATION devenue fausse | le dégel du Kotlin natif (#11570) |

## La leçon

La famille connue dit qu'un commentaire d'état survit à ce qui l'a périmé. Ce lot
ajoute **quelle directive le périme, et dans quel sens** : une directive qui
**ouvre** un chantier — un dégel, un déblocage, la reprise d'une plateforme —
périme en masse les phrases de la forme « X ne fait pas Y », qui étaient vraies
le jour où elles ont été écrites et que personne ne relit, parce qu'elles ne
ressemblent pas à des affirmations mais à des constats de terrain.

> **Une négation est l'affirmation la moins relue du dépôt.** Elle n'a aucun
> consommateur à casser quand elle devient fausse : affirmer qu'un lecteur
> EXISTE se démentit au premier défaut, affirmer qu'il N'EXISTE PAS ne se
> démentit jamais — elle se contente d'autoriser à ne pas chercher.

## Ce qu'on fait

- Devant toute phrase « cette plateforme ne lit pas / n'a pas de X », la
  **compter** avant de s'y fier — c'est une commande, pas une relecture :
  `grep -rn "<nom de l'événement>" apps/ios apps/android apps/web/src packages/MeeshySDK`.
- Un lot qui lève un GEL (#11570 pour Android, #7668 pour le web legacy) doit
  chercher les négations que son gel avait rendues vraies. Elles ne rougissent
  pas, donc rien ne les lui apportera.
- Et une phrase corrigée se corrige **contre une mesure DATÉE**, jamais contre un
  souvenir : le commentaire réparé par ce lot porte sa date et sa commande, pour
  que le prochain lecteur sache ce qu'il relit.
