#!/usr/bin/env node

/**
 * Générateur de son de notification doux
 * Génère un fichier WAV avec deux tons harmoniques et un fade out
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SAMPLE_RATE = 44100;
const DURATION = 0.4; // 0.4 seconde - son court et doux
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION);
const NUM_CHANNELS = 2; // Stéréo

// Créer le buffer audio
const samples = new Float32Array(NUM_SAMPLES * NUM_CHANNELS);

// Générer le son doux
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;

  // Deux tons harmoniques doux (C5 et E5 - accord majeur)
  const freq1 = 523.25; // C5 (Do)
  const freq2 = 659.25; // E5 (Mi)

  const tone1 = Math.sin(2 * Math.PI * freq1 * t);
  const tone2 = Math.sin(2 * Math.PI * freq2 * t);

  // Enveloppe ADSR simplifiée pour un son doux
  let envelope;
  if (t < 0.05) {
    // Attack (montée rapide)
    envelope = t / 0.05;
  } else {
    // Decay/Release (descente douce)
    envelope = Math.exp(-8 * (t - 0.05));
  }

  // Mélanger les tons avec l'enveloppe (volume réduit pour être doux)
  const sample = (tone1 * 0.2 + tone2 * 0.15) * envelope;

  // Écrire en stéréo
  samples[i * 2] = sample;     // Canal gauche
  samples[i * 2 + 1] = sample; // Canal droit
}

// Convertir en PCM 16-bit
const pcmData = new Int16Array(samples.length);
for (let i = 0; i < samples.length; i++) {
  const s = Math.max(-1, Math.min(1, samples[i]));
  pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
}

// Créer l'en-tête WAV
const blockAlign = NUM_CHANNELS * 2; // 2 bytes per sample
const byteRate = SAMPLE_RATE * blockAlign;
const dataSize = pcmData.length * 2;

const header = Buffer.alloc(44);

// RIFF chunk descriptor
header.write('RIFF', 0);
header.writeUInt32LE(36 + dataSize, 4);
header.write('WAVE', 8);

// fmt sub-chunk
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);        // fmt chunk size
header.writeUInt16LE(1, 20);         // audio format (PCM)
header.writeUInt16LE(NUM_CHANNELS, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(byteRate, 28);
header.writeUInt16LE(blockAlign, 32);
header.writeUInt16LE(16, 34);        // bits per sample

// data sub-chunk
header.write('data', 36);
header.writeUInt32LE(dataSize, 40);

// Combiner l'en-tête et les données
const wavBuffer = Buffer.concat([header, Buffer.from(pcmData.buffer)]);

// Sauvegarder le fichier
const outputPath = path.join(__dirname, '../apps/web/public/sounds/notification.wav');
const outputDir = path.dirname(outputPath);

// Créer le dossier si nécessaire
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, wavBuffer);

console.log('✅ Son de notification généré avec succès !');
console.log(`📁 Fichier créé: ${outputPath}`);
console.log(`🔊 Format: WAV 16-bit, ${SAMPLE_RATE}Hz, Stéréo`);
console.log(`⏱️  Durée: ${DURATION}s`);
console.log(`🎵 Tonalité: Do majeur (C5 + E5) - Son doux et harmonieux`);
console.log('');
console.log('💡 Note: Le navigateur lira automatiquement le fichier .wav');
console.log('   Si vous voulez un .mp3, utilisez un convertisseur en ligne.');
