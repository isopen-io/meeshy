import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';

/**
 * **QUI A LE DROIT DE SORTIR EN SCÈNE** (#11574) — les deux règles que
 * l'écran de la liste remet à ses `ExitPresence` (`exit-presence.tsx`).
 *
 * Une RANGÉE ne sort que si sa conversation a quitté la liste ENTIÈRE : celle
 * qui passe d'« Hier » à « Aujourd'hui » quitte une section pour une autre, et
 * un fantôme laissé dans la première la montrerait deux fois.
 *
 * Une SECTION ne sort que si TOUTES les conversations qu'elle portait au
 * dernier commit ont quitté la liste : vidée par une archive, elle se replie
 * avec sa dernière rangée ; vidée par minuit (ses rangées vivent désormais sous
 * « Hier »), elle part sans scène.
 */
export function sectionMayLeave(members: readonly string[] | undefined, alive: ReadonlySet<string>): boolean {
  return (members ?? []).every((id) => !alive.has(id));
}

export function useListDepartures({
  visible,
  sections,
}: {
  readonly visible: readonly { readonly id: string }[];
  readonly sections: readonly { readonly id: string; readonly conversations: readonly { readonly id: string }[] }[];
}): { readonly rowMayExit: (id: string) => boolean; readonly sectionMayExit: (id: string) => boolean } {
  const alive = useMemo(() => new Set(visible.map((row) => row.id)), [visible]);
  const members = useRef<ReadonlyMap<string, readonly string[]>>(new Map());
  useLayoutEffect(() => {
    members.current = new Map(sections.map((section) => [section.id, section.conversations.map((c) => c.id)] as const));
  });
  const rowMayExit = useCallback((id: string) => !alive.has(id), [alive]);
  const sectionMayExit = useCallback((id: string) => sectionMayLeave(members.current.get(id), alive), [alive]);
  return { rowMayExit, sectionMayExit };
}
