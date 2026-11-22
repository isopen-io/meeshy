## 2026-11-22 : de Sang à Sang rien ne se cache, sauf descendre — chaque palier arrive avec ses fonctions actives, le Sang se consent en une fois et se retire en redescendant

**Statut** : Proposé le 2026-11-22 (#20359, lots #20361 la loi et les routes, #20362 le rituel, #20363 la migration, #20364 la conformité). Décision par défaut #20367 : option B, tant que le porteur n'a pas tranché. Analyse `conformite-juridique` du 2026-11-22 consignée dans l'AIPD (`docs/conformite/2026-11-cercles-et-mode-sang-aipd.md`, § 13). **Ce n'est pas un avis juridique.** Les questions J14 à J18 de l'AIPD exigent un avis signé avant toute promotion en production des lots #20361 et #20362.

**Contexte** : directive du porteur du 2026-11-22 (#13925, #20359) : « De Sang à Sang rien ne doit être impossible sauf descendre le Sang ». Plus le lien monte, moins on se cache. Restreindre quelqu'un, c'est le redescendre à Proche. La baisse est unilatérale, silencieuse et immédiate (`routes/relations/lower.ts:44`, RG-07). L'ouverture du compte d'un Sang (#20360) est hors de cette décision.

### Ce que cette décision remplace

Chacune reste lisible à sa date. Elle ne vaut plus au Sang, et, quand c'est dit, plus au Proche.

| Décision ou texte | Ce qu'il disait | Ce qui change |
|---|---|---|
| #19478, #19454 | Un Sang peut cesser de recevoir la position continue (`bloodLocationMutedAt`) | Entre Sangs, la réception ne se coupe pas. #19478 se ferme sans objet. |
| #14401 | Un partage du rituel se retire sans quitter le Sang | Au Sang, on ne retire plus un partage : on redescend. |
| #16642 | Accorder un partage hors rituel est réservé à l'équipe | Au Sang, il n'y a plus d'accord par partage. Il y a l'accord à la liste. |
| #14147 | Batterie : consentement de l'émetteur, refusé par défaut sous le Sang | Actif par défaut dès Proche, retirable par personne au Proche, verrouillé au Sang. |
| #18737, #18738, #18753 | Injoignable, inactivité, en appel : retrait par personne et coupure globale valables au Sang | Au Sang, ni retrait ni coupure globale. Au Proche, l'injoignable est actif par défaut et retirable. |
| #13936 (D-3), #13935, #17023 | Bring, talkie, Ensemble bloquables par personne et globalement | Au Sang, on ne bloque plus. À l'Ami et au Proche, rien ne change. |
| #18748 (point 3) | Chute : retrait par personne entre Sangs | Au Sang, l'alerte part à tous les Sangs dès que l'accord global de santé est donné. L'accord global reste (point 2 de #18748), le refus sous 15 ans aussi. |
| Spec `docs/superpowers/specs/2026-10-31-cercles-et-mode-sang-design.md`, l. 124-130 et 244 | Consentement fonction par fonction, refusable, au rituel et à l'entrée en Proche ; fantôme global et ciblé (l. 116) | Le consentement porte sur le PALIER, avec la liste de ce qu'il ouvre. Il se retire en redescendant. |
| AIPD, l. 44, 53, 121, 156 | Partages faux par défaut, consentement explicite par observateur et par partage, fantôme comme mesure contre le contrôle coercitif | Révisée au § 13 de l'AIPD. |

### Décision

1. **Chaque palier arrive avec ses fonctions actives** (`RELATION_LEVEL_DEFAULT_ON`, `packages/shared/utils/relation-levels.ts`).
   - À Proche : catégorie d'écoute, batterie, injoignabilité. Colonne nulle = active ; `false` = refusée. Elles restent réglables par personne.
   - À Sang : tout le reste.
   - La position temporaire garde son geste par partage. Elle n'est pas dans la table.

2. **Le verrou du Sang** (`RELATION_BLOOD_LOCKED_FEATURES`). Écoute (catégorie, titre), position continue, historique 30 j, proximité, batterie et relevé, injoignable, en appel, inactivité, chute, talkie, Bring, Ensemble, et la réception de la position.
   - Entre deux Sangs, toute écriture qui COUPE l'une d'elles répond `409 RELATION_BLOOD_LOCKED` (`sendError`).
   - Les coupures globales épargnent les Sangs : fantôme `locationGhostAt`, `*SharingDisabledAt`, `notification.{bring,talkie,together}Enabled`. L'interface le dit : « tous sauf tes Sangs ».
   - Le GET sert `lockedByLevel: true` par champ.

3. **Un accord unique, au palier, versionné** (#20362).
   - Le rituel recueille UN accord : `acceptsBloodBundle` et la version de la liste (`BLOOD_BUNDLE_VERSION`, `packages/shared/utils/blood-bundle.ts`).
   - Il est stocké par côté, sur la ligne `RelationFeatureSetting` de chacun : `bloodBundleAcceptedAt`, `bloodBundleVersion`.
   - Un accord ne vaut que pour la version qu'il porte. Une liste qui change change de version.

4. **Décision B (#20367)**. Le verrou n'ignore les refus stockés et les coupures globales qu'APRÈS l'accord à la liste de la personne qui les avait exprimés.
   - Tant qu'un Sang existant n'a pas accepté (carte « Garder Sang, tout partagé / Passer en Proche », `PUT /relations/:userId/blood-bundle`), ses refus explicites et ses coupures globales restent appliqués.
   - « Passer en Proche » depuis la carte est la baisse ordinaire : silencieuse et immédiate.

5. **Restent hors du verrou** :
   - le blocage ;
   - la chute refusée sous 15 ans déclarés ;
   - l'accord GLOBAL de détection de chute (art. 9 RGPD, `fallAlertConsentedAt` à la version courante). Son retrait n'est jamais un 409 ;
   - le consentement d'un mineur déclaré : c'est l'accord au palier, recueilli au rituel (§ 3 de la décision #13927) ;
   - la baisse sous Sang, qui efface l'accord à la liste.

### Conditions que le code respecte (analyse du 2026-11-22, AIPD § 13.3)

Chaque condition a son témoin, rouge puis vert, dans le lot qu'elle nomme.

- **C1. Pas de défaut actif avant l'accord, pour ce qui était un consentement du rituel** (#20361). Titre d'écoute, position continue, historique et proximité ne s'ouvrent, avant un accord à la liste de la version courante, que sur un `true` stocké. Une colonne nulle vaut alors refus. Sans cela, un Sang qui n'a jamais consenti (paire de l'équipe, rituel ancien, migration) partagerait sa position sans aucun acte. Ce serait un consentement présumé (art. 4(11), considérant 32 ; CJUE C-673/17, *Planet49*).
- **C2. L'équipe sans lien n'est ni ouverte par défaut, ni verrouillée** (#20361). Entre deux comptes de l'équipe (#16623), aucun accord à la liste n'est possible, et aucune baisse non plus : il n'y a pas de lien. Le défaut actif du Sang et le 409 ne valent donc qu'au Sang d'un lien réel, après le rituel. Entre collègues, le consentement reste requis et retirable par partage (considérant 43 ; CEPD, lignes directrices 05/2020, §§ 21-23).
- **C3. Pas de 409 avant l'accord** (#20361). Tant qu'un côté n'a pas accepté la liste, il garde le retrait par partage de ce qu'il avait consenti au rituel. Il a consenti sous des conditions qui promettaient ce retrait (#14401). Les lui retirer sans son accord changerait les termes d'un consentement en cours (art. 7(3)).
- **C4. Un refus d'un ancien client n'est jamais un partage** (#20362). Un corps de rituel v1 qui porte `false` ne crée pas `bloodBundleAcceptedAt`. Le partage refusé reste fermé : soit le `false` s'écrit, soit C1 suffit. Jamais un écran qui dit « refusé » pendant que le serveur partage.
- **C5. La version fait l'accord** (#20362). `bloodBundleAccepted` n'est vrai que si `bloodBundleVersion === BLOOD_BUNDLE_VERSION`. Une feature ajoutée à la liste reste fermée chez ceux qui ont accepté une version antérieure, jusqu'à leur nouvel accord. Elle ne leur renvoie pas de 409.
- **C6. La chute garde son accord propre** (#20361). L'accord à la liste n'est jamais lu comme l'accord explicite de l'art. 9. `fallAlertConsentedAt` à la version courante reste requis, son retrait reste un 200, et le refus sous 15 ans tient. Le texte de cet accord dit désormais « à tous tes Sangs, présents et à venir ».
- **C7. Un mineur déclaré garde le retrait de sa position et de son titre** (#20361, #20362). Mesure conservatoire jusqu'aux avis J1 et J16. Pour un émetteur mineur déclaré, position continue, historique, proximité et titre d'écoute ne sont pas verrouillés : il les retire par personne sans quitter le Sang (art. 8, considérant 38 ; ICO AADC, standard 10).
- **C8. La baisse est toujours possible, et immédiate** (#20361). Elle n'est jamais derrière un plancher de version sans chemin de repli : le web n'est jamais jugé (`app-version-floor.ts`). Elle éteint les partages chez l'autre (`withdrawSharesAfterDrop`). Elle efface l'accord à la liste des DEUX côtés : il avait été donné à un Sang qui n'existe plus.
- **C9. Le retrait global a sa porte** (#20361, clients). Là où vit chaque coupure globale, l'interface dit « tous sauf tes Sangs » AVANT l'activation. Elle offre au même endroit « Passer mes Sangs en Proche » : un geste, une confirmation.
- **C10. Rien ne punit un refus du système**. Si la personne retire une autorisation du système (position, Santé, notifications), aucune fonction ne se ferme pour elle. L'autre voit « indisponible », jamais « X a coupé ». Aucune notification ne le lui dit.
- **C11. La preuve suit l'accord** (#20362). `bloodBundleAcceptedAt` et `bloodBundleVersion` partent dans l'export RGPD (`GET /me/export?types=relations`). Ils sont purgés avec le compte, des deux côtés (`AccountPurgeService`), et effacés à la baisse.
- **C12. La carte B est neutre** (clients, #20358). Les deux choix ont le même poids visuel. Rien n'est pré-sélectionné. Il n'y a ni échéance ni acceptation par défaut au bout d'un délai (CEPD, lignes directrices 03/2022 sur les interfaces trompeuses).

### Rétrocompatibilité

- **Anciens clients** : ils affichent encore les interrupteurs. Le champ `lockedByLevel` leur est inconnu. Une coupure au Sang reçoit un 409, et le client applique son retour arrière optimiste. Le serveur ne répond jamais 200 à une coupure qu'il n'applique pas.
- **Corps de rituel v1** (quatre consentements) : accepté. Ses `false` ne refusent plus le Sang. Ils ne créent pas `bloodBundleAcceptedAt` (C4).
- **Route nouvelle** : `PUT /relations/:userId/blood-bundle`. Aucune route n'est retirée.
- Une version minimale invite à mettre à jour, sans couper la baisse (C8).

### Mesures compensatoires recommandées

Elles répondent au risque de contrôle coercitif (AIPD § 3.8 (a)). La directive retire le fantôme indétectable, qui en était la mesure principale.

1. **Rappel périodique du Sang** : « X voit ta position depuis 30 jours. Garder Sang / Passer en Proche ». Mêmes poids, même neutralité que C12.
2. **Signe permanent côté observé** quand la position continue part, avec la baisse en un geste depuis la notification persistante.
3. **Journal des consultations** servi AVANT toute lecture d'historique (#13937), et message en cas d'excès.
4. **« Passer mes Sangs en Proche »** comme retrait global (C9).
5. **Baisse depuis l'alerte** : l'écran d'un Bring ou d'un talkie reçu d'un Sang propose « Arrêter » et « Passer X en Proche ».
6. **Signalement** d'un Sang depuis sa fiche (#14110), sans le prévenir.

### Issues à ouvrir

- « Un Sang qui n'a pas accepté la liste ne partage pas sa position par défaut » (C1, C3, C4).
- « Entre collègues sans lien, rien ne s'ouvre par défaut et rien ne se verrouille » (C2).
- « Un mineur déclaré retire sa position et son titre sans quitter le Sang » (C7).
- « Je passe tous mes Sangs en Proche d'un seul geste » (C9, mesure 4).
- « Tous les 30 jours, je confirme mes Sangs qui voient ma position » (mesure 1).
- « Les Proches d'avant le 2026-11-22 voient ce que le Proche ouvre avant qu'il s'active » (AIPD § 13.2, point 2).

### Ce qui exige un avis signé

Les questions J14 à J18 de l'AIPD (§ 11 et § 13.4) : le consentement groupé au palier (art. 7(4), considérant 43), la perte du fantôme face au contrôle coercitif et la consultation préalable (art. 35, 36), les mineurs sous le verrou (art. 8), la base légale des défauts actifs du Proche, et l'équipe. Aucune promotion en production de #20361 et #20362 sans ces avis.
