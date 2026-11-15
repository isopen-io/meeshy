/**
 * Les gabarits de la BATTERIE (#14147), langue par langue — extraits de
 * `notification-string-templates.ts` pour qu'il tienne dans son budget de taille (#4532).
 */

import type { NotificationLanguage, NotificationStringKey } from './notification-strings.js';

type BatteryKey = Extract<NotificationStringKey, `battery.${string}`>;

export const BATTERY_TEMPLATES: Record<NotificationLanguage, Record<BatteryKey, string>> = {
  fr: {
    'battery.criticalAction': 'n’a presque plus de batterie',
    'battery.probablyOffAction': 'a sans doute un téléphone éteint',
    'battery.backOnAction': 'a rallumé son téléphone',
    'battery.chargingAction': 'recharge son téléphone',
    'battery.rechargedAction': 'a rechargé son téléphone',
    'battery.levelBody': 'Batterie à {count} %',
    'battery.offBody': 'Dernier niveau connu : {count} %',
  },
  en: {
    'battery.criticalAction': 'is almost out of battery',
    'battery.probablyOffAction': 'probably has a dead phone',
    'battery.backOnAction': 'turned their phone back on',
    'battery.chargingAction': 'is charging their phone',
    'battery.rechargedAction': 'has recharged their phone',
    'battery.levelBody': 'Battery at {count}%',
    'battery.offBody': 'Last known level: {count}%',
  },
  es: {
    'battery.criticalAction': 'casi no tiene batería',
    'battery.probablyOffAction': 'seguramente tiene el teléfono apagado',
    'battery.backOnAction': 'ha vuelto a encender su teléfono',
    'battery.chargingAction': 'está cargando su teléfono',
    'battery.rechargedAction': 'ha recargado su teléfono',
    'battery.levelBody': 'Batería al {count} %',
    'battery.offBody': 'Último nivel conocido: {count} %',
  },
  pt: {
    'battery.criticalAction': 'está quase sem bateria',
    'battery.probablyOffAction': 'provavelmente está com o telefone desligado',
    'battery.backOnAction': 'ligou o telefone de novo',
    'battery.chargingAction': 'está carregando o telefone',
    'battery.rechargedAction': 'recarregou o telefone',
    'battery.levelBody': 'Bateria em {count}%',
    'battery.offBody': 'Último nível conhecido: {count}%',
  },
  de: {
    'battery.criticalAction': 'hat fast keinen Akku mehr',
    'battery.probablyOffAction': 'hat wohl ein ausgeschaltetes Handy',
    'battery.backOnAction': 'hat das Handy wieder eingeschaltet',
    'battery.chargingAction': 'lädt das Handy',
    'battery.rechargedAction': 'hat das Handy aufgeladen',
    'battery.levelBody': 'Akku bei {count} %',
    'battery.offBody': 'Zuletzt bekannter Stand: {count} %',
  },
  it: {
    'battery.criticalAction': 'ha quasi finito la batteria',
    'battery.probablyOffAction': 'ha probabilmente il telefono spento',
    'battery.backOnAction': 'ha riacceso il telefono',
    'battery.chargingAction': 'sta ricaricando il telefono',
    'battery.rechargedAction': 'ha ricaricato il telefono',
    'battery.levelBody': 'Batteria al {count}%',
    'battery.offBody': 'Ultimo livello noto: {count}%',
  },
  ar: {
    'battery.criticalAction': 'على وشك نفاد البطارية',
    'battery.probablyOffAction': 'هاتفه مطفأ على الأرجح',
    'battery.backOnAction': 'أعاد تشغيل هاتفه',
    'battery.chargingAction': 'يشحن هاتفه',
    'battery.rechargedAction': 'أعاد شحن هاتفه',
    'battery.levelBody': 'البطارية عند {count}٪',
    'battery.offBody': 'آخر مستوى معروف: {count}٪',
  },
  'zh-Hans': {
    'battery.criticalAction': '的手机快没电了',
    'battery.probablyOffAction': '的手机可能已关机',
    'battery.backOnAction': '已重新开机',
    'battery.chargingAction': '正在给手机充电',
    'battery.rechargedAction': '已给手机充好电',
    'battery.levelBody': '电量 {count}%',
    'battery.offBody': '最后已知电量：{count}%',
  },
};
