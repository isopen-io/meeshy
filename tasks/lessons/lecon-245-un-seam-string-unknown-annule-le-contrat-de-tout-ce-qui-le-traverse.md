## Leçon 245 — Un seam `(string, unknown)` annule le contrat de tout ce qui le traverse (2026-08-22, cycle 100)

Le cycle 99 avait typé le `Socket` d'un handler contre `ServerToClientEvents` et
laissé « basculer les autres un par un ». `SocialEventsHandler` compilait pourtant
sans erreur une fois basculé — non parce qu'il respectait le contrat, mais parce
que ses 21 diffusions ne touchent JAMAIS `io.emit` directement : elles passent
par quatre helpers privés déclarés `(event: string, data: unknown)`.

> **Typer le `Socket` ne garde rien tant qu'un seam intermédiaire reblanchit le
> couple.** À l'intérieur d'un helper `(event: string, data: unknown)`, `event`
> est un `string` quelconque et `data` un `unknown` ; le contrat ne peut rien
> exiger, et au site d'appel il n'y a plus rien à vérifier. La garde ne vaut que
> jusqu'au PREMIER paramètre non typé.

Le correctif est de rendre le seam générique
(`<E extends keyof ServerToClientEvents>(event: E, data: Parameters<…>[0])`), pas
de typer l'objet en amont. Et quand l'inférence d'une lib force un cast (ici
`DecorateAcknowledgementsWithMultipleResponses` de socket.io sur un `E`
générique), le placer À L'UNIQUE point qu'elle ne résout pas — jamais dans le
seam, ce qui le rouvrirait. Un cast qui porte sur un couple déjà vérifié en
frontière ne blanchit rien ; un cast dans le seam blanchit tout.

Corollaire de méthode : **chercher les seams avant de déclarer un handler
"couvert".** `grep -c "\.emit("` sur le fichier ne trouvait rien dans
`SocialEventsHandler` — les émissions étaient toutes derrière `emitToFriends`,
`emitToFeedsAndPostRoom`, `emitToUser`, `emitToUserFeedAndPostRoom`. Un handler
sans `io.emit` littéral n'est pas un handler sans émission ; c'est souvent un
handler dont les émissions sont blanchies.

Et corollaire de routine, payé ce cycle : **repuller `main` AVANT de pousser un
défaut de production.** Le flip a révélé que le chemin REST/ZMQ de `message:new`
perdait l'enveloppe E2EE ; je l'ai corrigé et outillé. Une routine sœur (cycle
99 bis) avait corrigé le MÊME défaut pendant ce cycle, mieux (producteur partagé
`messageNewPayload.ts`). Constaté au repull, j'ai abandonné ma correction
redondante au profit de la leur. La leçon des cycles 85/97 — « cette entité
a-t-elle une jumelle ? » — vaut aussi pour les routines : ta correction a
peut-être une jumelle déjà mergée.
