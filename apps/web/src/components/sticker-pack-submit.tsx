import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { STICKER_PACK_LIMITS } from '@meeshy/shared/types/sticker-pack';
import type { StickerPackDetail, StickerTextZone } from '@meeshy/shared/types/sticker-pack';

import { apiDeps } from '@/lib/api/deps';
import { submitPack } from '@/lib/api/sticker-packs';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { EMPTY_DRAFT, boxFromDrag, defaultZone, draftItemOf, draftProblems, manifestOf, problemItem, problemKey } from '@/lib/sticker-packs/draft';
import type { DraftItem, PackDraft } from '@/lib/sticker-packs/draft';
import { renderInstantSvg } from '@/lib/sticker-packs/render';

/**
 * **PROPOSER UN PACK** (#9141) — l'éditeur d'un tiers, dans la boutique.
 * Le chemin nominal : un nom, une signature, des images déposées, « Envoyer ».
 * Tout le reste se déduit (`lib/sticker-packs/draft.ts`) : le genre se lit
 * dans les octets, le titre dans le nom du fichier.
 *
 * Un Instant se règle à vue : on trace sur l'image la zone où le texte
 * s'écrira, l'aperçu montre le texte par défaut ET le plus long admis, mis en
 * page par la fonction même que la passerelle applique — l'éditeur refuse ce
 * qu'elle refuserait, au sticker près, avant tout envoi.
 */

const CODE_KEYS: Readonly<Record<string, InterfaceCatalogKey>> = {
  STICKER_PACK_SLUG_TAKEN: 'stickerPacks.submit.slugTaken',
  STICKER_PACK_TOO_MANY_PENDING: 'stickerPacks.submit.tooMany',
  STICKER_PACK_ASSET_REFUSED: 'stickerPacks.submit.assetRefused',
  STICKER_PACK_TOO_LARGE: 'stickerPacks.submit.tooLarge',
};

const INPUT = 'min-h-11 rounded-xl px-3 text-body';
const INPUT_STYLE = { backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' } as const;

export function PackSubmitEditor({
  language,
  onClose,
  onSubmitted,
}: {
  readonly language: InterfaceLanguage;
  readonly onClose: () => void;
  readonly onSubmitted: (pack: StickerPackDetail) => void;
}) {
  const [draft, setDraft] = useState<PackDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<InterfaceCatalogKey | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const counter = useRef(0);

  const urls = useObjectUrls(draft.items);
  const problems = useMemo(() => draftProblems(draft), [draft]);
  const packProblems = [...new Set(problems.filter((p) => problemItem(p) === null).map(problemKey))];

  const patch = (update: Partial<Omit<PackDraft, 'items'>>) => setDraft((current) => ({ ...current, ...update }));
  const patchItem = (id: string, update: Partial<DraftItem>) =>
    setDraft((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, ...update } : item)) }));

  const add = async (files: readonly File[]) => {
    const made = await files.reduce<Promise<readonly DraftItem[]>>(async (previous, file) => {
      const done = await previous;
      const taken = new Set([...draft.items, ...done].map((item) => item.key));
      counter.current += 1;
      const item = await draftItemOf(file, taken, `d${counter.current}`);
      return item === null ? done : [...done, item];
    }, Promise.resolve([]));
    setDraft((current) => ({ ...current, items: [...current.items, ...made].slice(0, STICKER_PACK_LIMITS.maxItems) }));
  };

  const send = async () => {
    if (busy || problems.length > 0) return;
    setBusy(true);
    setRefusal(null);
    const result = await submitPack(apiDeps, manifestOf(draft));
    setBusy(false);
    if (result.ok) {
      onSubmitted(result.data);
      return;
    }
    setRefusal((result.code !== undefined ? CODE_KEYS[result.code] : undefined) ?? 'stickerPacks.submit.failed');
  };

  return (
    <div data-pack-submit className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(language, 'stickerPacks.submit.title')}
        </h3>
        <button type="button" data-pack-submit-back className="min-h-11 rounded-full px-3 text-body" style={{ color: 'var(--color-ios-ink)' }} onClick={onClose}>
          {translate(language, 'stickerPacks.submit.back')}
        </button>
      </div>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'stickerPacks.submit.hint')}
      </p>

      <Field label={translate(language, 'stickerPacks.submit.name')}>
        <input data-pack-name type="text" maxLength={STICKER_PACK_LIMITS.maxNameLength} value={draft.name} onInput={(e) => patch({ name: e.currentTarget.value })} className={INPUT} style={INPUT_STYLE} />
      </Field>
      <Field label={translate(language, 'stickerPacks.submit.description')}>
        <textarea
          data-pack-description
          rows={2}
          maxLength={STICKER_PACK_LIMITS.maxDescriptionLength}
          value={draft.description}
          onInput={(e) => patch({ description: e.currentTarget.value })}
          className="rounded-xl px-3 py-2 text-body"
          style={INPUT_STYLE}
        />
      </Field>
      <Field label={translate(language, 'stickerPacks.submit.author')}>
        <input data-pack-author type="text" maxLength={STICKER_PACK_LIMITS.maxAuthorLength} value={draft.author} onInput={(e) => patch({ author: e.currentTarget.value })} className={INPUT} style={INPUT_STYLE} />
      </Field>

      <button
        type="button"
        data-pack-add
        onClick={() => fileInput.current?.click()}
        className="min-h-11 self-start rounded-full px-4 text-body"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--color-ios-ink)' }}
      >
        {translate(language, 'stickerPacks.submit.add')}
      </button>
      <input
        ref={fileInput}
        data-pack-files
        type="file"
        accept="image/png,image/webp,image/gif,image/jpeg"
        multiple
        hidden
        aria-label={translate(language, 'stickerPacks.submit.add')}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          void add(files);
        }}
      />

      <ul className="flex flex-col gap-3">
        {draft.items.map((item, index) => (
          <DraftItemRow
            key={item.id}
            item={item}
            url={urls.get(item.id) ?? ''}
            language={language}
            problems={[...new Set(problems.filter((p) => problemItem(p) === index).map(problemKey))]}
            onChange={(update) => patchItem(item.id, update)}
            onRemove={() => setDraft((current) => ({ ...current, items: current.items.filter((candidate) => candidate.id !== item.id) }))}
          />
        ))}
      </ul>

      <ProblemList keys={packProblems} language={language} />
      <p className="text-caption" role="status" aria-live="polite" style={{ color: 'var(--ios-error)' }}>
        {refusal !== null ? translate(language, refusal) : ''}
      </p>
      <button
        type="button"
        data-pack-submit-send
        disabled={busy || problems.length > 0}
        onClick={() => void send()}
        className="min-h-11 self-end rounded-full px-5 text-body font-semibold disabled:opacity-50"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--color-ios-on-brand)' }}
      >
        {translate(language, busy ? 'stickerPacks.submit.sending' : 'stickerPacks.submit.send')}
      </button>
    </div>
  );
}

/** Une adresse locale par image du brouillon, rendue quand l'image le quitte. */
function useObjectUrls(items: readonly DraftItem[]): ReadonlyMap<string, string> {
  const cache = useRef(new Map<string, string>());
  const urls = useMemo(() => {
    const next = new Map(items.map((item) => [item.id, cache.current.get(item.id) ?? URL.createObjectURL(item.file)]));
    cache.current.forEach((url, id) => {
      if (!next.has(id)) URL.revokeObjectURL(url);
    });
    cache.current = next;
    return next;
  }, [items]);
  useEffect(() => () => cache.current.forEach((url) => URL.revokeObjectURL(url)), []);
  return urls;
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function ProblemList({ keys, language }: { readonly keys: readonly InterfaceCatalogKey[]; readonly language: InterfaceLanguage }) {
  if (keys.length === 0) return null;
  return (
    <ul data-pack-problems className="flex flex-col gap-0.5 text-caption" style={{ color: 'var(--ios-error)' }}>
      {keys.map((key) => (
        <li key={key}>{translate(language, key)}</li>
      ))}
    </ul>
  );
}

function DraftItemRow({
  item,
  url,
  language,
  problems,
  onChange,
  onRemove,
}: {
  readonly item: DraftItem;
  readonly url: string;
  readonly language: InterfaceLanguage;
  readonly problems: readonly InterfaceCatalogKey[];
  readonly onChange: (update: Partial<DraftItem>) => void;
  readonly onRemove: () => void;
}) {
  const zone = item.zones[0];
  const setZone = (update: Partial<StickerTextZone>) => {
    if (zone === undefined) return;
    onChange({ zones: [{ ...zone, ...update }] });
  };
  return (
    <li data-draft-item={item.key} className="flex flex-col gap-2 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <div className="flex items-start gap-3">
        {item.instant && zone !== undefined ? (
          <ZoneCanvas item={item} zone={zone} url={url} onBox={(box) => setZone({ box })} />
        ) : (
          <img src={url} alt="" className="h-24 w-24 shrink-0 rounded-xl object-contain" style={{ backgroundColor: 'var(--color-ios-fill)' }} />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex gap-2">
            <input
              data-draft-title
              aria-label={translate(language, 'stickerPacks.submit.itemTitle')}
              type="text"
              maxLength={STICKER_PACK_LIMITS.maxTitleLength}
              value={item.title}
              onInput={(e) => onChange({ title: e.currentTarget.value })}
              className={`${INPUT} min-w-0 flex-1`}
              style={INPUT_STYLE}
            />
            <input
              data-draft-emoji
              aria-label={translate(language, 'stickerPacks.submit.emoji')}
              type="text"
              maxLength={8}
              value={item.emoji}
              onInput={(e) => onChange({ emoji: e.currentTarget.value })}
              className={`${INPUT} w-14 text-center`}
              style={INPUT_STYLE}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-11 items-center gap-2 text-body" style={{ color: 'var(--color-ios-ink)' }}>
              <input
                data-draft-instant
                type="checkbox"
                checked={item.instant}
                onChange={(e) => {
                  const instant = e.currentTarget.checked;
                  onChange({ instant, zones: instant ? (item.zones.length > 0 ? item.zones : [defaultZone(0)]) : [] });
                }}
              />
              {translate(language, 'stickerPacks.submit.instant')}
            </label>
            <span className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
              {translate(language, item.instant ? 'stickerPacks.kind.instant' : item.animated ? 'stickerPacks.kind.cinematic' : 'stickerPacks.kind.static')}
            </span>
            <button type="button" data-draft-remove className="min-h-11 rounded-full px-3 text-caption" style={{ color: 'var(--ios-error)' }} onClick={onRemove}>
              {translate(language, 'stickerPacks.submit.removeItem')}
            </button>
          </div>
        </div>
      </div>
      {item.instant && zone !== undefined ? (
        <div className="flex flex-col gap-2">
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(language, 'stickerPacks.submit.zoneHint')}
          </p>
          <div className="flex gap-2">
            <Field label={translate(language, 'stickerPacks.submit.zoneDefault')}>
              <input
                data-zone-default
                type="text"
                maxLength={STICKER_PACK_LIMITS.maxTextLength}
                value={zone.defaultText}
                onInput={(e) => setZone({ defaultText: e.currentTarget.value })}
                className={INPUT}
                style={INPUT_STYLE}
              />
            </Field>
            <Field label={translate(language, 'stickerPacks.submit.zoneLength')}>
              <input
                data-zone-length
                type="number"
                min={1}
                max={STICKER_PACK_LIMITS.maxTextLength}
                value={zone.maxLength}
                onInput={(e) => {
                  const value = Math.round(Number(e.currentTarget.value));
                  if (Number.isFinite(value) && value >= 1) setZone({ maxLength: Math.min(value, STICKER_PACK_LIMITS.maxTextLength) });
                }}
                className={`${INPUT} w-24`}
                style={INPUT_STYLE}
              />
            </Field>
          </div>
        </div>
      ) : null}
      <ProblemList keys={problems} language={language} />
    </li>
  );
}

/**
 * L'image d'un Instant, sa zone tracée au doigt ou à la souris, et le texte
 * le plus LONG que la zone admet — ce que le tiers voit est le pire cas que
 * l'utilisateur pourra écrire.
 */
function ZoneCanvas({
  item,
  zone,
  url,
  onBox,
}: {
  readonly item: DraftItem;
  readonly zone: StickerTextZone;
  readonly url: string;
  readonly onBox: (box: StickerTextZone['box']) => void;
}) {
  const start = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const C = STICKER_PACK_LIMITS.canvas;
  const at = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { point: { x: event.clientX - rect.left, y: event.clientY - rect.top }, scale: rect.width > 0 ? C / rect.width : 1 };
  };
  const longest = 'M'.repeat(zone.maxLength);
  return (
    <div
      data-zone-canvas
      className="relative h-40 w-40 shrink-0 touch-none select-none overflow-hidden rounded-xl"
      style={{ backgroundColor: 'var(--color-ios-fill)' }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        start.current = at(event).point;
      }}
      onPointerMove={(event) => {
        if (start.current === null) return;
        const { point, scale } = at(event);
        onBox(boxFromDrag(start.current, point, scale));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
    >
      <span
        aria-hidden
        className="block h-full w-full"
        dangerouslySetInnerHTML={{ __html: renderInstantSvg({ title: item.title, zones: [zone] }, { imageHref: url, slots: { [zone.slot]: longest }, uid: `draft-${item.id}` }) }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-sm"
        style={{
          left: `${(zone.box.x / C) * 100}%`,
          top: `${(zone.box.y / C) * 100}%`,
          width: `${(zone.box.width / C) * 100}%`,
          height: `${(zone.box.height / C) * 100}%`,
          outline: '2px dashed var(--accent)',
        }}
      />
    </div>
  );
}
