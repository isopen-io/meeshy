---
"@meeshy/gateway": patch
---

l'éviction au plafond de la file de remise hors ligne se voit enfin : destinataire et nombre d'entrées détruites, sur les quatre chemins qui en détruisent (enfilage Redis, enfilage mémoire, remise Redis, remise mémoire), sans une commande Redis de plus et sans rien émettre en deçà du plafond (Refs #18733)
