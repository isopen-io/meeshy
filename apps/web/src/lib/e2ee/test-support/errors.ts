/** L'erreur qu'une opération lève, ou `null` : les témoins comparent sa CLASSE (`toBeInstanceOf`). */
export function thrown(operation: () => unknown): unknown {
  try {
    operation();
    return null;
  } catch (error) {
    return error;
  }
}

export async function rejected(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
    return null;
  } catch (error) {
    return error;
  }
}
