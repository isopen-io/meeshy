/**
 * Les gabarits de la VÉRIFICATION D'INACTIVITÉ (#18738), langue par langue — à part pour que
 * `notification-string-templates.ts` tienne dans son budget de taille (#4532).
 *
 * La question (`wellness_check`) s'adresse à soi : « Tout va bien ? ». L'alerte (`inactivity_alert`)
 * est « <nom> <action> » ; son corps dit depuis combien d'heures le téléphone est inactif, et la
 * dernière batterie seulement quand elle est déjà partagée. La position n'est jamais dans le texte.
 */

import type { NotificationLanguage, NotificationStringKey } from './notification-strings.js';

type InactivityKey = Extract<NotificationStringKey, `inactivity.${string}`>;

export const INACTIVITY_TEMPLATES: Record<NotificationLanguage, Record<InactivityKey, string>> = {
  fr: {
    'inactivity.wellnessTitle': 'Tout va bien ?',
    'inactivity.wellnessBody': 'Aucune activité depuis {count} h. Touchez pour rassurer vos Sangs.',
    'inactivity.alertAction': 'n’a pas répondu à « Tout va bien ? »',
    'inactivity.alertBody': 'Aucune activité depuis {count} h',
    'inactivity.alertBatteryBody': 'Aucune activité depuis {count} h — dernière batterie {value} %',
    'inactivity.respondedAction': 'va bien',
    'inactivity.respondedBody': 'Son téléphone est de nouveau actif',
  },
  en: {
    'inactivity.wellnessTitle': 'Are you OK?',
    'inactivity.wellnessBody': 'No activity for {count} h. Tap to reassure your Blood.',
    'inactivity.alertAction': 'didn’t answer “Are you OK?”',
    'inactivity.alertBody': 'No activity for {count} h',
    'inactivity.alertBatteryBody': 'No activity for {count} h — last battery {value}%',
    'inactivity.respondedAction': 'is OK',
    'inactivity.respondedBody': 'Their phone is active again',
  },
  es: {
    'inactivity.wellnessTitle': '¿Todo bien?',
    'inactivity.wellnessBody': 'Sin actividad desde hace {count} h. Toca para tranquilizar a tu Sangre.',
    'inactivity.alertAction': 'no respondió a «¿Todo bien?»',
    'inactivity.alertBody': 'Sin actividad desde hace {count} h',
    'inactivity.alertBatteryBody': 'Sin actividad desde hace {count} h — última batería {value} %',
    'inactivity.respondedAction': 'está bien',
    'inactivity.respondedBody': 'Su teléfono vuelve a estar activo',
  },
  pt: {
    'inactivity.wellnessTitle': 'Está tudo bem?',
    'inactivity.wellnessBody': 'Sem atividade há {count} h. Toque para tranquilizar o seu Sangue.',
    'inactivity.alertAction': 'não respondeu a «Está tudo bem?»',
    'inactivity.alertBody': 'Sem atividade há {count} h',
    'inactivity.alertBatteryBody': 'Sem atividade há {count} h — última bateria {value} %',
    'inactivity.respondedAction': 'está bem',
    'inactivity.respondedBody': 'O telefone voltou a estar ativo',
  },
  de: {
    'inactivity.wellnessTitle': 'Alles in Ordnung?',
    'inactivity.wellnessBody': 'Seit {count} Std. keine Aktivität. Tippe, um dein Blut zu beruhigen.',
    'inactivity.alertAction': 'hat auf „Alles in Ordnung?“ nicht geantwortet',
    'inactivity.alertBody': 'Seit {count} Std. keine Aktivität',
    'inactivity.alertBatteryBody': 'Seit {count} Std. keine Aktivität – letzter Akkustand {value} %',
    'inactivity.respondedAction': 'geht es gut',
    'inactivity.respondedBody': 'Das Handy ist wieder aktiv',
  },
  it: {
    'inactivity.wellnessTitle': 'Tutto bene?',
    'inactivity.wellnessBody': 'Nessuna attività da {count} h. Tocca per rassicurare il tuo Sangue.',
    'inactivity.alertAction': 'non ha risposto a «Tutto bene?»',
    'inactivity.alertBody': 'Nessuna attività da {count} h',
    'inactivity.alertBatteryBody': 'Nessuna attività da {count} h — ultima batteria {value}%',
    'inactivity.respondedAction': 'sta bene',
    'inactivity.respondedBody': 'Il telefono è di nuovo attivo',
  },
  ar: {
    'inactivity.wellnessTitle': 'هل كل شيء بخير؟',
    'inactivity.wellnessBody': 'لا نشاط منذ {count} ساعة. اضغط لطمأنة عائلتك.',
    'inactivity.alertAction': 'لم يردّ على «هل كل شيء بخير؟»',
    'inactivity.alertBody': 'لا نشاط منذ {count} ساعة',
    'inactivity.alertBatteryBody': 'لا نشاط منذ {count} ساعة — آخر بطارية {value}٪',
    'inactivity.respondedAction': 'بخير',
    'inactivity.respondedBody': 'هاتفه نشط من جديد',
  },
  'zh-Hans': {
    'inactivity.wellnessTitle': '一切都好吗？',
    'inactivity.wellnessBody': '已 {count} 小时没有活动。轻点让你的血亲放心。',
    'inactivity.alertAction': '没有回应“一切都好吗？”',
    'inactivity.alertBody': '已 {count} 小时没有活动',
    'inactivity.alertBatteryBody': '已 {count} 小时没有活动 — 最后电量 {value}%',
    'inactivity.respondedAction': '一切都好',
    'inactivity.respondedBody': '手机已恢复活动',
  },
};
