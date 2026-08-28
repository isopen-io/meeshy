/**
 * Les formes que le balayage NE doit PAS signaler.
 *
 * Sans ce second témoin, la seule façon de rendre le cliquet vert serait de
 * cesser de détacher quoi que ce soit — un balayage qui refuse aussi la forme
 * JUSTE ne garde pas une règle, il interdit un idiome.
 *
 * Y figurent aussi les deux `void` qui ne détachent RIEN : l'opérateur sur une
 * valeur, et le TYPE de retour — la forme qui a rendu plus de cent faux
 * positifs à la première rédaction du balayage.
 */
declare const svc: {
  work(): Promise<void>;
  arm(cb: () => void, ms: number): void;
};
declare const logger: { warn(msg: string, meta?: unknown): void };

export function guardedBare(): void {
  void svc.work().catch((error: unknown) => logger.warn('failed', { error }));
}

export function guardedIife(): void {
  void (async () => {
    await svc.work();
  })().catch((error: unknown) => logger.warn('failed', { error }));
}

export function guardedInTimer(): void {
  svc.arm(() => {
    void svc.work().catch((error: unknown) => logger.warn('failed', { error }));
  }, 10);
}

export function returnsVoid(): void {
  logger.warn('nothing detached here');
}

export async function awaitsProperly(): Promise<void> {
  await svc.work();
}

export function voidOperatorOnValue(): unknown {
  return void 0;
}
