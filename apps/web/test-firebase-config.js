#!/usr/bin/env node
/**
 * Script de test de la configuration Firebase
 *
 * Usage:
 *   node test-firebase-config.js
 *
 * Vérifie que toutes les variables d'environnement Firebase sont définies
 * et affiche un résumé de la configuration.
 */

require('dotenv').config({ path: '.env.local' });

console.log('\n🔥 TEST DE CONFIGURATION FIREBASE\n');
console.log('='.repeat(60));
console.log('\n');

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
};

const featureFlags = {
  enablePushNotifications: process.env.NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS,
  enablePWABadges: process.env.NEXT_PUBLIC_ENABLE_PWA_BADGES,
};

// Vérifier que toutes les valeurs sont définies
const missing = [];
const invalid = [];

console.log('📋 CONFIGURATION FIREBASE:\n');

Object.entries(config).forEach(([key, value]) => {
  const displayKey = key.padEnd(25);

  if (!value) {
    missing.push(key);
    console.log(`  ❌ ${displayKey} MANQUANT`);
  } else if (value.includes('xxxxx') || value.includes('VOTRE_')) {
    invalid.push(key);
    console.log(`  ⚠️  ${displayKey} NON REMPLACÉ (template détecté)`);
  } else {
    // Masquer partiellement pour sécurité
    const preview = value.length > 30
      ? `${value.substring(0, 25)}...`
      : value;
    console.log(`  ✅ ${displayKey} ${preview}`);
  }
});

console.log('\n📋 FEATURE FLAGS:\n');

Object.entries(featureFlags).forEach(([key, value]) => {
  const displayKey = key.padEnd(25);
  const status = value === 'true' ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ';
  console.log(`  ${status.padEnd(15)} ${displayKey}`);
});

console.log('\n' + '='.repeat(60));

// Résumé final
if (missing.length === 0 && invalid.length === 0) {
  console.log('\n✅ CONFIGURATION FIREBASE COMPLÈTE ET VALIDE !\n');
  console.log('Vous pouvez maintenant:');
  console.log('  1. Démarrer le serveur dev: npm run dev');
  console.log('  2. Tester dans le navigateur');
  console.log('  3. Vérifier les notifications push\n');
  process.exit(0);
} else {
  console.log('\n⚠️  PROBLÈMES DÉTECTÉS :\n');

  if (missing.length > 0) {
    console.log(`  ❌ ${missing.length} variable(s) manquante(s):`);
    missing.forEach(key => console.log(`     - ${key}`));
    console.log('');
  }

  if (invalid.length > 0) {
    console.log(`  ⚠️  ${invalid.length} variable(s) non remplacée(s):`);
    invalid.forEach(key => console.log(`     - ${key}`));
    console.log('');
  }

  console.log('📚 ACTIONS REQUISES:\n');
  console.log('  1. Ouvrir Firebase Console: https://console.firebase.google.com');
  console.log('  2. Copier vos credentials Firebase');
  console.log('  3. Éditer frontend/.env.local');
  console.log('  4. Remplacer les valeurs xxxxx par vos vraies valeurs');
  console.log('  5. Re-lancer ce script: node test-firebase-config.js\n');
  console.log('📖 Guide complet: FIREBASE_SETUP_GUIDE.md\n');

  process.exit(1);
}
