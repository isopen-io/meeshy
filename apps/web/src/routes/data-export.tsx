import { useState } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { deliverJsonFile, exportFileName, requestDataExport, type DataExportResult } from '@/lib/api/data-export';
import type { ApiResult } from '@/lib/api/http';
import { reachFailureOf, type ReachFailure } from '@/lib/api/link-failure';
import type { DeliverFileOutcome } from '@/lib/media/deliver-file';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';

import { ActionButton, ActionLink, LinkAlert, LinkPage, LinkText, ReachFailurePage, SignedOutPage } from './link-page-parts';

/**
 * **`/settings/data-export` — EXPORTER SES DONNÉES** (#6725). À la
 * décommission du legacy (#6702), la rangée « Exporter mes données » visait
 * `https://meeshy.me/settings#privacy` — une adresse morte — et a été
 * MASQUÉE (#6335) plutôt que laissée inerte (loi 4). Elle revient ici, à une
 * adresse propre à la v2.
 *
 * **Une page à part, pas un panneau des réglages** : le geste télécharge un
 * fichier, ce qui mérite son propre retour et son propre état — même
 * arbitrage que `/settings/notifications` et `/account/deletion`.
 *
 * **Le geste est explicite, jamais au montage** — même règle que la
 * suppression de compte et le désabonnement (#4183) : un préchargeur qui
 * suivrait cette adresse ne doit déclencher aucun export.
 *
 * Port : `lib/api/data-export.ts`, miroir `DataExportView.swift` (iOS) —
 * sans le sélecteur JSON/CSV de la vue iOS, un contrôle qui n'a pas d'effet
 * propre (voir le doc-comment du port).
 */

export type DataExportPageDeps = {
  readonly request: () => Promise<ApiResult<DataExportResult>>;
  readonly download: (fileName: string, jsonText: string) => Promise<DeliverFileOutcome>;
};

const GATEWAY_DEPS: DataExportPageDeps = {
  request: () => requestDataExport(apiDeps),
  download: (fileName, jsonText) => deliverJsonFile(fileName, jsonText),
};

type ExportFile = { readonly fileName: string; readonly jsonText: string };

/**
 * **UN EXPORT NON LIVRÉ RESTE EN MAIN** (#7864). Une feuille de partage fermée
 * sans choix, ou une activation de geste expirée pendant la requête (la coque
 * iOS n'a que `navigator.share`), ne perdent pas l'export : la page passe à
 * « prêt », et le tap suivant — une activation neuve — livre le MÊME fichier
 * sans le redemander au serveur. « Export terminé » ne se dit que livré.
 */
type ExportState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'exporting' }
  | { readonly phase: 'done' }
  | { readonly phase: 'ready'; readonly file: ExportFile; readonly undelivered: boolean }
  | { readonly phase: 'failed'; readonly failure: ReachFailure };

export function DataExportPage({
  signedIn,
  online,
  language,
  deps,
}: {
  readonly signedIn: boolean;
  readonly online: boolean;
  readonly language: InterfaceLanguage;
  readonly deps: DataExportPageDeps;
}) {
  const [state, setState] = useState<ExportState>({ phase: 'idle' });

  if (!signedIn) return <SignedOutPage language={language} />;

  async function runExport() {
    setState({ phase: 'exporting' });
    const result = await deps.request();
    if (!result.ok) {
      setState({ phase: 'failed', failure: reachFailureOf(result) });
      return;
    }
    await deliver({ fileName: exportFileName(result.data.exportDate), jsonText: JSON.stringify(result.data.raw, null, 2) });
  }

  async function deliver(file: ExportFile) {
    const outcome = await deps.download(file.fileName, file.jsonText);
    setState(outcome === 'delivered' ? { phase: 'done' } : { phase: 'ready', file, undelivered: outcome === 'unavailable' });
  }

  if (state.phase === 'failed') {
    return <ReachFailurePage language={language} failure={state.failure} onRetry={() => setState({ phase: 'idle' })} />;
  }

  const exporting = state.phase === 'exporting';

  if (state.phase === 'ready') {
    return (
      <LinkPage
        glyph="archive"
        tone="brand"
        title={translate(language, 'dataExport.ready.title')}
        body={
          <>
            <LinkText>{translate(language, 'dataExport.ready.body')}</LinkText>
            {state.undelivered ? <LinkAlert>{translate(language, 'dataExport.undelivered.body')}</LinkAlert> : null}
          </>
        }
      >
        <ActionButton onClick={() => void deliver(state.file)}>{translate(language, 'dataExport.action.deliver')}</ActionButton>
        <ActionLink to="settings" tone="secondary">
          {translate(language, 'linkPage.settings')}
        </ActionLink>
      </LinkPage>
    );
  }

  if (state.phase === 'done') {
    return (
      <LinkPage
        glyph="check"
        tone="success"
        title={translate(language, 'dataExport.done.title')}
        body={<LinkText>{translate(language, 'dataExport.done.body')}</LinkText>}
      >
        <ActionButton disabled={!online} onClick={() => void runExport()}>
          {translate(language, 'dataExport.action.again')}
        </ActionButton>
        <ActionLink to="settings" tone="secondary">
          {translate(language, 'linkPage.settings')}
        </ActionLink>
      </LinkPage>
    );
  }

  return (
    <LinkPage
      glyph="archive"
      tone="brand"
      title={translate(language, 'dataExport.title')}
      busy={exporting}
      body={
        <>
          <LinkText>{translate(language, 'dataExport.info.body')}</LinkText>
          {online ? null : <LinkAlert>{translate(language, 'linkPage.offline.body')}</LinkAlert>}
        </>
      }
    >
      <ActionButton disabled={!online || exporting} onClick={() => void runExport()}>
        {translate(language, exporting ? 'dataExport.action.exporting' : 'dataExport.action.start')}
      </ActionButton>
      <ActionLink to="settings" tone="secondary">
        {translate(language, 'linkPage.settings')}
      </ActionLink>
    </LinkPage>
  );
}

export default function DataExportScreen() {
  const online = useOnline();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  return <DataExportPage signedIn={signedIn} online={online} language={currentInterfaceLanguage()} deps={GATEWAY_DEPS} />;
}
