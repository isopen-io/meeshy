## Leçon 630 — une garde par sous-chaîne rougit sur sa PROPRE explication ; une garde indexée par FICHIER se périme à la première extraction

**Deux rouges du 2026-09-18, même famille, causes jumelles.**

1. **La garde qui se mord la queue** (#7000). `MeeshyApp` ne devait plus appeler `removeAllDeliveredNotifications()`. Le code l'a bien perdu — mais le commentaire qui EXPLIQUE le retrait nomme la fonction (« ici vivait `removeAllDeliveredNotifications()` »), et la garde lisait la source **brute**. Elle rougissait sur son propre commentaire d'explication. Correctif : `AppSourceGuard.stripComments` avant toute mesure — le dépouilleur que toutes les autres gardes du dépôt emploient déjà.

2. **La garde qui a perdu sa cible** (#6999). `test_bulkHandlers_triggerNoRESTRefetch` cherchait `handleNotificationReadBulk` dans `NotificationToastManager.swift`. Le lot l'avait extraite vers `NotificationConsumption.swift` — **sans changer un seul comportement**. `XCTUnwrap` rendait `nil`, la suite rougissait. Correctif : lire l'UNITÉ (les deux fichiers), pas le fichier. Même racine que [[reference_an_extraction_reds_every_guard_indexed_by_file]].

**Ce que les deux enseignent ensemble.** Une garde de source mesure un TEXTE, et un texte a deux ennemis : ce qu'on écrit à côté du code (les commentaires) et l'endroit où le code vit (le fichier). Une garde robuste dépouille le premier et suit l'unité pour le second. **Avant de croire un rouge de garde de source, vérifier qu'elle mesure encore ce qu'elle croit mesurer** — ces deux-là accusaient un défaut qui n'existait pas.

**Corollaire d'exception.** `FixedFontSizeGuardTests` n'a d'exception que pour la dette GELÉE : un fichier NEUF n'y entre jamais, quel que soit le commentaire qui invoque la doctrine des glyphes décoratifs. Une exception qui se réclame d'une doctrine sans être inscrite au registre de la dette n'existe pas.
