import { coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * **LES APPELS SONT COUPÉS DANS LA COQUE ANDROID** (directive porteur du
 * 2026-10-14) — la première version publiée sur le Play Store part sans
 * appels audio ni vidéo : un appel entre deux téléphones Android n'a pas pu
 * être éprouvé. Le web et iOS gardent les leurs.
 *
 * Le drapeau est UN : le remettre à `true` rend à la coque toutes les portes
 * d'appel d'un coup (menu, fil, ligne, profil, cloche, avis d'appel, sonnerie
 * socket). Sa jumelle native, `CallPush.CALLS_ENABLED`
 * (`android/app/src/main/java/me/meeshy/app/CallPush.java`), tait la sonnerie
 * poussée app fermée : les deux se rallument ensemble, et avec eux le service
 * `CallForegroundService` et les permissions `FOREGROUND_SERVICE_CAMERA` et
 * `USE_FULL_SCREEN_INTENT` du manifeste (`scripts/check-android-manifest.mjs`
 * les réclame dès que le drapeau natif repasse à `true`).
 */
export const ANDROID_SHELL_CALLS_ENABLED = false;

export function callsAvailable(
  coque: CoqueNative | undefined = coqueCourante(),
  androidShellCalls: boolean = ANDROID_SHELL_CALLS_ENABLED,
): boolean {
  return androidShellCalls || coque?.getPlatform?.() !== 'android';
}
