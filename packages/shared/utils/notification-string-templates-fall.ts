/**
 * Les gabarits de la CHUTE DÉTECTÉE (#18748), langue par langue — à part pour que
 * `notification-string-templates.ts` tienne dans son budget de taille (#4532).
 *
 * L'écran verrouillé ne dit RIEN de la santé (donnée art. 9 RGPD) : « ⚠️ Alerte de sécurité »,
 * puis « <nom> · <heure> — ouvrez Meeshy ». Le détail ne se lit que dans l'app, après
 * déverrouillage, dans l'état servi.
 */

import type { NotificationLanguage, NotificationStringKey } from './notification-strings.js';

type FallKey = Extract<NotificationStringKey, `fall.${string}`>;

export const FALL_TEMPLATES: Record<NotificationLanguage, Record<FallKey, string>> = {
  fr: {
    'fall.alertTitle': '⚠️ Alerte de sécurité',
    'fall.alertBody': '{actor} · {value} — ouvrez Meeshy',
    'fall.respondedTitle': 'Alerte de sécurité levée',
    'fall.respondedBody': '{actor} a répondu',
  },
  en: {
    'fall.alertTitle': '⚠️ Safety alert',
    'fall.alertBody': '{actor} · {value} — open Meeshy',
    'fall.respondedTitle': 'Safety alert lifted',
    'fall.respondedBody': '{actor} responded',
  },
  es: {
    'fall.alertTitle': '⚠️ Alerta de seguridad',
    'fall.alertBody': '{actor} · {value} — abre Meeshy',
    'fall.respondedTitle': 'Alerta de seguridad levantada',
    'fall.respondedBody': '{actor} ha respondido',
  },
  pt: {
    'fall.alertTitle': '⚠️ Alerta de segurança',
    'fall.alertBody': '{actor} · {value} — abra o Meeshy',
    'fall.respondedTitle': 'Alerta de segurança encerrado',
    'fall.respondedBody': '{actor} respondeu',
  },
  de: {
    'fall.alertTitle': '⚠️ Sicherheitswarnung',
    'fall.alertBody': '{actor} · {value} — öffne Meeshy',
    'fall.respondedTitle': 'Sicherheitswarnung aufgehoben',
    'fall.respondedBody': '{actor} hat geantwortet',
  },
  it: {
    'fall.alertTitle': '⚠️ Avviso di sicurezza',
    'fall.alertBody': '{actor} · {value} — apri Meeshy',
    'fall.respondedTitle': 'Avviso di sicurezza revocato',
    'fall.respondedBody': '{actor} ha risposto',
  },
  ar: {
    'fall.alertTitle': '⚠️ تنبيه أمان',
    'fall.alertBody': '{actor} · {value} — افتح Meeshy',
    'fall.respondedTitle': 'رُفع تنبيه الأمان',
    'fall.respondedBody': 'ردّ {actor}',
  },
  'zh-Hans': {
    'fall.alertTitle': '⚠️ 安全提醒',
    'fall.alertBody': '{actor} · {value} — 打开 Meeshy',
    'fall.respondedTitle': '安全提醒已解除',
    'fall.respondedBody': '{actor} 已回应',
  },
};
