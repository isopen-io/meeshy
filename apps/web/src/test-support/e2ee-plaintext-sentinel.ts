/**
 * **LA SENTINELLE DU CLAIR DÉCHIFFRÉ** (#18991) — une chaîne qu'un témoin fait
 * entrer par le chemin d'écriture normal d'un puits durable, pour une
 * conversation fermée au clair, puis cherche dans ce qui est rangé.
 *
 * Elle est faite pour durer au-delà de ce lot : le coffre, l'ouvreur et
 * l'affichage du chiffré de bout en bout la feront traverser leurs propres
 * chemins, et `sentinelLeaks` dira où elle a fui — c'est la liste noire
 * (`lib/e2ee/durable-plaintext-sinks.ts`) mise en échec par son consommateur.
 */
export const E2EE_PLAINTEXT_SENTINEL = 'clair-dechiffre-sentinelle-7f3a9c';

/** Les lieux (nom → contenu sérialisé) où la sentinelle apparaît ; vide si aucun. */
export function sentinelLeaks(stores: Readonly<Record<string, string | null | undefined>>): readonly string[] {
  return Object.entries(stores)
    .filter(([, content]) => typeof content === 'string' && content.includes(E2EE_PLAINTEXT_SENTINEL))
    .map(([where]) => where);
}
