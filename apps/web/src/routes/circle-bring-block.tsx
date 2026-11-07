import { useQuery } from '@tanstack/react-query';
import { RELATION_LEVELS, type RelationLevel } from '@meeshy/shared/types/relation';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { bringAvailabilityQueryKey, bringBlockedQueryKey, loadBringBlocked, setBringBlocked, type BringDeps } from '@/lib/bring/bring-api';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **« BLOQUER SES BRING », SUR LA FICHE D'UN LIEN** (#13936, sous-lot
 * `proche-bring@web`) — iso `CirclePersonSetting.blockBring` (iOS,
 * `CirclesPresentation.swift`) : le Bring est disponible par défaut dès Ami
 * (décision D-3), son réglage par personne est donc un BLOCAGE.
 *
 * - `GET|PUT /relations/:userId/settings { bringBlocked }`, corps strict.
 * - Optimiste : coché au geste, rendu à l'état d'avant sur un refus, qui se dit.
 * - L'autre n'en est pas prévenu : il lit seulement « Bring indisponible ».
 * - Le blocage porte sur les Brings que JE reçois ; il ne change pas les miens
 *   vers cette personne, mais la disponibilité se relit quand même (un blocage
 *   croisé est possible) — le serveur reste juge.
 */

const FRIEND_RANK = RELATION_LEVELS.indexOf('FRIEND');

const opensBring = (level: RelationLevel): boolean => RELATION_LEVELS.indexOf(level) >= FRIEND_RANK;

export function CircleBringBlockSwitch({
  language,
  userId,
  level,
  onNotice,
  deps = apiDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly userId: string;
  readonly level: RelationLevel;
  readonly onNotice: (message: string) => void;
  readonly deps?: BringDeps;
}) {
  const key = bringBlockedQueryKey(userId);
  const blocked = useQuery(
    {
      queryKey: key,
      staleTime: 30_000,
      enabled: opensBring(level),
      queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadBringBlocked(deps, userId, signal)),
    },
    appQueryClient,
  );
  if (!opensBring(level)) return null;
  const checked = blocked.data ?? false;

  const toggle = async (next: boolean): Promise<void> => {
    await appQueryClient.cancelQueries({ queryKey: key });
    appQueryClient.setQueryData(key, next);
    const result = await setBringBlocked(deps, userId, next);
    void appQueryClient.invalidateQueries({ queryKey: bringAvailabilityQueryKey(userId) });
    if (result.ok) {
      appQueryClient.setQueryData(key, result.data);
      return;
    }
    appQueryClient.setQueryData(key, !next);
    onNotice(translateCircles(language, 'circles.settings.blockBring.failed'));
  };

  const detailId = `circle-bring-block-${userId}`;
  return (
    <label className="flex items-center gap-3" style={{ minHeight: 44 }}>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-body">{translateCircles(language, 'circles.settings.blockBring')}</span>
        <span id={detailId} className="text-caption opacity-70">
          {translateCircles(language, 'circles.settings.blockBring.detail')}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        data-circle-setting="circles.settings.blockBring"
        checked={checked}
        aria-describedby={detailId}
        onChange={(event) => void toggle(event.currentTarget.checked)}
        className="size-5"
      />
    </label>
  );
}
