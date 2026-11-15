import { useQuery } from '@tanstack/react-query';
import { RELATION_LEVELS, type RelationLevel } from '@meeshy/shared/types/relation';

import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { bringAvailabilityQueryKey } from '@/lib/bring/bring-api';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  loadReceptionSettings,
  personSettingsQueryKey,
  setReceptionBlocked,
  type PersonSettingsDeps,
  type ReceptionBlock,
  type ReceptionSettings,
} from '@/lib/relations/person-settings';

/**
 * **COUPER CE QUE JE REÇOIS D'UNE PERSONNE, SUR LA FICHE D'UN LIEN** — iso
 * `CirclePersonSetting` (iOS, `CirclesPresentation.swift`). Le Bring (#13936) et
 * le talkie (#16638) sont actifs par défaut dès leur cercle : leur réglage par
 * personne est donc une COUPURE.
 *
 * - « Bloquer ses Bring » dès Ami ; « Couper son talkie » dès Proche (sa voix
 *   arrive alors en message vocal) ; « Couper ses invitations ensemble » dès
 *   Proche (#17023 : elle ne peut plus m'inviter à regarder ou écouter ensemble).
 * - « Ce que j'écoute » dès Proche (#16831) : un ACCORD, refusé par défaut —
 *   coché, ce que j'écoute sur mon iPhone part vers cette personne (iso
 *   `CirclePersonSwitch`, iOS). Même interrupteur : coché = le champ est vrai.
 * - `GET|PUT /relations/:userId/settings`, une lecture pour toute la fiche, une
 *   écriture stricte d'un champ.
 * - Optimiste : basculé au geste, rendu à l'état d'avant sur un refus, qui se dit.
 * - L'autre n'en est pas prévenu.
 */

type BlockSpec = {
  readonly minLevel: RelationLevel;
  readonly label: 'circles.settings.blockBring' | 'circles.settings.blockTalkie' | 'circles.settings.blockTogether' | 'circles.settings.listening';
  readonly detail:
    | 'circles.settings.blockBring.detail'
    | 'circles.settings.blockTalkie.detail'
    | 'circles.settings.blockTogether.detail'
    | 'circles.settings.shareListening.detail';
  readonly failed:
    | 'circles.settings.blockBring.failed'
    | 'circles.settings.blockTalkie.failed'
    | 'circles.settings.blockTogether.failed'
    | 'circles.settings.shareListening.failed';
  /** Ce qui se relit après le réglage : un blocage croisé change ma disponibilité de Bring. */
  readonly refresh: (userId: string) => readonly unknown[] | null;
};

const SPECS: Readonly<Record<ReceptionBlock, BlockSpec>> = {
  bringBlocked: {
    minLevel: 'FRIEND',
    label: 'circles.settings.blockBring',
    detail: 'circles.settings.blockBring.detail',
    failed: 'circles.settings.blockBring.failed',
    refresh: bringAvailabilityQueryKey,
  },
  talkieBlocked: {
    minLevel: 'CLOSE',
    label: 'circles.settings.blockTalkie',
    detail: 'circles.settings.blockTalkie.detail',
    failed: 'circles.settings.blockTalkie.failed',
    refresh: () => null,
  },
  togetherBlocked: {
    minLevel: 'CLOSE',
    label: 'circles.settings.blockTogether',
    detail: 'circles.settings.blockTogether.detail',
    failed: 'circles.settings.blockTogether.failed',
    refresh: () => null,
  },
  listeningCategoryShared: {
    minLevel: 'CLOSE',
    label: 'circles.settings.listening',
    detail: 'circles.settings.shareListening.detail',
    failed: 'circles.settings.shareListening.failed',
    refresh: () => null,
  },
};

const reaches = (level: RelationLevel, min: RelationLevel): boolean => RELATION_LEVELS.indexOf(level) >= RELATION_LEVELS.indexOf(min);

/** Les coupures et les accords qu'ouvre ce niveau, dans l'ordre de la fiche. */
export const receptionBlocksFor = (level: RelationLevel): readonly ReceptionBlock[] =>
  (Object.keys(SPECS) as ReceptionBlock[]).filter((block) => reaches(level, SPECS[block].minLevel));

const withBlock = (settings: ReceptionSettings | undefined, block: ReceptionBlock, value: boolean): ReceptionSettings => ({
  bringBlocked: settings?.bringBlocked ?? false,
  talkieBlocked: settings?.talkieBlocked ?? false,
  togetherBlocked: settings?.togetherBlocked ?? false,
  listeningCategoryShared: settings?.listeningCategoryShared ?? false,
  [block]: value,
});

export function CircleReceptionBlockSwitch({
  language,
  userId,
  level,
  block,
  onNotice,
  deps = apiDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly userId: string;
  readonly level: RelationLevel;
  readonly block: ReceptionBlock;
  readonly onNotice: (message: string) => void;
  readonly deps?: PersonSettingsDeps;
}) {
  const spec = SPECS[block];
  const opens = reaches(level, spec.minLevel);
  const key = personSettingsQueryKey(userId);
  const settings = useQuery(
    {
      queryKey: key,
      staleTime: 30_000,
      enabled: opens,
      queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadReceptionSettings(deps, userId, signal)),
    },
    appQueryClient,
  );
  if (!opens) return null;
  const checked = settings.data?.[block] ?? false;

  const toggle = async (next: boolean): Promise<void> => {
    await appQueryClient.cancelQueries({ queryKey: key });
    appQueryClient.setQueryData<ReceptionSettings>(key, (before) => withBlock(before, block, next));
    const result = await setReceptionBlocked(deps, userId, block, next);
    const refresh = spec.refresh(userId);
    if (refresh !== null) void appQueryClient.invalidateQueries({ queryKey: refresh });
    if (result.ok) {
      appQueryClient.setQueryData(key, result.data);
      return;
    }
    appQueryClient.setQueryData<ReceptionSettings>(key, (current) => withBlock(current, block, !next));
    onNotice(translateCircles(language, spec.failed));
  };

  const detailId = `circle-${block}-${userId}`;
  return (
    <label className="flex items-center gap-3" style={{ minHeight: 44 }}>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-body">{translateCircles(language, spec.label)}</span>
        <span id={detailId} className="text-caption opacity-70">
          {translateCircles(language, spec.detail)}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        data-circle-setting={spec.label}
        checked={checked}
        aria-describedby={detailId}
        onChange={(event) => void toggle(event.currentTarget.checked)}
        className="size-5"
      />
    </label>
  );
}
