import { useEffect, useMemo, useRef, useState } from 'react';

import { Glyph } from '@/components/glyph';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps, postMediaUploadDeps } from '@/lib/api/deps';
import type { ApiFailure } from '@/lib/api/http';
import type { PostMediaUploadDeps, PostMediaUploadResult } from '@/lib/api/post-media-upload';
import { POST_CONTENT_MAX_LENGTH, publishPost, type PublishPostType } from '@/lib/api/posts-publish';
import { refreshFeedAction } from '@/lib/api/query';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import {
  MAX_POST_MEDIA,
  draftRefusal,
  emptyDraft,
  hasFailedUpload,
  publishableMedia,
  withContent,
  withMediaAdded,
  withMediaRemoved,
  withType,
  withUpload,
  type DraftMedia,
  type PostDraft,
} from '@/lib/publish/draft';
import { useSearch } from '@/lib/router';
import { READING_COLUMN_STYLE } from '@/lib/view/reading-column';
import { useComposeLanguage } from '@/lib/view/use-compose-language';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { Link, href, navigate } from '@/routes/route-table';

/**
 * **PUBLIER DANS LE FIL** (#7449) — un texte, des médias, un format, on publie.
 *
 * ## DÉLIBÉRÉMENT MINIMAL, comme `status-compose.tsx`
 *
 * La directive porteur du 2026-09-17 vaut ici mot pour mot : « des choses
 * simples facilement implémentables et répliquant ce qui existe sur iOS ». On
 * prend de `MeeshyComposerHost` (le meuble complet, plusieurs milliers de
 * lignes) ses TROIS pièces utiles — un texte, des médias montés, un format —
 * et rien d'autre. Ce que cet écran ne fait PAS — audience, lieu, mentions
 * déclarées, repartage, son, montage, brouillon persisté — est une issue de
 * suivi, jamais une dette silencieuse.
 *
 * ## UNE ADRESSE, DEUX INTENTIONS
 *
 * `/posts/new` et `/posts/new?type=reel` sont le MÊME écran : la composition
 * est identique (un texte, des médias), seule la CLASSIFICATION diffère, et
 * l'auteur doit pouvoir changer d'avis sans perdre sa saisie — d'où la
 * bascule, et d'où l'adresse qui SUIT ce choix (un rechargement retrouve le
 * format). Même dispositif que `/stories?author=` : une adresse, un filtre.
 *
 * C'est l'inverse de `/status/new`, et pour une raison qui tient : une humeur
 * n'a ni texte long, ni média, ni format — ce n'était pas un mode, c'était un
 * autre écran.
 *
 * ## LE RÉEL SE REFUSE, IL NE SE DÉGRADE PAS
 *
 * `qualifiesAsReel` (`packages/shared/utils/reel-composition.ts`) est la règle
 * SERVEUR. Sans elle côté client, un réel de texte seul partait et la
 * passerelle le DÉGRADAIT en post sans un mot : l'auteur choisissait un format
 * et en obtenait un autre. L'écran refuse en NOMMANT ce qui manque — c'est le
 * seul des deux verdicts qu'il puisse réparer (miroir de
 * `ComposerDocumentSendRefusal.reelWithoutQualifyingMedia`, iOS).
 */

export type PostComposeDeps = {
  readonly api: ConversationsDeps;
  readonly upload: PostMediaUploadDeps;
};

const defaultPostComposeDeps: PostComposeDeps = { api: apiDeps, upload: postMediaUploadDeps };

/** La valeur de `?type=` qui ouvre le format RÉEL — tout le reste ouvre un post. */
export const REEL_SEARCH_VALUE = 'reel';

export function composeTypeOf(search: URLSearchParams): PublishPostType {
  return search.get('type') === REEL_SEARCH_VALUE ? 'REEL' : 'POST';
}

/**
 * LA DURÉE, MESURÉE SUR LE FICHIER LOCAL — connue SANS réseau, dès la
 * sélection, et c'est elle que `qualifiesAsReel` compare à ses trois secondes.
 * `null` sur tout échec de décodage : une durée inconnue ne qualifie jamais
 * (jamais de repli permissif, § `reel-composition.ts`).
 */
export function measureDurationMs(previewUrl: string, mimeType: string): Promise<number | null> {
  if (!mimeType.startsWith('video/') && !mimeType.startsWith('audio/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const element = document.createElement(mimeType.startsWith('video/') ? 'video' : 'audio');
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      resolve(Number.isFinite(element.duration) && element.duration > 0 ? Math.round(element.duration * 1000) : null);
    };
    element.onerror = () => resolve(null);
    element.src = previewUrl;
  });
}

function revokeIfLocal(url: string | undefined): void {
  if (url !== undefined && url.startsWith('blob:')) URL.revokeObjectURL(url);
}

export function PostComposeHeader({ language, title }: { readonly language: InterfaceLanguage; readonly title: string }) {
  return (
    <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
      <Link
        to="feed"
        aria-label={translate(language, 'pending.back')}
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="caretLeft" size={20} />
      </Link>
      <h1 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {title}
      </h1>
    </header>
  );
}

/**
 * LA BASCULE DU FORMAT — un `radiogroup`, jamais deux boutons indépendants :
 * ce que l'auteur fait ici est CHOISIR UN parmi deux, et c'est ce rôle, avec
 * `aria-checked`, qui l'annonce comme tel au lecteur d'écran plutôt que comme
 * deux actions sans rapport. Même patron que `MoodGrid` (`status-compose.tsx`).
 *
 * Les deux cibles restent dans l'ordre de tabulation — un `radiogroup` NATIF
 * n'en offre qu'une et déplace la sélection aux flèches ; avec DEUX options,
 * tabuler les deux coûte un appui et n'en perd aucune. Le jour où ce groupe en
 * portera plus, il prendra `useRovingMenu` comme ses voisins.
 */
export function FormatToggle({
  language,
  value,
  onChange,
}: {
  readonly language: InterfaceLanguage;
  readonly value: PublishPostType;
  readonly onChange: (next: PublishPostType) => void;
}) {
  const options: ReadonlyArray<{ readonly type: PublishPostType; readonly label: string }> = [
    { type: 'POST', label: translate(language, 'feed.create.post') },
    { type: 'REEL', label: translate(language, 'feed.create.reel') },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={translate(language, 'post.compose.format')}
      data-post-format
      className="flex gap-2 px-4 pt-1 pb-3"
    >
      {options.map((option) => {
        const actif = option.type === value;
        return (
          <button
            key={option.type}
            type="button"
            role="radio"
            aria-checked={actif}
            data-post-format-choice={option.type}
            onClick={() => onChange(option.type)}
            className="grid flex-1 place-items-center rounded-chip px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              outlineColor: 'var(--color-ios-brand)',
              background: actif ? 'var(--color-ios-brand)' : 'var(--color-ios-card)',
              color: actif ? '#fff' : 'var(--color-ios-ink)',
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Une vignette du brouillon : l'aperçu LOCAL, l'état de son envoi, et son retrait. */
export function DraftMediaTile({
  language,
  item,
  onRemove,
}: {
  readonly language: InterfaceLanguage;
  readonly item: DraftMedia;
  readonly onRemove: () => void;
}) {
  const video = item.mimeType.startsWith('video/');
  return (
    <li className="relative shrink-0 overflow-hidden rounded-card" style={{ width: 96, height: 96, backgroundColor: 'var(--color-edge)' }}>
      {video ? (
        <video src={item.previewUrl} muted playsInline className="size-full object-cover" />
      ) : (
        <img src={item.previewUrl} alt="" className="size-full object-cover" />
      )}
      {item.upload.phase === 'ready' ? null : (
        <span
          role="status"
          data-post-media-state={item.upload.phase}
          className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-center text-mini font-semibold text-white"
          style={{ backgroundColor: item.upload.phase === 'failed' ? 'var(--color-error)' : 'rgba(0,0,0,0.55)' }}
        >
          {translate(language, item.upload.phase === 'failed' ? 'post.compose.media.failed' : 'post.compose.media.sending')}
        </span>
      )}
      <button
        type="button"
        data-post-media-remove={item.key}
        aria-label={translate(language, 'post.compose.media.remove')}
        onClick={onRemove}
        className="absolute grid place-items-center rounded-full text-white focus-visible:outline-2"
        /* `insetInlineEnd`/`top` en style INLINE : la table des jetons n'émet
           ni `end-1` ni `top-1` (mesuré, `check-utilities.mjs`), et une classe
           sans règle ne peint RIEN sans rougir nulle part. */
        style={{ insetInlineEnd: 4, top: 4, width: 28, height: 28, backgroundColor: 'rgba(0,0,0,0.55)', outlineColor: '#fff' }}
      >
        <Glyph name="x" size={14} />
      </button>
    </li>
  );
}

type PendingUpload = Promise<{ readonly ok: true; readonly data: PostMediaUploadResult } | ApiFailure>;

let draftSequence = 0;
const nextDraftKey = (): string => {
  draftSequence += 1;
  return `draft-media-${draftSequence}`;
};

export default function PostComposeScreen({ deps = defaultPostComposeDeps }: { readonly deps?: PostComposeDeps } = {}) {
  const language = currentInterfaceLanguage();
  const online = useOnline();
  const [search, setSearch] = useSearch();
  const [draft, setDraft] = useState<PostDraft>(() => emptyDraft(composeTypeOf(search)));
  const [publishing, setPublishing] = useState(false);
  const [failed, setFailed] = useState(false);

  const reader = useReaderLanguages();
  const { language: composeLanguage, setText: reportComposeText } = useComposeLanguage({ preferred: reader.languages });

  /**
   * LE BROUILLON, LU SANS ATTENDRE UN RENDU — la publication doit connaître
   * l'état EXACT après l'attente des envois, et `draft` capturé dans la
   * fermeture est celui du rendu qui a créé le gestionnaire. Une réf tenue à
   * jour PAR le même site que l'état (`updateDraft`) est la seule forme qui ne
   * puisse pas diverger : deux écritures séparées, si.
   */
  const draftRef = useRef<PostDraft>(draft);
  const updateDraft = (change: (current: PostDraft) => PostDraft) => {
    draftRef.current = change(draftRef.current);
    setDraft(draftRef.current);
  };

  const pendingRef = useRef<Map<string, PendingUpload>>(new Map());
  const abortRef = useRef<Map<string, AbortController>>(new Map());
  /** Les URL locales à révoquer au démontage — lues depuis une réf parce
   * qu'un effet de nettoyage ne doit pas dépendre du brouillon (il se
   * relancerait à chaque frappe et révoquerait des aperçus vivants). */
  const previewsRef = useRef<string[]>([]);
  useEffect(
    () => () => {
      for (const controller of abortRef.current.values()) controller.abort();
      for (const url of previewsRef.current) revokeIfLocal(url);
    },
    [],
  );

  const refusal = draftRefusal(draft);
  const publiable = refusal === null && !publishing && online;

  function setType(next: PublishPostType) {
    updateDraft((current) => withType(current, next));
    const params = new URLSearchParams(search);
    if (next === 'REEL') params.set('type', REEL_SEARCH_VALUE);
    else params.delete('type');
    setSearch(params, true);
  }

  function startUpload(item: DraftMedia, file: File) {
    const controller = new AbortController();
    abortRef.current.set(item.key, controller);
    const pending: PendingUpload = import('@/lib/api/post-media-upload')
      .then(({ uploadPostMedia }) => uploadPostMedia({ ...deps.upload, file, uploadContext: 'post', signal: controller.signal }))
      .catch((): ApiFailure => ({ ok: false, status: 0, error: 'Module de téléversement indisponible', code: 'NETWORK' }));
    pendingRef.current.set(item.key, pending);
    void pending.then((result) => {
      if (pendingRef.current.get(item.key) !== pending) return;
      updateDraft((current) =>
        withUpload(current, item.key, result.ok ? { phase: 'ready', postMediaId: result.data.postMediaId } : { phase: 'failed' }),
      );
    });
  }

  function place(files: readonly File[]) {
    /* `draftRef`, jamais `draft` : deux sélections rapprochées partagent la
       fermeture du même rendu, et `withMediaAdded` écarterait alors des
       fichiers dont la montée serait DÉJÀ partie — des octets envoyés pour un
       média que le brouillon ne porte pas. */
    const room = Math.max(0, MAX_POST_MEDIA - draftRef.current.media.length);
    const retenus = files.slice(0, room);
    const items = retenus.map((file): DraftMedia => {
      const previewUrl = URL.createObjectURL(file);
      previewsRef.current.push(previewUrl);
      return { key: nextDraftKey(), name: file.name, mimeType: file.type, previewUrl, durationMs: null, upload: { phase: 'sending' } };
    });
    updateDraft((current) => withMediaAdded(current, items));
    items.forEach((item, index) => {
      const file = retenus[index]!;
      startUpload(item, file);
      /* La mesure décode le fichier LOCAL, hors du chemin de montée : un format
         que ce navigateur ne sait pas décoder ne bloque ni l'aperçu ni la
         publication — il prive seulement le réel de sa qualification. */
      void measureDurationMs(item.previewUrl, item.mimeType).then((durationMs) => {
        if (durationMs === null) return;
        updateDraft((current) => ({ ...current, media: current.media.map((m) => (m.key === item.key ? { ...m, durationMs } : m)) }));
      });
    });
  }

  function remove(key: string) {
    abortRef.current.get(key)?.abort();
    abortRef.current.delete(key);
    pendingRef.current.delete(key);
    revokeIfLocal(draftRef.current.media.find((item) => item.key === key)?.previewUrl);
    updateDraft((current) => withMediaRemoved(current, key));
  }

  async function publier() {
    setPublishing(true);
    setFailed(false);
    /* LES ENVOIS EN VOL SONT ATTENDUS, jamais renvoyés — la publication lit
       l'accusé de LEUR montée (même discipline que le studio des stories). */
    const pending = [...pendingRef.current.values()];
    if (pending.length > 0) await Promise.all(pending);
    const settled = draftRef.current;
    const result = await publishPost({
      ...deps.api,
      type: settled.type,
      ...(settled.content.trim() === '' ? {} : { content: settled.content }),
      originalLanguage: composeLanguage,
      media: publishableMedia(settled),
    });
    setPublishing(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    for (const url of previewsRef.current) revokeIfLocal(url);
    previewsRef.current = [];
    void refreshFeedAction();
    navigate(href('feed'), true);
  }

  const compteur = useMemo(() => `${draft.content.length} / ${POST_CONTENT_MAX_LENGTH}`, [draft.content.length]);

  return (
    <main className="flex h-dvh flex-col overflow-hidden pt-safe">
      <div className="flex min-h-0 flex-1 flex-col" style={READING_COLUMN_STYLE}>
        <PostComposeHeader language={language} title={translate(language, 'post.compose.title')} />
        <FormatToggle language={language} value={draft.type} onChange={setType} />

        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
          <div className="px-4">
            <label className="flex flex-col gap-1.5">
              <span className="sr-only">{translate(language, 'post.compose.text')}</span>
              <textarea
                data-post-text
                value={draft.content}
                rows={5}
                maxLength={POST_CONTENT_MAX_LENGTH}
                placeholder={translate(language, 'post.compose.text')}
                onInput={(event) => {
                  const value = (event.currentTarget as HTMLTextAreaElement).value;
                  updateDraft((current) => withContent(current, value));
                  reportComposeText(value);
                }}
                className="w-full resize-none rounded-card px-3 py-2.5 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
              />
            </label>
            <p aria-hidden="true" className="pt-1 text-end text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
              {compteur}
            </p>
          </div>

          {draft.media.length === 0 ? null : (
            <ul data-post-media className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-2">
              {draft.media.map((item) => (
                <DraftMediaTile key={item.key} language={language} item={item} onRemove={() => remove(item.key)} />
              ))}
            </ul>
          )}

          <div className="px-4 py-2">
            <label
              data-post-media-add
              className="inline-flex cursor-pointer items-center gap-2 rounded-chip px-4 text-body font-semibold focus-within:outline-2 focus-within:outline-offset-2"
              style={{ minHeight: 44, backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
            >
              <Glyph name="image" size={18} />
              {translate(language, 'post.compose.media.add')}
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="sr-only"
                disabled={draft.media.length >= MAX_POST_MEDIA}
                onChange={(event) => {
                  const input = event.currentTarget as HTMLInputElement;
                  place([...(input.files ?? [])]);
                  input.value = '';
                }}
              />
            </label>
          </div>

          {/* LES ÉTATS DESSINÉS — ce qui manque AVANT le geste, l'échec d'un
              média PENDANT, l'échec de la publication APRÈS. */}
          {refusal === null ? null : (
            <p data-post-refusal={refusal} className="px-4 pb-1 text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, refusal === 'empty' ? 'post.compose.refusal.empty' : 'post.compose.refusal.reel')}
            </p>
          )}
          {hasFailedUpload(draft) ? (
            <p role="alert" data-post-media-failed className="px-4 pb-1 text-check" style={{ color: 'var(--color-error)' }}>
              {translate(language, 'post.compose.media.failed')}
            </p>
          ) : null}
          {online ? null : (
            <p role="status" data-post-offline className="px-4 pb-1 text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, 'post.compose.offline')}
            </p>
          )}
          {failed ? (
            <p role="alert" data-post-error className="px-4 pb-1 text-check" style={{ color: 'var(--color-error)' }}>
              {translate(language, 'post.compose.error')}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 px-4 pb-safe">
          <button
            type="button"
            data-post-publish
            disabled={!publiable}
            onClick={() => {
              void publier();
            }}
            className="mb-3 grid w-full place-items-center rounded-chip px-5 py-3 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              background: publiable ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            {translate(language, publishing ? 'post.compose.publishing' : 'post.compose.publish')}
          </button>
        </div>
      </div>
    </main>
  );
}
