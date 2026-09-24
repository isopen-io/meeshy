import type { ApiFailure } from '@/lib/api/http';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LA CAUSE D'UN ENVOI QUI N'EST PAS PARTI (#5813, revue-correction) — le
 * SITE UNIQUE qui traduit un `ApiFailure` en une phrase que L'UTILISATEUR
 * peut lire.
 *
 * POURQUOI CE FICHIER EXISTE. `lastError` était STOCKÉ sur l'entrée d'outbox
 * et lu par PERSONNE : ni la bande de reprise, ni l'annonce, ni un journal.
 * C'est le défaut du cycle 122 du `CLAUDE.md` racine — « un correctif dont la
 * valeur n'atteint aucun lecteur n'a corrigé personne » : la question à poser
 * n'est pas « la cause est-elle capturée ? » mais « QUI l'affiche ? ».
 *
 * ON NE SERT JAMAIS `failure.error` TEL QUEL : c'est la prose de la
 * passerelle, écrite pour un développeur et pas toujours en français
 * (« You are not a participant of this conversation », mesuré sur
 * `gate.staging.meeshy.me` le 2026-09-09). Le STATUT, lui, est un contrat.
 *
 * LA PHRASE SE DIT DANS LA LANGUE D'INTERFACE (#7740) — elle s'embarque dans
 * `message.send.failed.reason` et `announce.messageNotSent.reason`, déjà au
 * catalogue : la servir en français laissait une annonce anglaise finir en
 * français.
 *
 * `undefined` ⇒ AUCUNE cause à dire : c'est l'échec HORS LIGNE, que le
 * bandeau de coupure explique déjà en haut de l'écran (D-16) — le redire sur
 * chaque bulle serait du bruit.
 */
export function sendFailureReason(
  failure: ApiFailure | undefined,
  language: InterfaceLanguage,
): string | undefined {
  if (failure === undefined) return undefined;
  if (failure.status === 0)
    return translate(language, failure.code === 'TIMEOUT' ? 'send.failure.timeout' : 'send.failure.offline');
  /**
   * UN LOT DE PIÈCES INCOMPLET (#5668, § 0 « UPLOAD_PARTIAL ») — synthétisé
   * par `send/perform-send.ts` quand `POST /attachments/upload` rend MOINS
   * d'attachements que de fichiers envoyés (`UploadProcessor.ts:744-751`,
   * qui avale les échecs PAR FICHIER sous `success: true`, statut 200 ici).
   * Distinct de tout statut HTTP réel : c'est ce module-ci, et lui seul, qui
   * doit reconnaître ce code AVANT de tomber dans les branches par statut.
   */
  if (failure.code === 'UPLOAD_PARTIAL') return translate(language, 'send.failure.uploadPartial');
  /**
   * PAS DE BRANCHE `ATTACHMENT_RIGHT_NOT_PERMITTED` ICI, ET C'EST MESURÉ
   * (revue-correction #5668) — la passerelle FABRIQUE bien ce code
   * (`MessagingService.ts:294-297`) et la route le LIT pour choisir son statut
   * (`messages-send.ts:363`), mais elle le rend par
   * `sendForbidden(reply, result.error)` SANS `options.code`
   * (`messages-send.ts:364`) : `sendError` pose alors `code: undefined`
   * (`utils/response.ts:89`), que JSON supprime. Aucun 403 servi à ce client
   * ne porte donc ce code — une branche écrite dessus serait morte, et son
   * témoin ne prouverait que sa propre cohérence (`tasks/lessons.md`, « un
   * témoin qui épingle un chemin d'API »). Le refus se dit ici par le 403
   * générique ci-dessous, et le composeur n'OFFRE pas la porte qu'il sait
   * refusée (`send/attachments.ts § acceptPendingFiles`). Une issue compagnon
   * de passerelle (servir le `code`) est proposée à la clôture.
   */
  /* #7740 — le mode lent des nouveaux comptes (Meeshy Global) : temporaire,
     et le délai est celui du serveur (`retryAfter`), jamais une constante. */
  if (failure.code === 'NEWCOMER_SLOW_MODE') {
    return failure.retryAfter === undefined
      ? translate(language, 'send.failure.newcomerSlowMode.soon')
      : translate(language, 'send.failure.newcomerSlowMode', { seconds: String(failure.retryAfter) });
  }
  if (failure.status === 401) return translate(language, 'send.failure.sessionExpired');
  if (failure.status === 403) return translate(language, 'send.failure.forbidden');
  if (failure.status === 429) return translate(language, 'send.failure.tooMany');
  if (failure.status >= 400 && failure.status < 500) return translate(language, 'send.failure.rejected');
  return translate(language, 'send.failure.gatewayUnavailable');
}
