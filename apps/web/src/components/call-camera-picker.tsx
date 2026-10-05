import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { CallRowsKit } from '@/components/call-control-actions';
import { callActions } from '@/lib/calls/call-actions';
import type { ActiveCall } from '@/lib/calls/call-store';
import { translateCallControls } from '@/lib/i18n-call-controls-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CHOISIR SA CAMÉRA** (#9094) — le `.cameraPicker` d'iOS
 * (`CallView+Pill.swift`) : sur un ordinateur à plusieurs webcams, qui n'ont
 * ni avant ni arrière, « Retourner » rouvrirait la même caméra. Le bouton
 * ouvre la liste des caméras, celle qui tourne cochée ; en toucher une
 * l'ouvre par son identifiant (`selectCamera`, la piste envoyée est
 * remplacée sans renégociation). La liste est relue à chaque ouverture : une
 * caméra branchée en cours d'appel y apparaît.
 *
 * La liste se pose hors des rangées (portail) : une rangée qui défile la
 * rognerait.
 */

type CameraOption = { readonly deviceId: string; readonly label: string };

const browserCameras = async (): Promise<readonly CameraOption[]> => {
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (media?.enumerateDevices === undefined) return [];
  const devices = await media.enumerateDevices().catch(() => []);
  return devices.filter((device) => device.kind === 'videoinput').map((device) => ({ deviceId: device.deviceId, label: device.label }));
};

/** La caméra qui tourne : la source de la piste envoyée (les effets en font une autre piste). */
const runningCamera = (stream: MediaStream | null, cameraSourceOf: CallRowsKit['cameraSourceOf']): string | null => {
  const sent = stream?.getVideoTracks()[0];
  if (sent === undefined) return null;
  const source = cameraSourceOf(sent);
  return typeof source.getSettings === 'function' ? (source.getSettings().deviceId ?? null) : null;
};

export const CAMERA_PICKER_ID = 'call-camera-picker';

type PickerProps = {
  readonly call: ActiveCall;
  readonly language: InterfaceLanguage;
  readonly kit: CallRowsKit;
  readonly glyph: ReactNode;
  readonly captioned: boolean;
  readonly data: Readonly<Record<`data-${string}`, string>>;
};

export function CallCameraPicker({ call, language, kit, glyph, captioned, data }: PickerProps) {
  const [cameras, setCameras] = useState<readonly CameraOption[] | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = cameras !== null;
  const label = translateCallControls(language, 'callControls.cameraPicker.label');

  const close = (): void => {
    setCameras(null);
    opener.current?.focus?.();
  };

  useEffect(() => {
    if (!open) return undefined;
    document.querySelector<HTMLElement>(`#${CAMERA_PICKER_ID} [aria-checked="true"], #${CAMERA_PICKER_ID} [role="menuitemradio"]`)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const toggle = (): void => {
    if (open) return close();
    opener.current = document.activeElement as HTMLElement | null;
    void browserCameras().then(setCameras);
  };

  const pick = (deviceId: string): void => {
    callActions.selectCamera(deviceId);
    close();
  };

  const running = runningCamera(call.localStream, kit.cameraSourceOf);

  return (
    <>
      <kit.Button label={label} glyph={glyph} onPress={toggle} tone={open ? 'active' : 'bare'} expanded={open} controls={CAMERA_PICKER_ID} popup {...(captioned ? { caption: translateCallControls(language, 'callControls.cameraPicker') } : { size: 44 })} data={data} />
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[230] flex items-end justify-center p-4 pb-safe" data-call-camera-picker="">
              <button type="button" aria-label={translateCallControls(language, 'callControls.back')} tabIndex={-1} onClick={close} className="absolute inset-0" />
              <div id={CAMERA_PICKER_ID} role="dialog" aria-label={label} className="glass-call-prominent relative mb-24 flex w-full max-w-xs flex-col rounded-card p-1 text-on-media">
                <div role="menu" aria-label={label} className="flex flex-col">
                  {cameras.map((camera, index) => (
                    <button
                      key={camera.deviceId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={camera.deviceId === running}
                      onClick={() => pick(camera.deviceId)}
                      className="flex min-h-11 items-center gap-2 rounded-2xl px-3 text-left text-body"
                      data-call-camera-option={camera.deviceId}
                    >
                      <span aria-hidden className={`size-2 shrink-0 rounded-full ${camera.deviceId === running ? 'bg-current' : ''}`} />
                      <span className="min-w-0 truncate">{camera.label === '' ? translateCallControls(language, 'callControls.cameraPicker.unnamed', { n: String(index + 1) }) : camera.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
