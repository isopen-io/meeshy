import { useMemo, useRef, useState } from 'react';

import { LENS_SURFACES } from '@meeshy/shared/types/lens-format';

import type { InterfaceLanguage } from '@/lib/interface-language';
import { lensEditorText } from '@/lib/lens-packs/editor-texts';
import { DRAFT_LAYER_KINDS, emptyLensDraft, lensDocumentOf, lensDraftAddresses, lensDraftFiles, lensDraftProblems, newDraftLayer, type DraftLayer, type LensDraft } from '@/lib/lens-packs/lens-draft';
import type { Digest } from '@/lib/lens-packs/submission';
import { lensSubmitText } from '@/lib/lens-packs/submit-texts';
import { useLensPreview } from '@/lib/lens-packs/use-lens-preview';

import { LensCameraPreview, type CameraPreviewPort } from './lens-camera-preview';
import { LensEditorLayer } from './lens-editor-layer';

/**
 * **COMPOSER UNE LENS SANS CODE** (W16, #11322) — le chemin nominal : un nom,
 * une signature, une couche, « Proposer ». Le document MeeshyLens se compose
 * (`lens-draft.ts`) : l'adresse, le coût mesuré, les identifiants et les
 * adresses de fichiers se déduisent. L'aperçu caméra joue le brouillon EN
 * COURS par le moteur des effets (`lens-camera-preview.tsx`). L'envoi est
 * celui de l'import (`prepareLensSubmission`, puis la passerelle) : ce que
 * l'éditeur compose, la préparation le contrôle comme un document écrit à la main.
 */
const INPUT = 'min-h-11 rounded-xl px-3 text-body';
const INPUT_STYLE = { backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' } as const;

export function LensEditor({
  language,
  today,
  sending,
  digest,
  preview,
  onSubmit,
}: {
  readonly language: InterfaceLanguage;
  readonly today: string;
  readonly sending: boolean;
  readonly digest?: Digest;
  readonly preview?: CameraPreviewPort;
  readonly onSubmit: (documentText: string, files: readonly File[]) => void;
}) {
  const [draft, setDraft] = useState<LensDraft>(() => emptyLensDraft(today));
  const counter = useRef(0);
  const problems = useMemo(() => lensDraftProblems(draft), [draft]);
  const settings = useLensPreview({ draft, today, language, ...(digest === undefined ? {} : { digest }) });
  const cost = useMemo(() => lensDocumentOf(draft, { addresses: new Map(), today }).cost, [draft, today]);

  const patch = (update: Partial<Omit<LensDraft, 'layers'>>): void => setDraft((current) => ({ ...current, ...update }));
  const setLayers = (update: (layers: readonly DraftLayer[]) => readonly DraftLayer[]): void => setDraft((current) => ({ ...current, layers: update(current.layers) }));
  const addLayer = (kind: DraftLayer['kind']): void => {
    counter.current += 1;
    const key = `layer-${counter.current}`;
    setLayers((layers) => [...layers, newDraftLayer(kind, key)]);
  };
  const toggleSurface = (surface: LensDraft['surfaces'][number]): void =>
    patch({ surfaces: draft.surfaces.includes(surface) ? draft.surfaces.filter((entry) => entry !== surface) : LENS_SURFACES.filter((entry) => entry === surface || draft.surfaces.includes(entry)) });

  const submit = async (): Promise<void> => {
    if (problems.length > 0 || sending) return;
    const addresses = await lensDraftAddresses(draft, digest);
    onSubmit(JSON.stringify(lensDocumentOf(draft, { addresses, today })), lensDraftFiles(draft));
  };

  return (
    <div data-lens-editor className="grid gap-3">
      <label className="grid gap-1 text-caption">
        <span>{lensEditorText(language, 'name')}</span>
        <input data-lens-name type="text" maxLength={80} value={draft.name} onInput={(event) => patch({ name: event.currentTarget.value })} className={INPUT} style={INPUT_STYLE} />
      </label>
      <label className="grid gap-1 text-caption">
        <span>{lensEditorText(language, 'author')}</span>
        <input data-lens-author type="text" maxLength={80} value={draft.author} onInput={(event) => patch({ author: event.currentTarget.value })} className={INPUT} style={INPUT_STYLE} />
      </label>
      <fieldset className="grid gap-1 text-caption">
        <legend>{lensEditorText(language, 'surfaces')}</legend>
        {LENS_SURFACES.map((surface) => (
          <label key={surface} className="flex min-h-11 items-center gap-2">
            <input data-lens-surface={surface} type="checkbox" checked={draft.surfaces.includes(surface)} onChange={() => toggleSurface(surface)} />
            <span>{lensEditorText(language, `surface.${surface}`)}</span>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-caption">
          <span>{lensEditorText(language, 'startsOn')}</span>
          <input data-lens-starts type="date" value={draft.startsOn} onInput={(event) => patch({ startsOn: event.currentTarget.value })} className={INPUT} style={INPUT_STYLE} />
        </label>
        <label className="grid gap-1 text-caption">
          <span>{lensEditorText(language, 'endsOn')}</span>
          <input data-lens-ends type="date" value={draft.endsOn} onInput={(event) => patch({ endsOn: event.currentTarget.value })} className={INPUT} style={INPUT_STYLE} />
        </label>
      </div>
      <h4 className="text-caption font-semibold">{lensEditorText(language, 'layers')}</h4>
      <ul className="grid gap-2">
        {draft.layers.map((layer) => (
          <LensEditorLayer
            key={layer.key}
            language={language}
            layer={layer}
            onChange={(next) => setLayers((layers) => layers.map((entry) => (entry.key === layer.key ? next : entry)))}
            onRemove={() => setLayers((layers) => layers.filter((entry) => entry.key !== layer.key))}
          />
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {DRAFT_LAYER_KINDS.map((kind) => (
          <button key={kind} type="button" data-lens-add={kind} onClick={() => addLayer(kind)} className="min-h-11 rounded-full px-3 text-caption" style={{ backgroundColor: 'var(--color-ios-fill)' }}>
            {`+ ${lensEditorText(language, `add.${kind}`)}`}
          </button>
        ))}
      </div>
      <p data-lens-cost={cost} className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {lensEditorText(language, 'cost', { cost: lensEditorText(language, `cost.${cost}`) })}
      </p>
      <LensCameraPreview language={language} settings={settings} {...(preview === undefined ? {} : { port: preview })} />
      {problems.length === 0 ? null : (
        <ul className="grid gap-1 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {problems.map((problem) => (
            <li key={problem} data-lens-problem={problem}>
              {lensEditorText(language, `problem.${problem}`)}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        data-lens-compose-submit
        disabled={problems.length > 0 || sending}
        aria-busy={sending}
        onClick={() => void submit()}
        className="min-h-11 justify-self-start rounded-full px-4 font-semibold"
        style={{ backgroundColor: 'var(--accent, var(--color-ios-brand))', color: 'var(--color-ios-on-brand)' }}
      >
        {lensSubmitText(language, sending ? 'submitting' : 'submit')}
      </button>
    </div>
  );
}
