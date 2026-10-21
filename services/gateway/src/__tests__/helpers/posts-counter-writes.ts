/**
 * Relit les commandes `$runCommandRaw` d'incrément des compteurs de `Post`
 * (`services/posts/postCounters.ts`, #10402) dans le vocabulaire de Prisma :
 * les témoins nomment toujours « +1 impression sur tel post », seul le
 * transport a changé.
 */

export type PostCounterWrite = {
  readonly ids: readonly string[];
  readonly data: Readonly<Record<string, { readonly increment: number }>>;
  readonly liveOnly: boolean;
};

type CounterCommand = {
  update?: string;
  updates?: { q: { _id: { $in: { $oid: string }[] }; deletedAt?: null }; u: { $set: Record<string, { $add: [unknown, number] }> }[] }[];
};

export function decodePostCounterWrite(command: unknown): PostCounterWrite | null {
  const cmd = command as CounterCommand;
  if (cmd?.update !== 'Post' || !cmd.updates?.[0]) return null;
  const [{ q, u }] = cmd.updates;
  return {
    ids: q._id.$in.map((entry) => entry.$oid),
    data: Object.fromEntries(Object.entries(u[0].$set).map(([field, expr]) => [field, { increment: expr.$add[1] }])),
    liveOnly: 'deletedAt' in q,
  };
}

export function postCounterWritesOf(fn: { mock: { calls: readonly (readonly unknown[])[] } }): PostCounterWrite[] {
  return fn.mock.calls
    .map(([command]) => decodePostCounterWrite(command))
    .filter((write): write is PostCounterWrite => write !== null);
}

export const counterWrite = (
  ids: readonly string[],
  data: Record<string, { increment: number }>,
  liveOnly = false,
): PostCounterWrite => ({ ids, data, liveOnly });
