---
name: security-audit
description: Audit de sécurité de Meeshy : dépendances, images, secrets, authentification et autorisation. À utiliser pour une revue de sécurité d'un lot, d'un service ou du dépôt.
---
# Audit de sécurité

1. Dépendances : `bun audit`. Pour chaque avis élevé, dire où le paquet tourne (exécution, construction, tests) et si une épingle `overrides` le retient.
2. Ce qui est servi : `BUN=<bun 1.3.14> node .amsf/scripts/check-image-resolution.mjs gateway agent web`. Les images ne lisent pas les épingles racine (#20730).
3. Images tierces des compose : aucune étiquette flottante (#20731).
4. Surface applicative : agent `securite-applicative`, en lecture seule.
5. Cryptographie, authentification, contrôle d'accès, migrations : `auditeur-adversarial` avant fusion.

Jamais de valeur de secret dans un rapport, jamais de test contre la production. Un constat élevé ou critique introduit bloque la release.
