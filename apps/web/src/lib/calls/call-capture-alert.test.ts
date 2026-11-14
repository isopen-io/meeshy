import { CALL_SCREENSHOT_ALERT_TTL_MS } from '@meeshy/shared/types/call-capture';
import { describe, expect, test } from 'bun:test';

import { captureAlertOf } from './call-capture-alert';
import type { CallJournalNote } from './call-journal-notes';
import { SCREENSHOT_ALERT_TTL_MS } from './call-peer-alerts';
import type { CallMember } from './call-store';

/**
 * R1.2 (#17963) — UNE seule puce de capture, comme iOS (`CallCaptureLedger.alert` : `flash ?? recorders.last`) et
 * Android (`CallCaptureViews.kt`) : la capture la plus récente dit qui capture ; deux personnes qui capturent ne
 * posent jamais deux puces. Celui qui capture ne voit pas la sienne : je ne suis pas un membre de mon appel.
 */

const member = (userId: string, capturing: boolean): CallMember => ({ userId, name: userId.replace('u-', ''), avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing, link: 'connected' });

const note = (userId: string, at: number, kind: CallJournalNote['kind'] = 'screenshot'): CallJournalNote => ({ id: `capture:${userId}:${at}`, kind, userId, name: null, at });

describe('la puce de capture (R1.2)', () => {
  test('personne ne capture : aucune puce', () => {
    expect(captureAlertOf({ 'u-awa': member('u-awa', false) }, [])).toBeNull();
  });

  test('une personne capture : sa puce', () => {
    expect(captureAlertOf({ 'u-awa': member('u-awa', true) }, [note('u-awa', 10)])?.userId).toBe('u-awa');
  });

  test('deux personnes capturent : UNE puce, celle de la capture la plus récente', () => {
    const members = { 'u-awa': member('u-awa', true), 'u-karim': member('u-karim', true) };
    expect(captureAlertOf(members, [note('u-karim', 10), note('u-awa', 20)])?.userId).toBe('u-awa');
    expect(captureAlertOf(members, [note('u-awa', 10), note('u-karim', 20)])?.userId).toBe('u-karim');
  });

  test('la capture la plus récente d’une personne qui ne capture plus ne la rallume pas', () => {
    const members = { 'u-awa': member('u-awa', false), 'u-karim': member('u-karim', true) };
    expect(captureAlertOf(members, [note('u-karim', 10), note('u-awa', 20)])?.userId).toBe('u-karim');
  });

  test('un moment de l’enregistrement consenti ne dit pas qui capture l’écran', () => {
    const members = { 'u-awa': member('u-awa', true), 'u-karim': member('u-karim', true) };
    expect(captureAlertOf(members, [note('u-awa', 10), note('u-karim', 20, 'call-recording-started')])?.userId).toBe('u-awa');
  });

  test('sans note au journal, la dernière personne arrivée qui capture', () => {
    const members = { 'u-awa': member('u-awa', true), 'u-karim': member('u-karim', true) };
    expect(captureAlertOf(members, [])?.userId).toBe('u-karim');
  });

  test('la puce d’une capture ponctuelle dure 5 s, la valeur du kit partagé (R1.4)', () => {
    expect(SCREENSHOT_ALERT_TTL_MS).toBe(CALL_SCREENSHOT_ALERT_TTL_MS);
  });
});
