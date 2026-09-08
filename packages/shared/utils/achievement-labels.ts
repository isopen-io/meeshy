/**
 * LES GABARITS DE LIBELLÉ DES SUCCÈS (#5759).
 *
 * UN gabarit par FAMILLE, pas un libellé par succès : `{n}` porte le palier.
 * Neuf familles × huit langues = 72 chaînes, pour ~50 succès aujourd'hui et
 * autant qu'on voudra demain — ajouter un palier ne coûte AUCUNE traduction.
 *
 * ## Pourquoi un gabarit par famille, et non une composition libre
 *
 * On pourrait composer `{geste} {n} {sujet}` et descendre à ~20 chaînes. On ne
 * le fait pas : l'accord grammatical le rend faux hors du français et de
 * l'anglais — l'arabe fléchit le nom selon le nombre (duel, pluriel de
 * paucité), l'allemand décline selon le cas régi par le verbe. Une phrase
 * bancale dans deux langues sur huit coûte plus cher que cinquante chaînes.
 *
 * Le gabarit est COMPACT parce que l'écran le rend en rangée horizontale : il
 * doit s'identifier seul, sans en-tête de famille au-dessus. « 100
 * conversations » et « 100 départs » se distinguent ; « 100 » ne se
 * distinguerait pas.
 */

import { normalizeNotificationLanguage, type NotificationLanguage } from './notification-strings.js';
import { familyId } from '../types/achievement-families.js';
import type { AchievementFamily } from '../types/achievement-catalog.js';

type FamilyLabels = Record<string, string>;

/** `{n}` est remplacé par le palier, formaté selon la locale du LECTEUR. */
export const ACHIEVEMENT_LABELS: Record<NotificationLanguage, FamilyLabels> = {
  fr: {
    'conversation.join.size': 'Conversation de {n} membres',
    'conversation.join.count': '{n} conversations rejointes',
    'conversation.leave.count': '{n} conversations quittées',
    'conversation.create.count': '{n} conversations créées',
    'community.join.size': 'Communauté de {n} membres',
    'community.join.count': '{n} communautés rejointes',
    'community.create.size': '{n} membres réunis',
    'community.create.count': '{n} communautés créées',
  },
  en: {
    'conversation.join.size': 'Conversation of {n} members',
    'conversation.join.count': '{n} conversations joined',
    'conversation.leave.count': '{n} conversations left',
    'conversation.create.count': '{n} conversations created',
    'community.join.size': 'Community of {n} members',
    'community.join.count': '{n} communities joined',
    'community.create.size': '{n} members gathered',
    'community.create.count': '{n} communities created',
  },
  es: {
    'conversation.join.size': 'Conversación de {n} miembros',
    'conversation.join.count': '{n} conversaciones unidas',
    'conversation.leave.count': '{n} conversaciones abandonadas',
    'conversation.create.count': '{n} conversaciones creadas',
    'community.join.size': 'Comunidad de {n} miembros',
    'community.join.count': '{n} comunidades unidas',
    'community.create.size': '{n} miembros reunidos',
    'community.create.count': '{n} comunidades creadas',
  },
  pt: {
    'conversation.join.size': 'Conversa de {n} membros',
    'conversation.join.count': '{n} conversas entradas',
    'conversation.leave.count': '{n} conversas deixadas',
    'conversation.create.count': '{n} conversas criadas',
    'community.join.size': 'Comunidade de {n} membros',
    'community.join.count': '{n} comunidades entradas',
    'community.create.size': '{n} membros reunidos',
    'community.create.count': '{n} comunidades criadas',
  },
  de: {
    'conversation.join.size': 'Unterhaltung mit {n} Mitgliedern',
    'conversation.join.count': '{n} Unterhaltungen beigetreten',
    'conversation.leave.count': '{n} Unterhaltungen verlassen',
    'conversation.create.count': '{n} Unterhaltungen erstellt',
    'community.join.size': 'Community mit {n} Mitgliedern',
    'community.join.count': '{n} Communitys beigetreten',
    'community.create.size': '{n} Mitglieder versammelt',
    'community.create.count': '{n} Communitys erstellt',
  },
  it: {
    'conversation.join.size': 'Conversazione di {n} membri',
    'conversation.join.count': '{n} conversazioni raggiunte',
    'conversation.leave.count': '{n} conversazioni lasciate',
    'conversation.create.count': '{n} conversazioni create',
    'community.join.size': 'Community di {n} membri',
    'community.join.count': '{n} community raggiunte',
    'community.create.size': '{n} membri riuniti',
    'community.create.count': '{n} community create',
  },
  ar: {
    'conversation.join.size': 'محادثة من {n} عضوًا',
    'conversation.join.count': 'الانضمام إلى {n} محادثة',
    'conversation.leave.count': 'مغادرة {n} محادثة',
    'conversation.create.count': 'إنشاء {n} محادثة',
    'community.join.size': 'مجتمع من {n} عضوًا',
    'community.join.count': 'الانضمام إلى {n} مجتمع',
    'community.create.size': 'جمع {n} عضوًا',
    'community.create.count': 'إنشاء {n} مجتمع',
  },
  'zh-Hans': {
    'conversation.join.size': '{n} 人的会话',
    'conversation.join.count': '加入 {n} 个会话',
    'conversation.leave.count': '退出 {n} 个会话',
    'conversation.create.count': '创建 {n} 个会话',
    'community.join.size': '{n} 人的社区',
    'community.join.count': '加入 {n} 个社区',
    'community.create.size': '聚集 {n} 位成员',
    'community.create.count': '创建 {n} 个社区',
  },
};

/** Les locales dont le format de nombre correspond à chaque langue du catalogue. */
const NUMBER_LOCALES: Record<NotificationLanguage, string> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  it: 'it-IT',
  ar: 'ar-EG',
  'zh-Hans': 'zh-Hans-CN',
};

/**
 * Le libellé d'un succès, dans la langue du LECTEUR.
 *
 * Le nombre est formaté SELON CETTE LANGUE : « 1 000 » en français, « 1,000 »
 * en anglais, « ١٠٠٠ » en arabe. Servir « 1000 » brut ferait lire un catalogue
 * traduit avec des chiffres qui ne le sont pas — l'incohérence exacte que la
 * face « cadrage » du Prisme interdit.
 *
 * Famille inconnue ⇒ `null`, jamais une clé affichée : c'est la leçon du
 * `first_content` servi tel quel sur un écran verrouillé (#5731).
 */
export function achievementLabel(
  language: string,
  family: AchievementFamily,
  tier: number,
): string | null {
  const lang = normalizeNotificationLanguage(language);
  const gabarit = ACHIEVEMENT_LABELS[lang][familyId(family)];
  if (gabarit === undefined) return null;
  const nombre = new Intl.NumberFormat(NUMBER_LOCALES[lang]).format(tier);
  return gabarit.replace('{n}', nombre);
}
