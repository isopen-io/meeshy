## Leçon 595 — Une vue SwiftUI est un type VALEUR : sa TAILLE est un coût de PILE, payé à chaque rendu, invisible à tout profil d'allocation

**Le fait.** L'app plantait à l'ouverture de toute conversation. Trois lots (#5837, #5855, #6194) ont diagnostiqué une récursion du démangleur de métadonnées et posé le bon remède — des frontières nominales. Après #6194 la trace ne portait plus une seule frame de démangleur, et **ça plantait toujours**.

**Ce qui a débloqué l'enquête, c'est une mesure que personne n'avait faite** : l'adresse fautive contre les bornes de pile.

```
signal 0xb  si_addr=0x16da6bff8  stack_low=0x16da6c000
→ huit octets SOUS le plancher : page de garde.
```

**« Débordement de pile » et « pointeur invalide » rendent le MÊME signal 11 et une trace d'apparence normale.** Une récursion visible dit « débordement » ; **son absence ne dit rien** — un cadre unique et énorme déborde sans se répéter. Trois lots avaient lu la FORME de la pile pour en déduire la nature du défaut ; c'est une inférence, pas une mesure, et elle était fausse deux fois sur trois.

**La cause.**

```
ConversationView = 15 088 octets
  ├─ overlayState   7 088   ← six `Message?` EN LIGNE (~1,4 Ko pièce)
  ├─ composerState  3 897
  └─ scrollState    1 040
```

Une vue SwiftUI est une `struct`, donc un **type valeur**, et **chaque closure de son `body` la capture en la COPIANT**. Une vue de 15 Ko rend chaque cadre de pile proportionnellement énorme : le site qui formait une dizaine de closures en réclamait 490 Ko, sur une pile principale de **1008 Ko**.

> **Ce n'était pas la PROFONDEUR de la pile qui débordait, c'était sa LARGEUR.**

Six copies de `Message` dormaient dans un même sac d'état pour n'en servir qu'une : un menu, une feuille de détail et un partage ne s'ouvrent jamais ensemble. Sept emplacements permanents pour un contenu à la fois.

**Le corollaire qui explique six correctifs ratés.** `AnyView` posé EN LIGNE — `AnyView(uneBranche)` — érase **après** que le cadre a réservé la place du type concret. Il borne ce qui SORT de l'expression, jamais ce qui a été réservé pour la construire. **Déplacer la branche dans SA propriété** change le mécanisme : la construction se fait dans un cadre à elle, entré puis quitté. Les branches se SUCCÈDENT au lieu de s'ADDITIONNER — `bodyContent` est passé de 622 à 172 Ko par ce seul geste, sans qu'une ligne de rendu change.

**Ce coût n'apparaît sur AUCUN profil d'allocation** : rien n'est alloué, la pile est simplement plus large. C'est pourquoi il a survécu à trois enquêtes.

**La garde qui manquait, et la façon dont elle manquait.** `ConversationViewBodyTypeDepthTests` mesurait la profondeur des types. Elle était **VERTE pendant tous ces crashs** : elle regardait la bonne chose et la mauvaise dimension. Un champ de valeur ajouté à un état ne change aucune profondeur, ne rougit aucun témoin, et rapproche la vue du plancher de pile.

> **Un témoin vert sur la dimension voisine est plus dangereux qu'un témoin absent** : il donne l'impression que la question est gardée. Devant un défaut qui revient malgré une garde verte, demander non pas « la garde est-elle juste ? » mais **« garde-t-elle la dimension qui échoue ? »**

**Le corollaire de généralisation, payé dans le même lot.** Une fois `ConversationView` corrigée, le relevé a montré que la vue la plus lourde n'était pas elle : `ConversationListView`, l'écran principal, pesait **10 256 octets** — sept `Conversation?` en ligne, même motif, même « une seule à la fois ». Elle n'avait pas encore débordé. **Corriger la victime et garder la victime seule aurait laissé passer la suivante** ; le témoin budgète donc les cinq vues racines, dont deux sous le plafond sans avoir été touchées — un budget, pas une cible.

**Trois pièges de méthode payés en chemin**, tous de la même famille (une lecture prise pour une mesure) :

1. **Apparier deux listes parcourues séparément par leur RANG est un pari.** La chaîne de pointeurs de cadre et `backtrace()` ne comptent pas les mêmes cadres, et le décalage DÉRIVE. Symptôme : la même fonction attribuée à trois niveaux. J'ai refactoré une branche latérale sur cette foi. Apparier par **adresse de retour**.
2. **Une trace laissée par un crash antérieur se lit comme la preuve du tir courant.** Le Release n'embarque pas le dumper (`#if DEBUG`) : la sonde reprenait le fichier précédent, `si_addr` identique au bit près. Dater le fichier avant le tir.
3. **La boucle de vérification s'arrêtait un geste avant le défaut.** L'app ne plante pas au LANCEMENT, elle plante à l'OUVERTURE d'une conversation — et aucune commande de déploiement ne fait ce geste. « Build vert + app lancée » a été pris trois fois pour « corrigé ». Le geste était pilotable depuis toujours : `meeshy://conversation/<id>` + `devicectl --payload-url`, l'identifiant lu dans la base de l'appareil. D'où `apps/ios/scripts/probe-conversation-open.sh`.

Issues : #6221 (le crash), #6213 (le lot voisin). Mémoire : `reference_swiftui_type_depth_stack_overflow.md`, corrigée en conséquence.
