/**
 * Les gabarits du TÉLÉPHONE INJOIGNABLE (#18737), langue par langue — à part pour que
 * `notification-string-templates.ts` tienne dans son budget de taille (#4532).
 *
 * Le titre est « <nom> <action> » ; le corps dit depuis combien de minutes le téléphone ne donne
 * plus signe de vie (le serveur ignore le fuseau du lecteur : l'heure exacte est rendue par l'app).
 */

import type { NotificationLanguage, NotificationStringKey } from './notification-strings.js';

type UnreachableKey = Extract<NotificationStringKey, `unreachable.${string}`>;

export const UNREACHABLE_TEMPLATES: Record<NotificationLanguage, Record<UnreachableKey, string>> = {
  fr: {
    'unreachable.action': 'a un téléphone injoignable',
    'unreachable.reachableAction': 'est de nouveau joignable',
    'unreachable.sinceBody': 'Aucun signe de vie depuis {count} min — sans réseau ou en mode avion, probablement',
    'unreachable.batteryBody': 'Aucun signe de vie depuis {count} min — batterie vide, probablement',
    'unreachable.reachableBody': 'Son téléphone répond de nouveau',
  },
  en: {
    'unreachable.action': 'can’t be reached on their phone',
    'unreachable.reachableAction': 'is reachable again',
    'unreachable.sinceBody': 'No sign of life for {count} min — probably no signal or airplane mode',
    'unreachable.batteryBody': 'No sign of life for {count} min — probably a dead battery',
    'unreachable.reachableBody': 'Their phone is answering again',
  },
  es: {
    'unreachable.action': 'tiene el teléfono ilocalizable',
    'unreachable.reachableAction': 'vuelve a estar localizable',
    'unreachable.sinceBody': 'Sin señales de vida desde hace {count} min — probablemente sin cobertura o en modo avión',
    'unreachable.batteryBody': 'Sin señales de vida desde hace {count} min — probablemente sin batería',
    'unreachable.reachableBody': 'Su teléfono vuelve a responder',
  },
  pt: {
    'unreachable.action': 'está com o telefone inacessível',
    'unreachable.reachableAction': 'está acessível de novo',
    'unreachable.sinceBody': 'Sem sinal de vida há {count} min — provavelmente sem rede ou em modo avião',
    'unreachable.batteryBody': 'Sem sinal de vida há {count} min — provavelmente sem bateria',
    'unreachable.reachableBody': 'O telefone voltou a responder',
  },
  de: {
    'unreachable.action': 'ist am Handy nicht erreichbar',
    'unreachable.reachableAction': 'ist wieder erreichbar',
    'unreachable.sinceBody': 'Seit {count} Min. kein Lebenszeichen – wahrscheinlich kein Netz oder Flugmodus',
    'unreachable.batteryBody': 'Seit {count} Min. kein Lebenszeichen – wahrscheinlich Akku leer',
    'unreachable.reachableBody': 'Das Handy antwortet wieder',
  },
  it: {
    'unreachable.action': 'ha il telefono irraggiungibile',
    'unreachable.reachableAction': 'è di nuovo raggiungibile',
    'unreachable.sinceBody': 'Nessun segno di vita da {count} min — probabilmente senza rete o in modalità aereo',
    'unreachable.batteryBody': 'Nessun segno di vita da {count} min — probabilmente batteria scarica',
    'unreachable.reachableBody': 'Il telefono risponde di nuovo',
  },
  ar: {
    'unreachable.action': 'هاتفه غير متاح',
    'unreachable.reachableAction': 'أصبح متاحًا من جديد',
    'unreachable.sinceBody': 'لا أثر منذ {count} دقيقة — على الأرجح بلا شبكة أو في وضع الطيران',
    'unreachable.batteryBody': 'لا أثر منذ {count} دقيقة — على الأرجح نفدت البطارية',
    'unreachable.reachableBody': 'هاتفه يستجيب من جديد',
  },
  'zh-Hans': {
    'unreachable.action': '的手机无法联系',
    'unreachable.reachableAction': '已可以联系',
    'unreachable.sinceBody': '已 {count} 分钟没有动静 — 可能没有信号或处于飞行模式',
    'unreachable.batteryBody': '已 {count} 分钟没有动静 — 可能电池耗尽',
    'unreachable.reachableBody': '手机已恢复响应',
  },
};
