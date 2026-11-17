/**
 * Les gabarits de l'ANNONCE d'un nouvel appareil chiffré sur mon compte (#19156, spec
 * 2026-11-17 § 5.3, § 7.6), langue par langue — à part pour que
 * `notification-string-templates.ts` tienne dans son budget de taille (#4532).
 *
 * Titre et corps GÉNÉRIQUES : le libellé d'un appareil est un texte choisi par celui qui l'a
 * enrôlé, peut-être un attaquant ; il n'apparaît dans aucune notification. Au-delà de trois
 * annonces dans l'heure, elles se regroupent (`groupedTitle`, `{count}`).
 */

import type { NotificationLanguage, NotificationStringKey } from './notification-strings.js';

type DeviceVerificationKey = Extract<NotificationStringKey, `e2ee.deviceVerification.${string}`>;

export const E2EE_DEVICE_TEMPLATES: Record<NotificationLanguage, Record<DeviceVerificationKey, string>> = {
  fr: {
    'e2ee.deviceVerification.title': 'Nouvel appareil sur votre compte',
    'e2ee.deviceVerification.body': 'Ouvrez Meeshy pour le confirmer.',
    'e2ee.deviceVerification.groupedTitle': '{count} nouveaux appareils sur votre compte',
    'e2ee.deviceVerification.groupedBody': 'Ouvrez Meeshy pour les vérifier.',
  },
  en: {
    'e2ee.deviceVerification.title': 'New device on your account',
    'e2ee.deviceVerification.body': 'Open Meeshy to confirm it.',
    'e2ee.deviceVerification.groupedTitle': '{count} new devices on your account',
    'e2ee.deviceVerification.groupedBody': 'Open Meeshy to check them.',
  },
  es: {
    'e2ee.deviceVerification.title': 'Nuevo dispositivo en tu cuenta',
    'e2ee.deviceVerification.body': 'Abre Meeshy para confirmarlo.',
    'e2ee.deviceVerification.groupedTitle': '{count} dispositivos nuevos en tu cuenta',
    'e2ee.deviceVerification.groupedBody': 'Abre Meeshy para revisarlos.',
  },
  pt: {
    'e2ee.deviceVerification.title': 'Novo dispositivo na sua conta',
    'e2ee.deviceVerification.body': 'Abra o Meeshy para confirmá-lo.',
    'e2ee.deviceVerification.groupedTitle': '{count} novos dispositivos na sua conta',
    'e2ee.deviceVerification.groupedBody': 'Abra o Meeshy para verificá-los.',
  },
  de: {
    'e2ee.deviceVerification.title': 'Neues Gerät in deinem Konto',
    'e2ee.deviceVerification.body': 'Öffne Meeshy, um es zu bestätigen.',
    'e2ee.deviceVerification.groupedTitle': '{count} neue Geräte in deinem Konto',
    'e2ee.deviceVerification.groupedBody': 'Öffne Meeshy, um sie zu prüfen.',
  },
  it: {
    'e2ee.deviceVerification.title': 'Nuovo dispositivo sul tuo account',
    'e2ee.deviceVerification.body': 'Apri Meeshy per confermarlo.',
    'e2ee.deviceVerification.groupedTitle': '{count} nuovi dispositivi sul tuo account',
    'e2ee.deviceVerification.groupedBody': 'Apri Meeshy per verificarli.',
  },
  ar: {
    'e2ee.deviceVerification.title': 'جهاز جديد على حسابك',
    'e2ee.deviceVerification.body': 'افتح Meeshy لتأكيده.',
    'e2ee.deviceVerification.groupedTitle': '{count} أجهزة جديدة على حسابك',
    'e2ee.deviceVerification.groupedBody': 'افتح Meeshy للتحقق منها.',
  },
  'zh-Hans': {
    'e2ee.deviceVerification.title': '你的账户上有新设备',
    'e2ee.deviceVerification.body': '打开 Meeshy 进行确认。',
    'e2ee.deviceVerification.groupedTitle': '你的账户上有 {count} 台新设备',
    'e2ee.deviceVerification.groupedBody': '打开 Meeshy 进行核实。',
  },
};
