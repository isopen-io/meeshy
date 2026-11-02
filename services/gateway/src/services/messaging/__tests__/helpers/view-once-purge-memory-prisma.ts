/**
 * Un double EN MÉMOIRE des deux collections que la purge d'une vue unique,
 * `AttachmentService.deleteAttachment` et le verdict de la route par chemin
 * lisent et écrivent (#11269). Il APPLIQUE les `where` qu'ils posent — égalité,
 * `OR`, `AND`, `id.not`, `id.in`, l'échéance `lte` — pour que les témoins
 * lisent l'état qui RESTE.
 */
type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
type Select = Record<string, unknown>;

function matchesCondition(value: unknown, condition: Record<string, unknown>): boolean {
  return Object.entries(condition).every(([operator, operand]) => {
    if (operator === 'in') return Array.isArray(operand) && operand.includes(value);
    if (operator === 'not') return (value ?? null) !== operand;
    if (operator === 'isSet') return (value !== undefined) === operand;
    if (operator === 'lte') return value instanceof Date && operand instanceof Date && value.getTime() <= operand.getTime();
    return false;
  });
}

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return (expected as Where[]).some((branch) => matches(row, branch));
    if (key === 'AND') return (expected as Where[]).every((branch) => matches(row, branch));
    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) {
      return matchesCondition(row[key], expected as Record<string, unknown>);
    }
    return (row[key] ?? null) === expected;
  });
}

function pick(row: Row, select: Select | undefined): Row {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key] ?? null]));
}

export function viewOncePurgeMemoryPrisma(seed: { readonly messages: readonly Row[]; readonly attachments: readonly Row[] }) {
  const state = {
    messages: seed.messages.map((row) => ({ ...row })),
    attachments: seed.attachments.map((row) => ({ ...row })),
  };

  const attachmentsOf = (messageId: unknown) =>
    state.attachments.filter((attachment) => attachment.messageId === messageId).map((attachment) => ({ id: attachment.id }));

  const messageAttachment = {
    findUnique: async ({ where, select }: { where: { id: string }; select?: Select }) => {
      const row = state.attachments.find((attachment) => attachment.id === where.id);
      return row ? pick(row, select) : null;
    },
    findMany: async ({ where, select }: { where?: Where; select?: Select }) =>
      state.attachments.filter((row) => matches(row, where)).map((row) => pick(row, select)),
    count: async ({ where }: { where?: Where }) => state.attachments.filter((row) => matches(row, where)).length,
    delete: async ({ where }: { where: { id: string } }) => {
      const index = state.attachments.findIndex((row) => row.id === where.id);
      if (index < 0) throw new Error('Record to delete does not exist');
      return state.attachments.splice(index, 1)[0];
    },
    updateMany: async ({ where, data }: { where?: Where; data: Row }) => {
      const targets = state.attachments.filter((row) => matches(row, where));
      targets.forEach((row) => Object.assign(row, data));
      return { count: targets.length };
    },
  };

  const message = {
    findMany: async ({ where, select }: { where?: Where; select?: Select }) =>
      state.messages
        .filter((row) => matches(row, where))
        .map((row) => ({
          ...pick(row, select),
          ...(select && 'attachments' in select ? { attachments: attachmentsOf(row.id) } : {}),
        })),
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = state.messages.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error('Record to update not found');
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: { where?: Where; data: Row }) => {
      const targets = state.messages.filter((row) => matches(row, where));
      targets.forEach((row) => Object.assign(row, data));
      return { count: targets.length };
    },
  };

  return {
    prisma: {
      message,
      messageAttachment,
      sharedTranslation: { deleteMany: async () => ({ count: 0 }) },
    },
    state,
  };
}
