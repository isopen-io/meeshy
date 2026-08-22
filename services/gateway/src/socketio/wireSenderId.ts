/**
 * Le `senderId` que porte le FIL, pour tout événement dont le contrat déclare
 * un `SocketIOMessage` (`message:new`, `message:edited`).
 *
 * `Message.senderId` est un `Participant.id`, alors que les clients comparent le
 * `senderId` du fil à leur propre `User.id` pour reconnaître leurs messages et
 * réconcilier la bulle optimiste entre appareils. On expose donc le `User.id` de
 * l'expéditeur, et on ne replie sur le `Participant.id` que pour un expéditeur
 * ANONYME, qui n'en a pas d'autre.
 *
 * La règle vivait recopiée dans les producteurs de `message:new` et de
 * `message:edited`. Elle n'y avait pas encore divergé ; elle est extraite ici
 * parce que le troisième producteur — le transport WebSocket de l'édition — ne
 * servait PAS DU TOUT ce champ, et qu'un quatrième transport ne doit pas pouvoir
 * rouvrir la question.
 *
 * Le paramètre est STRUCTUREL, pas `Message` : les trois producteurs partent de
 * `select` Prisma différents (celui de l'édition socket ne charge pas
 * `sender.user`), et exiger le type complet aurait forcé un cast à chaque site —
 * c'est-à-dire réintroduit, pour appeler l'unité partagée, le blanchiment
 * qu'elle existe pour retirer.
 */
export function resolveWireSenderId(message: {
  readonly senderId?: string | null;
  readonly sender?: {
    readonly userId?: string | null;
    readonly user?: { readonly id?: string | null } | null;
  } | null;
}): string | undefined {
  const participant = message.sender;
  return participant?.userId ?? participant?.user?.id ?? message.senderId ?? undefined;
}
