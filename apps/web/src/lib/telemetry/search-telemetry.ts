import { useCallback, useEffect, useRef } from 'react';

import { newEngagementSessionId } from '@/lib/api/social-events';
import type { SearchResultKind, TargetKind } from '@/lib/api/social-events-v2-types';
import { readingTelemetry } from '@/lib/view/reading-telemetry';

/**
 * **LA RECHERCHE, SANS SON TEXTE** (#10505, décision § 4 et § 6, revue O3) —
 * `discovery/search_submitted` quand une requête rend ses résultats,
 * `search_result_click` (cible et rang) quand on en touche un,
 * `search_abandoned` quand on quitte sans en avoir touché. Le texte saisi ne
 * part JAMAIS : sa longueur seule ; l'empreinte, si elle existe, est
 * l'affaire de la passerelle sur la requête de recherche elle-même.
 */
type Submitted = { readonly searchId: string; readonly queryLength: number; readonly resultCount: number; clicked: boolean };

export function useSearchTelemetry(params: {
  readonly query: string;
  readonly results: readonly { readonly id: string }[] | undefined;
  /** `false` tant que les résultats affichés sont ceux de la requête précédente. */
  readonly settled: boolean;
  readonly minLength: number;
  readonly resultKind: SearchResultKind;
  readonly targetKind: TargetKind;
  /** L'attribut qui porte l'identifiant d'une ligne de résultat. */
  readonly rowAttribute: string;
}): { readonly onResultsClick: (event: { readonly target: EventTarget | null }) => void } {
  const { query, results, settled, minLength, resultKind, targetKind, rowAttribute } = params;
  const current = useRef<Submitted | null>(null);
  const lastQuery = useRef('');

  const abandon = useCallback(() => {
    const submitted = current.current;
    current.current = null;
    if (submitted === null || submitted.clicked) return;
    readingTelemetry.recordV2({
      type: 'discovery',
      action: 'search_abandoned',
      surface: 'search',
      searchId: submitted.searchId,
      queryLength: submitted.queryLength,
      resultCount: submitted.resultCount,
      resultKind,
    });
  }, [resultKind]);

  const resultCount = results?.length;
  useEffect(() => {
    if (query.length < minLength) {
      if (lastQuery.current !== '') abandon();
      lastQuery.current = '';
      return;
    }
    if (!settled || resultCount === undefined || query === lastQuery.current) return;
    if (current.current !== null && !current.current.clicked) abandon();
    lastQuery.current = query;
    const searchId = newEngagementSessionId();
    current.current = { searchId, queryLength: query.length, resultCount, clicked: false };
    readingTelemetry.recordV2({ type: 'discovery', action: 'search_submitted', surface: 'search', searchId, queryLength: query.length, resultCount, resultKind });
  }, [query, settled, resultCount, minLength, resultKind, abandon]);

  useEffect(() => abandon, [abandon]);

  const onResultsClick = useCallback(
    (event: { readonly target: EventTarget | null }) => {
      const submitted = current.current;
      const origin = event.target as { closest?: (selector: string) => Element | null } | null;
      const row = typeof origin?.closest === 'function' ? origin.closest(`[${rowAttribute}]`) : null;
      const id = row?.getAttribute(rowAttribute) ?? null;
      if (submitted === null || row === null || id === null) return;
      const position = row.parentElement === null ? 0 : Array.prototype.indexOf.call(row.parentElement.children, row);
      submitted.clicked = true;
      readingTelemetry.recordV2({
        type: 'discovery',
        action: 'search_result_click',
        target: { kind: targetKind, id },
        surface: 'search',
        listing: { position: Math.max(0, position), rankingSource: 'search' },
        searchId: submitted.searchId,
        queryLength: submitted.queryLength,
        resultCount: submitted.resultCount,
        resultKind,
      });
    },
    [rowAttribute, targetKind, resultKind],
  );

  return { onResultsClick };
}
