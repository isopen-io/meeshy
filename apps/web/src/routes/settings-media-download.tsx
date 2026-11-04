import { useId, type ReactNode } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { CALLS_GLYPHS } from '@/components/glyphs-calls';
import { RowIcon, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { AUTO_DOWNLOAD_POLICIES, type AutoDownloadKind, type AutoDownloadPolicy } from '@/lib/media/auto-download-policy';
import { mediaDownloadStore, useMediaDownloadPreferences, type MediaDownloadStore } from '@/lib/media/media-download-preferences';

/**
 * **LE TÉLÉCHARGEMENT AUTOMATIQUE DES MÉDIAS** (#6333) — la rangée de
 * `MediaDownloadSettingsView` d'iOS, dans la section « Données » : une
 * politique par type (images, vidéos), tenue par l'appareil, entendue par le
 * fil sans recharger. Au-delà de ce qu'elle permet, la bulle DEMANDE ; sous
 * 100 Ko, le média part toujours seul — la légende le dit.
 */
const POLICY_KEY = {
  always: 'media.policy.always',
  wifiAndGoodCellular: 'media.policy.wifiAndGoodCellular',
  wifiOnly: 'media.policy.wifiOnly',
  never: 'media.policy.never',
} as const satisfies Readonly<Record<AutoDownloadPolicy, string>>;

const KINDS: readonly { readonly kind: AutoDownloadKind; readonly label: 'settings.media_download.images' | 'settings.media_download.videos'; readonly icon: ReactNode }[] = [
  { kind: 'image', label: 'settings.media_download.images', icon: <Glyph name="image" size={15} /> },
  { kind: 'video', label: 'settings.media_download.videos', icon: <GlyphSvg glyph={CALLS_GLYPHS.videoCamera} size={15} /> },
];

const isPolicy = (value: string): value is AutoDownloadPolicy => (AUTO_DOWNLOAD_POLICIES as readonly string[]).includes(value);

export function MediaDownloadRows({ language, store = mediaDownloadStore() }: { readonly language: InterfaceLanguage; readonly store?: MediaDownloadStore }) {
  const preferences = useMediaDownloadPreferences(store);
  const captionId = useId();
  return (
    <div data-settings-media-download className="grid">
      <div className="px-3.5 pt-2.5">
        <span className="block text-body font-medium" style={{ color: SECTION_INK }}>
          {translate(language, 'settings.media_download')}
        </span>
        <span id={captionId} className="block text-caption" style={{ color: SECTION_INK_2 }}>
          {translate(language, 'settings.media_download.info')}
        </span>
      </div>
      {KINDS.map(({ kind, label, icon }) => (
        <label key={kind} className="flex items-center gap-3 px-3.5 py-2" style={{ minHeight: 52 }}>
          <RowIcon tint="var(--ios-indigo-400)">{icon}</RowIcon>
          <span className="min-w-0 flex-1 text-body font-medium" style={{ color: SECTION_INK }}>
            {translate(language, label)}
          </span>
          <select
            data-media-download={kind}
            aria-describedby={captionId}
            value={preferences[kind]}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (isPolicy(next)) store.setPolicy(kind, next);
            }}
            className="shrink-0 rounded-chip bg-transparent px-2 text-body font-semibold focus-visible:outline-2"
            style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {AUTO_DOWNLOAD_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {translate(language, POLICY_KEY[policy])}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
