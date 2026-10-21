/**
 * Une tâche dont la panne ne remonte pas (#9899) : elle rend son repli. Le
 * partage et la lecture des traductions partagées vivent en marge de
 * l'affichage — ce qui y échoue ne s'affiche jamais, ne bloque rien, et chaque
 * appelant choisit le repli qui dit quoi en faire.
 */
export async function attempted<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch {
    return fallback;
  }
}
