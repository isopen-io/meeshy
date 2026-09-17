/**
 * `verdictKey` (T12, #6899) — la clé de cache du verdict
 * `imageOnlyPresentation` (`image-only.ts`) pour une story, miroir de
 * `StoryImageOnlyVerdictCache.key` (`StoryViewerView+ImageOnly.swift:74-80`) :
 * `story.id | chaîne du prisme | nb de traductions par objet | taille du
 * canvas`. Le lecteur ne redescend pas le Prisme une seconde fois pour
 * mesurer : la MÊME `preferredLanguages` atteint `ScenePlayer` ET le
 * mesureur (T11), et cette clé change dès qu'un texte SERVI change de
 * longueur — un texte traduit n'a presque jamais la même longueur que
 * l'original, donc son cadre mesuré change, donc le verdict doit se
 * RECALCULER plutôt que de rendre un cadre PÉRIMÉ.
 */
export function verdictKey(params: {
  readonly storyId: string;
  readonly chain: readonly string[];
  /** Nombre de traductions connues par objet — SIGNE qu'un texte a changé
   * de longueur, jamais son contenu (que la clé n'a pas besoin de porter). */
  readonly translationCounts: Readonly<Record<string, number>>;
  readonly canvasSize: { readonly width: number; readonly height: number };
}): string {
  const chainKey = params.chain.join(',');
  const translationsKey = Object.entries(params.translationCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, count]) => `${id}:${count}`)
    .join('|');
  const sizeKey = `${Math.round(params.canvasSize.width)}x${Math.round(params.canvasSize.height)}`;
  return `${params.storyId}|${chainKey}|${translationsKey}|${sizeKey}`;
}
