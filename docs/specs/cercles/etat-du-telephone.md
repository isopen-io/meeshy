# L'état de mon téléphone, vu par mes cercles

Catalogue des features qui suivent la batterie (#14147), rangées par le cercle minimal qui les ouvre. Rédigé le 2026-11-14 avec le porteur, intégré au dépôt le 2026-11-15.

**Ce fichier est une SOURCE, pas un tableau de bord.** Chaque feature a son issue dans `isopen-io/meeshy`, dans le milestone #278 (les P1 et P2 de sécurité dans #221), et l'état d'avancement se lit dans l'issue et dans le projet « Meeshy — pilotage », jamais ici. Les identifiants `TEL-`, `SAN-`, `PRX-` et `ACT-` ne servent qu'à relier une issue à sa ligne.

## Le modèle commun : celui de la batterie

Toutes ces features reprennent la forme de la batterie (PR #18659), qui reprend celle de l'écoute partagée (PRE-04).

| Pièce | Où | Ce qu'une feature en reprend |
| --- | --- | --- |
| Niveau effectif = minimum des deux accords | `packages/shared/types/relation.ts` | Jamais d'accès à sens unique |
| Matrice feature → niveau minimal, loi unique `resolveRelationAccess` | `packages/shared/utils/relation-levels.ts`, `relation-access.ts` | Une ligne par feature ; Swift et Kotlin la relisent |
| Consentement de l'émetteur, par feature et par personne | `RELATION_EMITTER_CONSENT_FEATURES` | Entre Proches : accord donné une fois, case non pré-cochée |
| Relais par lecteur, projection dans `user:<id>` | `services/gateway/src/services/battery/`, `nowPlaying/nowPlayingRelay.ts` | Store Redis à durée de vie courte, aucun historique |
| Signal | push, SyncPill, état dans l'en-tête, la fiche et le profil | Jamais un message dans la conversation |
| Privilège de l'équipe | #16623 | Entre comptes ANALYST et au-dessus, le niveau rendu est Sang |

## Décisions du porteur qui s'appliquent à tout le catalogue

1. **Entre Sangs, la santé, la présence et la proximité, et l'activité sont actives par défaut**, sans confirmation feature par feature, et désactivables pour tous ou pour une personne (2026-11-14).
2. **Le rituel Sang est l'acceptation unique.** Un seul écran qui liste tout ce qui s'active, accepté une fois à deux. Les autorisations du système (Santé, Position toujours, Mouvement) restent demandées par iOS et Android eux-mêmes.
3. **Un signal n'est jamais un message de conversation.** Push pour ce qui doit atteindre l'autre app fermée, SyncPill quand l'app est ouverte (elle remplace le push), état durable dans l'en-tête, la fiche et le profil.
4. **Le contexte décide de ce qui part.** En conversation (ouverte, un message échangé dans les 15 dernières minutes, ou une réponse attendue), tout ; hors conversation, seulement ce qui change l'attente de l'autre. Un Atome voit tout de ses électrons, tout le temps.
5. **La SyncPill ne persiste jamais** : elle défile, disparaît, et revient au prochain événement. Le passage d'une annonce à l'autre par glissement, avec « << » et « >> », est suivi par #18755.
6. **Les données de santé passent par l'agent `conformite-juridique` avant la production** (article 9 du RGPD).

## Ami 🤝 : savoir quand joindre

| ID | Prio | Feature | Ce que l'autre voit | Note |
| --- | --- | --- | --- | --- |
| TEL-03 (#18739) | P2 | Heure locale de l'autre | « Il est 3 h 10 chez Awa » dans l'en-tête, seulement si le fuseau diffère du mien | Un fuseau, jamais une position. Le fuseau vient de l'appareil |
| TEL-07 (#18743) | P3 | « Dispo pour un appel » | Un statut manuel qui expire seul (1 h, ce soir), à côté du statut existant (PRO-03) | Une intention déclarée, jamais déduite |

## Proche 🔥 : savoir que tout va bien

| ID | Prio | Feature | Ce que l'autre voit | Note |
| --- | --- | --- | --- | --- |
| TEL-01 (#18737) | P1 | Téléphone injoignable | « Le téléphone de Jacques est injoignable depuis 14:10 », avec la cause probable (batterie vide, mode avion, sans réseau) | Déclenché quand la socket tombe et que deux push ne sont pas distribués. Complète « probablement éteint » de la batterie |
| TEL-04 (#18740) | P2 | Sommeil déduit | « Dort » ou « réveillé·e depuis 7 h 05 », corrigeable à la main | Étend PRE-06 (#14160) de Sang à Proche, déduit de la charge de nuit et de l'inactivité |
| TEL-08 (#18744) | P3 | Occupé·e (concentration) | « En mode concentration », sans le nom du mode | iOS n'expose qu'un booléen (`INFocusStatusCenter`), Android l'état Ne pas déranger |
| TEL-09 (#18745) | P3 | Agenda libre / occupé | Les créneaux occupés de la journée, sans titres | Les titres restent au Sang (TEL-10) |

## Sang 🩸 : savoir où et comment, à tout moment

**Sécurité et trajets**

| ID | Prio | Feature | Ce que l'autre voit | Note |
| --- | --- | --- | --- | --- |
| TEL-02 (#18738) | P1 | Vérification d'inactivité | Après un délai sans activité du téléphone (12 h par défaut), l'app demande « Tout va bien ? » ; sans réponse en 30 min, les Sangs sont prévenus avec la dernière position et la dernière batterie | Milestone #221. Réutilise batterie et position |
| TEL-05 (#18741) | P2 | Trajet en cours et heure d'arrivée | « Awa arrive dans 12 min » sur un trajet vers un lieu enregistré | Rend vivants LOC-02 et SEC-02 (#14149) |
| TEL-06 (#18742) | P2 | Mode de déplacement | À pied, à vélo, en voiture, en transport, immobile | `CMMotionActivity`, Activity Recognition |
| TEL-10 (#18746) | P3 | Agenda détaillé | Les titres des événements du jour | Suite de TEL-09 |
| TEL-11 (#18747) | P3 | Écouteurs branchés | Une icône près du bouton talkie | Dit si le talkie sortira dans les oreilles ou sur le haut-parleur |

**Santé** (actives par défaut entre Sangs, revue de conformité avant production)

| ID | Prio | Feature | Ce que l'autre voit | Source sur l'appareil |
| --- | --- | --- | --- | --- |
| SAN-01 (#18748) | P1 | Chute détectée | « ⚠️ Une chute a été détectée sur la montre d'Awa à 16:42 », avec position et batterie | HealthKit (`numberOfTimesFallen`, Apple Watch) ; rien de standard sur Android, et l'interface le dit |
| SAN-02 (#18749) | P2 | État déclaré | « Je ne me sens pas bien » en un geste, qui prévient mes Sangs | Saisie manuelle |
| SAN-03 (#14160) | P2 | Sommeil mesuré | Durée de la nuit, heure du réveil | HealthKit, Health Connect ; remplace TEL-04 quand il existe (#14160) |
| SAN-04 (#18750) | P2 | Activité physique du jour | Pas, distance, « immobile depuis 6 h » | HealthKit, Health Connect, sinon `CMPedometer` |
| SAN-05 (#18751) | P3 | Rythme cardiaque inhabituel | « Rythme inhabituel au repos », jamais un diagnostic ni une courbe | Comparé à la moyenne de la personne |

**Présence et activité**

| ID | Prio | Feature | Ce que l'autre voit | Note |
| --- | --- | --- | --- | --- |
| ACT-01 (#18753) | P1 | En appel | « En appel depuis 12 min », sans interlocuteur | `CXCallObserver` sur iOS, état téléphonique sur Android |
| PRX-01 (#18752) | P2 | Distance en direct | « à 3,2 km » dans l'en-tête | Calculée côté serveur, aucune coordonnée servie en plus |
| ACT-02 (#18754) | P2 | Au volant | « Au volant », pour ne pas l'appeler | Concentration Conduite (booléen) sur iOS, Activity Recognition sur Android |

Déjà au classeur et suivies par leurs propres issues : position continue, historique et alerte de proximité (LOC-03, LOC-11, LOC-04), lieux reconnus (LOC-09), ensemble (LOC-08, #14150), activité en cours (PRE-02, #14159).

## Ce qu'on ne propose pas

- **Données médicales fines** (cycle, traitements, glycémie, courbes cardiaques brutes) : on sert des signaux, jamais un dossier médical.
- **Temps d'écran et apps utilisées** : relève du contrôle parental (PAR-05).
- **Mode silencieux sur iOS, nom du Wi-Fi, détection d'accident d'Apple** : illisibles ou réservés par la plateforme.

## Ordre de développement recommandé

1. TEL-01 et TEL-02, qui reposent directement sur la batterie (attendre la fusion de #18659).
2. ACT-01 et SAN-01, les deux autres P1.
3. Les P2 : TEL-03, TEL-04 et SAN-03 ensemble, TEL-05, TEL-06, PRX-01, ACT-02, SAN-02, SAN-04.
4. Les P3.
