import { useEffect, useState, useSyncExternalStore } from 'react';

import * as exportJobs from '@/lib/export/scene/scene-export-jobs';
import type { ImagerLengthChoice } from '@/lib/export/scene/scene-export-length';
import { isSceneExportCatalogLoaded, loadSceneExportCatalog, translateSceneExport } from '@/lib/i18n-scene-export-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { formatMediaTime } from '@/lib/view/seek-track';

/**
 * **LE BANDEAU DES EXPORTS EN COURS** (#13873) — monté une fois dans le chrome
 * différé : un export de publication tourne pendant que l'utilisateur
 * continue d'utiliser l'app, sa progression se lit et s'annule de n'importe
 * quel écran, « Imager » y propose ses parts (1/4 · 2/4 · 3/4 · 4/4, chacune
 * avec sa durée, la longueur rendue DEPUIS LE DÉBUT), et l'issue s'y dit une
 * fois. Rien ne se peint tant qu'aucun export n'a été lancé.
 *
 * « Partager » (#13881) y attend son toucher quand le rendu a fait expirer
 * l'activation du geste : le fichier est prêt, et le bouton « Partager » du
 * bandeau ouvre la feuille du système DANS son propre clic (`deliverNow`).
 */

const NOTICE_MS = 4000;

const NOTICE_KEY = {
  saved: 'sceneExport.notice.saved',
  shared: 'sceneExport.notice.shared',
  cancelled: 'sceneExport.notice.cancelled',
  failed: 'sceneExport.notice.failed',
  retry: 'sceneExport.notice.retry',
  unsupported: 'sceneExport.notice.unsupported',
  offline: 'sceneExport.notice.offline',
  busy: 'sceneExport.notice.busy',
} as const satisfies Readonly<Record<exportJobs.SceneExportNotice, string>>;

function useCatalogReady(language: InterfaceLanguage, needed: boolean): boolean {
  const [, setLoaded] = useState(0);
  const ready = isSceneExportCatalogLoaded(language);
  useEffect(() => {
    if (!needed || ready) return;
    let alive = true;
    void loadSceneExportCatalog(language).then(
      () => alive && setLoaded((count) => count + 1),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [language, needed, ready]);
  return ready;
}

function LengthChoice({ jobKey, choices, language }: { readonly jobKey: string; readonly choices: readonly ImagerLengthChoice[]; readonly language: InterfaceLanguage }) {
  const titleId = `scene-export-length-${jobKey}`;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="pointer-events-auto w-full max-w-sm rounded-card p-4 shadow-cast" style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}>
      <h2 id={titleId} className="text-title" style={{ color: 'var(--color-ios-ink)' }}>
        {translateSceneExport(language, 'sceneExport.length.title')}
      </h2>
      <p className="mt-1 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translateSceneExport(language, 'sceneExport.length.subtitle')}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {choices.map((choice) => (
          <button
            key={choice.quarter}
            type="button"
            data-imager-quarter={choice.quarter}
            onClick={() => exportJobs.choose(jobKey, choice.quarter)}
            className="min-h-11 rounded-chip px-3 text-body tabular-nums focus-visible:outline-2"
            style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translateSceneExport(language, 'sceneExport.length.option', { part: String(choice.quarter), duration: formatMediaTime(choice.durationMs / 1000) })}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => exportJobs.choose(jobKey, null)} className="mt-2 min-h-11 w-full rounded-chip text-body focus-visible:outline-2" style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}>
        {translateSceneExport(language, 'sceneExport.length.cancel')}
      </button>
    </div>
  );
}

function ReadyRow({ job, language }: { readonly job: exportJobs.SceneExportJobView; readonly language: InterfaceLanguage }) {
  return (
    <div data-scene-export-ready={job.key} className="pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-full py-1 pl-4 pr-1 shadow-cast" style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}>
      <p className="min-w-0 flex-1 truncate text-caption" style={{ color: 'var(--color-ios-ink)' }}>
        {translateSceneExport(language, 'sceneExport.tray.ready')}
      </p>
      <button type="button" onClick={() => exportJobs.cancel(job.key)} className="min-h-11 shrink-0 rounded-full px-3 text-caption focus-visible:outline-2" style={{ color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}>
        {translateSceneExport(language, 'sceneExport.tray.cancel')}
      </button>
      <button
        type="button"
        onClick={() => exportJobs.deliverNow(job.key)}
        className="min-h-11 shrink-0 rounded-full px-4 text-caption font-semibold focus-visible:outline-2"
        style={{ backgroundColor: 'var(--color-ios-brand)', color: 'var(--color-on-media)', outlineColor: 'var(--color-ios-brand)' }}
      >
        {translateSceneExport(language, 'sceneExport.tray.share')}
      </button>
    </div>
  );
}

function JobRow({ job, language }: { readonly job: exportJobs.SceneExportJobView; readonly language: InterfaceLanguage }) {
  const percent = job.progress === null ? null : Math.round(job.progress * 100);
  const label =
    !job.cancellable
      ? translateSceneExport(language, 'sceneExport.tray.delivering')
      : percent === null
        ? translateSceneExport(language, 'sceneExport.tray.preparing')
        : translateSceneExport(language, 'sceneExport.tray.progress', { percent: String(percent) });
  return (
    <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-full py-1 pl-4 pr-1 shadow-cast" style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-caption tabular-nums" style={{ color: 'var(--color-ios-ink)' }}>
          {label}
        </p>
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          {...(percent === null ? {} : { 'aria-valuenow': percent })}
          className="mt-1 h-1 overflow-hidden rounded-full"
          style={{ backgroundColor: 'var(--color-ios-fill)' }}
        >
          <div className="h-full origin-left rounded-full transition-transform duration-300 rtl:origin-right" style={{ transform: `scaleX(${(percent ?? 8) / 100})`, backgroundColor: 'var(--color-ios-brand)' }} />
        </div>
      </div>
      {job.cancellable ? (
        <button type="button" onClick={() => exportJobs.cancel(job.key)} className="min-h-11 shrink-0 rounded-full px-3 text-caption focus-visible:outline-2" style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}>
          {translateSceneExport(language, 'sceneExport.tray.cancel')}
        </button>
      ) : null}
    </div>
  );
}

export function SceneExportTray() {
  const state = useSyncExternalStore(exportJobs.subscribe, exportJobs.getSnapshot, exportJobs.getSnapshot);
  const language = currentInterfaceLanguage();
  const needed = state.jobs.length > 0 || state.notice !== null;
  const ready = useCatalogReady(language, needed);
  const noticeId = state.notice?.id;

  useEffect(() => {
    if (noticeId === undefined) return;
    const timer = setTimeout(() => exportJobs.dismissNotice(noticeId), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [noticeId]);

  if (!needed || !ready) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 z-[140] flex flex-col items-center gap-2 px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }} data-scene-export-tray>
      {state.jobs.map((job) =>
        job.choosing !== null ? (
          <LengthChoice key={job.key} jobKey={job.key} choices={job.choosing} language={language} />
        ) : job.ready ? (
          <ReadyRow key={job.key} job={job} language={language} />
        ) : (
          <JobRow key={job.key} job={job} language={language} />
        ),
      )}
      <p role="status" className="rounded-full px-4 py-2 text-caption empty:hidden" style={{ backgroundColor: 'var(--color-scrim)', color: 'var(--color-on-media)' }}>
        {state.notice === null ? '' : translateSceneExport(language, NOTICE_KEY[state.notice.notice])}
      </p>
    </div>
  );
}
