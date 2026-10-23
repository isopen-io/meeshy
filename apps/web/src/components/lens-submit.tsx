import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { LENS_SUBMISSIONS_QUERY_KEY, loadLensSubmissions, submitLens, type LensPack } from '@/lib/api/lens-packs';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { prepareLensSubmission, serverRefusalOf, type Digest, type ServerRefusal } from '@/lib/lens-packs/submission';
import { lensSubmitText, type LensSubmitTextKey } from '@/lib/lens-packs/submit-texts';

/**
 * **PROPOSER UNE LENS** (W16, #11322) — la surface du partenaire, montée par la
 * boutique quand le domaine « Lens » est choisi. Le document MeeshyLens et les
 * fichiers que ses couches nomment partent par `POST /packs/lens/submissions`
 * (S16), préparés et contrôlés avant le réseau (`prepareLensSubmission`) ;
 * « Mes propositions » relit `GET /packs/lens/submissions` avec l'état et le
 * mot de la modération. Aucun prix, aucun crédit, aucun géo-créneau (#11251).
 *
 * L'éditeur sans code avec aperçu caméra attend le moteur de rendu web des
 * lens (W14, #11320) : cette surface en est la première tranche.
 */
type Notice = { readonly kind: 'submitted' } | { readonly kind: 'refused'; readonly reason: ServerRefusal; readonly detail?: string };

const STATUS_KEYS: Readonly<Record<string, LensSubmitTextKey>> = {
  pending: 'status.pending',
  approved: 'status.approved',
  rejected: 'status.rejected',
  withdrawn: 'status.withdrawn',
};

function SubmissionRow({ language, pack }: { readonly language: InterfaceLanguage; readonly pack: LensPack }) {
  const status = STATUS_KEYS[pack.status] ?? 'status.pending';
  return (
    <li data-lens-submission={pack.slug} data-lens-status={pack.status} className="grid gap-0.5 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <span className="font-semibold">{pack.name}</span>
      <span className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {lensSubmitText(language, status)}
      </span>
      {pack.reviewNote === null ? null : (
        <span data-lens-review-note className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {lensSubmitText(language, 'note', { note: pack.reviewNote })}
        </span>
      )}
    </li>
  );
}

export function LensSubmit({
  language,
  deps = apiDeps,
  digest,
}: {
  readonly language: InterfaceLanguage;
  readonly deps?: ConversationsDeps;
  readonly digest?: Digest;
}) {
  const queryClient = useQueryClient();
  const submissions = useQuery({
    queryKey: LENS_SUBMISSIONS_QUERY_KEY,
    queryFn: async () => {
      const result = await loadLensSubmissions(deps);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [assets, setAssets] = useState<readonly File[]>([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const submit = async (): Promise<void> => {
    if (documentFile === null || sending) return;
    setSending(true);
    const prepared = await prepareLensSubmission({ documentText: await documentFile.text(), files: assets, ...(digest === undefined ? {} : { digest }) });
    if (!prepared.ok) {
      setSending(false);
      setNotice({ kind: 'refused', reason: prepared.reason, ...(prepared.detail === undefined ? {} : { detail: prepared.detail }) });
      return;
    }
    const result = await submitLens(deps, prepared.submission);
    setSending(false);
    if (!result.ok) {
      setNotice({ kind: 'refused', reason: serverRefusalOf(result.code) });
      return;
    }
    setNotice({ kind: 'submitted' });
    queryClient.setQueryData<readonly LensPack[]>(LENS_SUBMISSIONS_QUERY_KEY, (rows) => [result.data, ...(rows ?? []).filter((row) => row.slug !== result.data.slug)]);
  };

  const rows = submissions.data ?? [];

  return (
    <section aria-labelledby="lens-submit-title" data-lens-submit className="grid gap-3 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-fill)' }}>
      <h3 id="lens-submit-title" className="text-body font-semibold">
        {lensSubmitText(language, 'title')}
      </h3>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {lensSubmitText(language, 'hint')}
      </p>
      <label className="grid gap-1 text-caption">
        <span>{lensSubmitText(language, 'document')}</span>
        <input data-lens-document type="file" accept="application/json,.json" onChange={(event) => setDocumentFile(event.currentTarget.files?.[0] ?? null)} />
      </label>
      <label className="grid gap-1 text-caption">
        <span>{lensSubmitText(language, 'assets')}</span>
        <input data-lens-assets type="file" multiple accept="image/png,image/webp,application/json,.png,.webp,.json" onChange={(event) => setAssets(Array.from(event.currentTarget.files ?? []))} />
      </label>
      <button
        type="button"
        data-lens-submit-button
        disabled={documentFile === null || sending}
        aria-busy={sending}
        onClick={() => void submit()}
        className="min-h-11 justify-self-start rounded-full px-4 font-semibold"
        style={{ backgroundColor: 'var(--accent, var(--color-ios-brand))', color: 'var(--color-ios-on-brand)' }}
      >
        {lensSubmitText(language, sending ? 'submitting' : 'submit')}
      </button>
      {notice === null ? null : notice.kind === 'submitted' ? (
        <p role="status" data-lens-submitted className="text-caption">
          {lensSubmitText(language, 'submitted')}
        </p>
      ) : (
        <p role="alert" data-lens-refusal={notice.reason} className="text-caption" style={{ color: 'var(--color-error)' }}>
          {lensSubmitText(language, `refusal.${notice.reason}`, { detail: notice.detail ?? '' })}
        </p>
      )}
      <h4 className="text-caption font-semibold">{lensSubmitText(language, 'mine')}</h4>
      {submissions.isSuccess && rows.length === 0 ? (
        <p data-lens-submissions-empty className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {lensSubmitText(language, 'empty')}
        </p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((pack) => (
            <SubmissionRow key={pack.slug} language={language} pack={pack} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default LensSubmit;
