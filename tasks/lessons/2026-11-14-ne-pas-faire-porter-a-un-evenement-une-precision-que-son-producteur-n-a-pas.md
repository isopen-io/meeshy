## Ne pas faire porter à un événement une précision que son producteur n'a jamais eue

*Cycle 162 bis, #18537. Portée : tout élargissement de contrat de fil.*

`audio:translation-failed` ne nomme aucune langue cible. La forme « naturelle » était d'élargir le contrat pour qu'il la nomme — un échec de traduction sans sa langue a l'air incomplet, et le champ aurait été additif donc sans risque de décodage.

La valeur **n'existe pas en amont**. Son producteur n'en reçoit pas (`MessageTranslationService` § `audioTranslationError`) : la tâche audio traite toutes les cibles d'un bloc, et l'échec porte sur la PIÈCE. La fabriquer à l'émetteur, c'est inventer une attribution.

La panne s'écrit donc par ÉTAGE — `translations` au PLURIEL, et le nom le dit — et lève toutes les langues en attente de cette pièce.

> **Avant d'élargir un contrat pour qu'il porte un discriminant, remonter jusqu'au producteur pour vérifier qu'il le POSSÈDE.** Un champ que l'émetteur devine est pire qu'un champ absent : il a l'autorité du contrat et la fiabilité d'une supposition, et c'est le consommateur qui paiera la différence.

Même famille que « avant de déclarer un champ, remonter jusqu'à l'ÉMETTEUR » (cycle 90), vue depuis l'autre bout : là il s'agissait de ne pas déclarer une forme que le producteur ne produit pas ; ici, de ne pas réclamer une donnée qu'il ne détient pas.
