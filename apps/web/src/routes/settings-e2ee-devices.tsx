import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { SETTINGS_GLYPHS } from '@/components/glyphs-settings';
import { GroupedSection, SECTION_BRAND_INK, SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { securityFailureOf, type SecurityFailure } from '@/lib/api/account-security';
import { ApiError, unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import {
  E2EE_DEVICE_CHANGED,
  E2EE_DEVICES_QUERY_KEY,
  loadE2eeDevices,
  orderedE2eeDevices,
  retireE2eeDevice,
  type E2eeDevice,
  type E2eeDeviceDeps,
  type E2eeDeviceGeneration,
} from '@/lib/api/e2ee-devices';
import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadSessionsCatalog, sessionsTextOf, type SessionsText } from '@/lib/i18n-sessions-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { e2eeDeviceFields, e2eeDeviceTitle } from '@/lib/view/e2ee-devices';
import { Link } from '@/routes/route-table';
import { SECURITY_PANEL, SECURITY_PANEL_PARAM } from '@/routes/settings-sections';

/**
 * **RÉGLAGES › SÉCURITÉ › MES APPAREILS CHIFFRÉS** (#13013) — jumelle web et
 * coque Android de l'écran iOS (#13009), monté par `settings.tsx`
 * (`?volet=appareils-chiffres`) et chargé à la demande avec le catalogue des
 * sessions, dont il partage le vocabulaire.
 *
 * - **Ce que le web PEUT dire** : la liste de mes appareils chiffrés, servie
 *   par `GET /e2ee/devices`, et le retrait d'un appareil perdu ou volé — la
 *   passerelle révoque son identité ET ferme sa session.
 * - **Ce qu'il ne fait pas, et le dit** : le navigateur n'a aucune pile
 *   libsignal (#12975) ; il ne lit pas le chiffré de bout en bout (#12983) et
 *   n'approuve aucun appareil. La coque Android n'a pas de pont natif de
 *   chiffrement : même état, nommé « cette application ».
 * - **L'approbation n'est pas montrée** : elle vit sur chaque appareil, le
 *   serveur ne la connaît pas. Un « en attente » ici serait inventé.
 * - **Cache d'abord, optimiste, hors ligne** : le motif de l'écran des
 *   sessions (`settings-security.tsx`) — mais le RETRAIT n'est proposé que sur
 *   une liste relue dans l'écran ouvert, et il nomme la génération lue : une
 *   place reprise depuis rend 409, et la liste se recharge en le disant.
 */

export type E2eeDevicesScreenDeps = {
  readonly load: (signal: AbortSignal) => Promise<ApiResult<readonly E2eeDevice[]>>;
  readonly retire: (device: E2eeDeviceGeneration) => Promise<ApiResult<unknown>>;
};

export type E2eeDevicesHost = 'browser' | 'android-shell';

const gatewayDeps = (deps: E2eeDeviceDeps): E2eeDevicesScreenDeps => ({
  load: (signal) => loadE2eeDevices({ ...deps, signal }),
  retire: (device) => retireE2eeDevice(deps, device),
});

/** La coque Capacitor se reconnaît à `Capacitor.getPlatform()` ; un navigateur n'en a pas. */
export function currentE2eeDevicesHost(host: object = globalThis): E2eeDevicesHost {
  const capacitor = (host as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return capacitor?.getPlatform?.() === 'android' ? 'android-shell' : 'browser';
}

export const prepareE2eeDevicesScreen = (language: InterfaceLanguage): Promise<unknown> => loadSessionsCatalog(language);

const BUTTON_STYLE = { minHeight: 44, outlineColor: 'var(--color-ios-brand)' } as const;

export function SettingsE2eeDevicesScreen({
  language,
  deps = gatewayDeps(apiDeps),
  queryClient = appQueryClient,
  host = currentE2eeDevicesHost(),
  now = () => new Date(),
}: {
  readonly language: InterfaceLanguage;
  readonly deps?: E2eeDevicesScreenDeps;
  readonly queryClient?: QueryClient;
  readonly host?: E2eeDevicesHost;
  readonly now?: () => Date;
}) {
  const t = sessionsTextOf(language);
  const online = useOnline();
  const [pending, setPending] = useState<E2eeDevice | null>(null);
  const [announce, setAnnounce] = useState('');
  const query = useQuery(
    {
      queryKey: E2EE_DEVICES_QUERY_KEY,
      queryFn: async ({ signal }) => unwrap(await deps.load(signal)),
      retry: false,
    },
    queryClient,
  );

  useEffect(() => {
    if (announce === '') return undefined;
    const handle = setTimeout(() => setAnnounce(''), 4000);
    return () => clearTimeout(handle);
  }, [announce]);

  const retire = async (target: E2eeDevice) => {
    setPending(null);
    if (target.registrationId === null) return;
    const snapshot = queryClient.getQueryData<readonly E2eeDevice[]>(E2EE_DEVICES_QUERY_KEY);
    queryClient.setQueryData<readonly E2eeDevice[] | undefined>(E2EE_DEVICES_QUERY_KEY, (before) =>
      before?.filter((device) => device.deviceId !== target.deviceId),
    );
    const result = await deps.retire({ deviceId: target.deviceId, registrationId: target.registrationId });
    if (!result.ok && result.code === E2EE_DEVICE_CHANGED) {
      queryClient.setQueryData(E2EE_DEVICES_QUERY_KEY, snapshot);
      setAnnounce(t('e2eeDevices.retire.changed'));
      await queryClient.refetchQueries({ queryKey: E2EE_DEVICES_QUERY_KEY });
      return;
    }
    if (!result.ok && securityFailureOf(result) !== 'not-found') {
      queryClient.setQueryData(E2EE_DEVICES_QUERY_KEY, snapshot);
      setAnnounce(t('e2eeDevices.retire.error'));
      return;
    }
    setAnnounce(t('e2eeDevices.retire.done'));
    void queryClient.invalidateQueries({ queryKey: E2EE_DEVICES_QUERY_KEY });
  };

  const devices = query.data === undefined ? undefined : orderedE2eeDevices(query.data);
  /* Un retrait ne part que d'une liste RELUE dans cet écran : celle du cache peut
     nommer une place reprise depuis (la passerelle le refuserait, mais l'écran
     ne propose pas un geste qu'il sait douteux). */
  const confirmed = query.isFetchedAfterMount && query.isSuccess && !query.isFetching;
  const failure: SecurityFailure | null = query.error instanceof ApiError ? securityFailureOf(query.error) : query.error === null ? null : 'unavailable';

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe" data-settings-e2ee-devices>
      <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: 64 }}>
        <Link
          to="settings"
          search={{ [SECURITY_PANEL_PARAM]: SECURITY_PANEL }}
          aria-label={t('sessions.back')}
          className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <ChromeActionDisc>
            <Glyph name="caretLeft" size={16} className="rtl:-scale-x-100" />
          </ChromeActionDisc>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: SECTION_INK }}>
          {t('e2eeDevices.title')}
        </h1>
      </header>
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto grid max-w-xl gap-6 pb-24" style={{ paddingTop: 8 }}>
          {online ? null : (
            <p role="status" data-e2ee-devices-offline className="rounded-card px-3.5 py-3 text-caption" style={{ ...SECTION_CARD_STYLE, color: SECTION_INK }}>
              {t('e2eeDevices.offline')}
            </p>
          )}
          <p
            data-e2ee-devices-here
            className="flex items-start gap-2 rounded-card px-3.5 py-3 text-caption"
            style={{ ...SECTION_CARD_STYLE, color: SECTION_INK }}
          >
            {t(host === 'android-shell' ? 'e2eeDevices.here.shell' : 'e2eeDevices.here.browser')}
          </p>
          <GroupedSection
            id="e2ee-devices-title"
            title={t('e2eeDevices.section').toLocaleUpperCase(language)}
            icon={<GlyphSvg glyph={SETTINGS_GLYPHS.shieldCheck} size={12} />}
            card={false}
          >
            <p className="ps-1 text-caption" style={{ color: SECTION_INK_2 }}>
              {t('e2eeDevices.intro')}
            </p>
            {devices === undefined ? (
              failure === null ? (
                <DevicesSkeleton label={t('e2eeDevices.loading')} />
              ) : (
                <DevicesError t={t} failure={failure} onRetry={() => void query.refetch()} />
              )
            ) : devices.length === 0 ? (
              <div data-e2ee-devices-empty className="grid gap-1 rounded-card p-4 text-center" style={SECTION_CARD_STYLE}>
                <span className="text-body font-semibold" style={{ color: SECTION_INK }}>
                  {t('e2eeDevices.empty.title')}
                </span>
                <span className="text-caption" style={{ color: SECTION_INK_2 }}>
                  {t('e2eeDevices.empty.body')}
                </span>
              </div>
            ) : (
              <ul className="grid gap-2" aria-labelledby="e2ee-devices-title">
                {devices.map((device) => (
                  <DeviceCard
                    key={device.deviceId}
                    device={device}
                    language={language}
                    t={t}
                    now={now()}
                    disabled={!online || !confirmed}
                    onRetire={() => setPending(device)}
                  />
                ))}
              </ul>
            )}
            <p className="ps-1 text-caption" style={{ color: SECTION_INK_2 }}>
              {t('e2eeDevices.approval')}
            </p>
          </GroupedSection>
        </div>
      </main>
      {pending === null ? null : (
        <ConfirmDialog
          name="retire-e2ee-device"
          title={t('e2eeDevices.retire.title')}
          body={t('e2eeDevices.retire.body', { device: e2eeDeviceTitle(pending, t) })}
          cancelLabel={t('sessions.cancel')}
          confirmLabel={t('e2eeDevices.retire')}
          tone="destructive"
          onConfirm={() => void retire(pending)}
          onCancel={() => setPending(null)}
        />
      )}
      <p
        role="status"
        aria-live="polite"
        data-e2ee-devices-announce
        className="pointer-events-none fixed inset-x-4 bottom-6 mx-auto max-w-sm rounded-chip px-4 py-2.5 text-center text-caption font-semibold empty:hidden"
        style={{ color: 'var(--color-ios-surface)', backgroundColor: 'var(--color-ios-ink)' }}
      >
        {announce}
      </p>
    </div>
  );
}

function DeviceCard({
  device,
  language,
  t,
  now,
  disabled,
  onRetire,
}: {
  readonly device: E2eeDevice;
  readonly language: InterfaceLanguage;
  readonly t: SessionsText;
  readonly now: Date;
  readonly disabled: boolean;
  readonly onRetire: () => void;
}) {
  const title = e2eeDeviceTitle(device, t);
  const tint = device.current ? 'var(--color-success)' : 'var(--color-ios-brand)';
  return (
    <li
      data-e2ee-device={String(device.deviceId)}
      className="grid gap-2 rounded-card p-4"
      style={{ ...SECTION_CARD_STYLE, borderColor: `color-mix(in srgb, ${tint} 40%, transparent)` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 break-words text-body font-semibold" style={{ color: SECTION_INK }} dir="auto">
          {title}
        </span>
        {device.current ? (
          <span
            className="rounded-chip px-2 py-0.5 text-caption font-semibold"
            style={{ color: 'var(--color-success)', backgroundColor: 'color-mix(in srgb, var(--color-success) 14%, transparent)' }}
          >
            {t('sessions.current')}
          </span>
        ) : null}
      </div>
      <dl className="grid gap-1 text-caption" style={{ gridTemplateColumns: 'auto 1fr', columnGap: 12 }}>
        {e2eeDeviceFields(device, { language, now, t }).map((field) => (
          <div key={field.key} data-e2ee-device-field={field.key} style={{ display: 'contents' }}>
            <dt style={{ color: SECTION_INK_2 }}>{field.label}</dt>
            <dd className="min-w-0 break-words" style={{ color: SECTION_INK }} {...(field.ltr ? { dir: 'ltr' } : {})}>
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
      {device.current || device.registrationId === null ? null : (
        <button
          type="button"
          data-e2ee-device-retire={String(device.deviceId)}
          aria-label={t('e2eeDevices.retire.label', { device: title })}
          disabled={disabled}
          onClick={onRetire}
          className="inline-flex items-center gap-2 rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 disabled:opacity-40"
          style={{ ...BUTTON_STYLE, justifySelf: 'start', color: 'var(--color-error)', border: '1px solid var(--color-edge)' }}
        >
          {t('e2eeDevices.retire')}
        </button>
      )}
    </li>
  );
}

function DevicesSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-label={label} data-e2ee-devices-loading className="grid gap-2">
      {[0, 1].map((index) => (
        <div key={index} aria-hidden="true" className="grid gap-2 rounded-card p-4 motion-safe:animate-pulse" style={SECTION_CARD_STYLE}>
          <div className="rounded-chip" style={{ height: 16, width: '45%', backgroundColor: 'var(--color-edge)' }} />
          <div className="rounded-chip" style={{ height: 12, width: '70%', backgroundColor: 'var(--color-edge)' }} />
        </div>
      ))}
    </div>
  );
}

function DevicesError({ t, failure, onRetry }: { readonly t: SessionsText; readonly failure: SecurityFailure; readonly onRetry: () => void }) {
  return (
    <div role="alert" data-e2ee-devices-error={failure} className="grid gap-2 rounded-card p-4 text-center" style={SECTION_CARD_STYLE}>
      <span className="text-body" style={{ color: SECTION_INK }}>
        {t(failure === 'signed-out' ? 'e2eeDevices.signedOut' : failure === 'offline' ? 'e2eeDevices.offline' : 'e2eeDevices.error.title')}
      </span>
      {failure === 'signed-out' ? null : (
        <button
          type="button"
          onClick={onRetry}
          className={`rounded-chip px-4 text-body font-semibold focus-visible:outline-2 ${SECTION_BRAND_INK}`}
          style={{ ...BUTTON_STYLE, justifySelf: 'center' }}
        >
          {t('sessions.error.retry')}
        </button>
      )}
    </div>
  );
}
