import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { chooseCallDevice } from '@/lib/calls/call-device-choice';
import {
  browserPreferenceStorage,
  groupCallDevices,
  preferredDevice,
  readDevicePreferences,
  sinkSelectionSupported,
  type CallDevice,
  type CallDeviceGroups,
  type CallDeviceRole,
} from '@/lib/calls/call-devices';
import { loadCallEngine } from '@/lib/calls/call-actions';
import { acquireChosenInput } from '@/lib/calls/call-media';
import { callOutputStore } from '@/lib/calls/call-output';
import type { ShellAudioRoute } from '@/lib/calls/shell-call';
import type { ShellAudioRoutes } from '@/lib/calls/shell-call-runtime';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES PÉRIPHÉRIQUES D'UN APPEL** (#8046, D5 · D6) — la feuille ouverte
 * depuis l'écran d'appel : caméra, micro, sortie audio. Chaque ligne est un
 * bouton radio de 44 de haut ; la liste se relit à chaque `devicechange` (un
 * casque qu'on branche paraît sans rouvrir la feuille).
 *
 * La SORTIE a deux moteurs : `setSinkId` sur le web, les routes natives
 * (écouteur, haut-parleur, filaire, Bluetooth) dans la coque Android
 * (`shell-call-runtime.ts`, #8049) — la WebView n'a pas `setSinkId`, et le
 * routage d'un appel s'y fait par `AudioManager`, pas par l'élément.
 */

const EMPTY: CallDeviceGroups = { camera: [], microphone: [], speaker: [] };
const INK_2 = 'rgba(255,255,255,0.72)';

const ROUTE_KEY = {
  earpiece: 'call.audioRoute.earpiece',
  speaker: 'call.audioRoute.speaker',
  wired: 'call.audioRoute.wired',
  bluetooth: 'call.audioRoute.bluetooth',
} as const satisfies Readonly<Record<ShellAudioRoute, InterfaceCatalogKey>>;

type Language = ReturnType<typeof currentInterfaceLanguage>;

function unnamedLabels(language: Language): Readonly<Record<CallDeviceRole, string>> {
  return { camera: translate(language, 'call.devices.camera'), microphone: translate(language, 'call.devices.microphone'), speaker: translate(language, 'call.audioRoute.menu') };
}

function useCallDevices(language: Language): CallDeviceGroups {
  const [groups, setGroups] = useState<CallDeviceGroups>(EMPTY);
  useEffect(() => {
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (media?.enumerateDevices === undefined) return undefined;
    let alive = true;
    const refresh = () =>
      void media
        .enumerateDevices()
        .then((list) => {
          if (alive) setGroups(groupCallDevices(list, unnamedLabels(language)));
        })
        .catch(() => undefined);
    refresh();
    media.addEventListener?.('devicechange', refresh);
    return () => {
      alive = false;
      media.removeEventListener?.('devicechange', refresh);
    };
  }, [language]);
  return groups;
}

/** Les routes natives de la coque, `null` sur le web ou sur une coque qui ne les déclare pas. */
function useShellRoutes(): readonly [ShellAudioRoutes | null, (route: ShellAudioRoute) => void] {
  const [routes, setRoutes] = useState<ShellAudioRoutes | null>(null);
  useEffect(() => {
    if (!__SHELL__) return undefined;
    let alive = true;
    void import('@/lib/calls/shell-call-runtime')
      .then(({ shellAudioRoutes }) => shellAudioRoutes())
      .then((next) => {
        if (alive) setRoutes(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const choose = (route: ShellAudioRoute) =>
    void import('@/lib/calls/shell-call-runtime')
      .then(({ setShellAudioRoute }) => setShellAudioRoute(route))
      .then((next) => setRoutes(next))
      .catch(() => undefined);
  return [routes, choose];
}

function Choice({ label, checked, onPick, id }: { readonly label: string; readonly checked: boolean; readonly onPick: () => void; readonly id: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onPick}
      className="flex min-h-11 w-full items-center gap-3 rounded-card px-3 text-left text-body"
      style={{ background: checked ? 'rgba(255,255,255,0.16)' : 'transparent', color: '#fff' }}
      data-call-device-option={id}
    >
      <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: checked ? '#fff' : INK_2 }}>
        {checked ? <span className="size-2.5 rounded-full" style={{ background: '#fff' }} /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function DeviceGroup({
  role,
  title,
  devices,
  selected,
  onPick,
  language,
}: {
  readonly role: CallDeviceRole;
  readonly title: string;
  readonly devices: readonly CallDevice[];
  readonly selected: string | null;
  readonly onPick: (deviceId: string | null) => void;
  readonly language: Language;
}) {
  const headingId = `call-devices-${role}`;
  return (
    <section className="flex flex-col gap-1" data-call-devices-group={role}>
      <h3 id={headingId} className="px-1 text-mini font-semibold uppercase" style={{ color: INK_2 }}>
        {title}
      </h3>
      <div role="radiogroup" aria-labelledby={headingId} className="flex flex-col gap-0.5">
        <Choice id={`${role}:default`} label={translate(language, 'call.devices.default')} checked={selected === null} onPick={() => onPick(null)} />
        {devices.map((device) => (
          <Choice key={device.deviceId} id={`${role}:${device.deviceId}`} label={device.label} checked={selected === device.deviceId} onPick={() => onPick(device.deviceId)} />
        ))}
      </div>
    </section>
  );
}

export function CallDevicesSheet({ onClose }: { readonly onClose: () => void }) {
  const language = currentInterfaceLanguage();
  const groups = useCallDevices(language);
  const [shellRoutes, chooseRoute] = useShellRoutes();
  const [preferences, setPreferences] = useState(() => readDevicePreferences(browserPreferenceStorage()));
  const [failed, setFailed] = useState(false);
  const sinkId = useStore(callOutputStore, (state) => state.sinkId);
  const panel = useRef<HTMLDivElement | null>(null);
  const sinks = typeof HTMLMediaElement !== 'undefined' && sinkSelectionSupported(HTMLMediaElement);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('[aria-checked="true"], button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      opener?.focus?.();
    };
  }, [onClose]);

  const pick = (role: CallDeviceRole) => (deviceId: string | null) =>
    void loadCallEngine()
      .then((engine) =>
        chooseCallDevice(
          {
            storage: browserPreferenceStorage(),
            output: callOutputStore,
            acquireMicrophone: (id) => acquireChosenInput({ kind: 'microphone', deviceId: id }),
            acquireCamera: (id) => acquireChosenInput({ kind: 'camera', deviceId: id }),
            replaceInput: engine.replaceInput,
          },
          role,
          deviceId,
        ),
      )
      .then((ok) => {
        setFailed(!ok);
        setPreferences(readDevicePreferences(browserPreferenceStorage()));
      });

  const nothing = groups.camera.length === 0 && groups.microphone.length === 0 && groups.speaker.length === 0 && shellRoutes === null;

  return (
    <div className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center" data-call-devices="">
      <button type="button" aria-label={translate(language, 'call.close')} tabIndex={-1} onClick={onClose} className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-devices-title"
        className="relative flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-card p-4 pb-safe sm:rounded-card"
        style={{ background: '#1c1a24', color: '#fff' }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="call-devices-title" className="text-body font-semibold">
            {translate(language, 'call.devices.title')}
          </h2>
          <button type="button" onClick={onClose} className="min-h-11 rounded-full px-3 text-body font-semibold" data-call-devices-close="">
            {translate(language, 'call.close')}
          </button>
        </div>
        {failed ? (
          <p role="alert" className="rounded-card px-3 py-2 text-body" style={{ background: 'rgba(239,68,68,0.2)' }}>
            {translate(language, 'call.devices.failed')}
          </p>
        ) : null}
        {nothing ? (
          <p className="text-body" style={{ color: INK_2 }}>
            {translate(language, 'call.devices.none')}
          </p>
        ) : null}
        {groups.camera.length > 0 ? (
          <DeviceGroup role="camera" title={translate(language, 'call.devices.camera')} devices={groups.camera} selected={preferredDevice(groups.camera, preferences.camera)} onPick={pick('camera')} language={language} />
        ) : null}
        {groups.microphone.length > 0 ? (
          <DeviceGroup role="microphone" title={translate(language, 'call.devices.microphone')} devices={groups.microphone} selected={preferredDevice(groups.microphone, preferences.microphone)} onPick={pick('microphone')} language={language} />
        ) : null}
        {shellRoutes !== null && shellRoutes.routes.length > 0 ? (
          <section className="flex flex-col gap-1" data-call-devices-group="route">
            <h3 id="call-devices-route" className="px-1 text-mini font-semibold uppercase" style={{ color: INK_2 }}>
              {translate(language, 'call.audioRoute.menu')}
            </h3>
            <div role="radiogroup" aria-labelledby="call-devices-route" className="flex flex-col gap-0.5">
              {shellRoutes.routes.map((route) => (
                <Choice key={route} id={`route:${route}`} label={translate(language, ROUTE_KEY[route])} checked={shellRoutes.route === route} onPick={() => chooseRoute(route)} />
              ))}
            </div>
          </section>
        ) : null}
        {shellRoutes === null && sinks && groups.speaker.length > 0 ? (
          <DeviceGroup role="speaker" title={translate(language, 'call.audioRoute.menu')} devices={groups.speaker} selected={preferredDevice(groups.speaker, sinkId)} onPick={pick('speaker')} language={language} />
        ) : null}
      </div>
    </div>
  );
}
