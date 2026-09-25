/**
 * **LE CRÉDIT D'UN GESTE, RELU AU SERVEUR** (#7908) — pur, sans horloge
 * propre : l'écran fournit la lecture (`GET /me/engagement`, le score servi)
 * et l'attente.
 *
 * Le crédit s'écrit après l'accusé : `recordActivity` est un effet de la
 * passerelle que l'envoi n'attend pas. La relecture s'échelonne donc sur
 * `delays` et s'arrête au premier score qui a bougé. Ce qu'elle rend est ce
 * qu'elle a LU : un écart nul quand rien n'a bougé dans la fenêtre, `null`
 * quand aucune lecture n'a abouti — jamais un barème à la place.
 */
export const CREDIT_READ_DELAYS_MS = [250, 600, 1200, 2400] as const;

export type ObservedCredit = { readonly score: number; readonly credit: number };

export async function observeCredit(input: {
  readonly readScore: () => Promise<number | null>;
  readonly before: number | undefined;
  readonly delays?: readonly number[];
  readonly wait?: (ms: number) => Promise<void>;
}): Promise<ObservedCredit | null> {
  const delays = input.delays ?? CREDIT_READ_DELAYS_MS;
  const wait = input.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastRead: number | null = null;
  for (const delay of delays) {
    await wait(delay);
    const score = await input.readScore();
    if (score === null) continue;
    lastRead = score;
    if (input.before === undefined) return { score, credit: 0 };
    if (score > input.before) return { score, credit: score - input.before };
  }
  return lastRead === null ? null : { score: lastRead, credit: 0 };
}
