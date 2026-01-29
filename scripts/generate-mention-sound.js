#!/usr/bin/env node

/**
 * Générateur de son de mention
 * Son plus long et moins doux pour attirer l'attention
 */

const fs = require('fs');
const path = require('path');

// Configuration
const SAMPLE_RATE = 44100;
const DURATION = 0.7; // 0.7 seconde - plus long que la notification
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION);
const NUM_CHANNELS = 2; // Stéréo

// Créer le buffer audio
const samples = new Float32Array(NUM_SAMPLES * NUM_CHANNELS);

// Générer le son de mention (plus énergique)
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;

  // Trois tons pour un son plus riche et attention-grabbing
  // G5, B5, D6 (Sol majeur - accord plus brillant)
  const freq1 = 783.99; // G5 (Sol)
  const freq2 = 987.77; // B5 (Si)
  const freq3 = 1174.66; // D6 (Ré)

  const tone1 = Math.sin(2 * Math.PI * freq1 * t);
  const tone2 = Math.sin(2 * Math.PI * freq2 * t);
  const tone3 = Math.sin(2 * Math.PI * freq3 * t);

  // Enveloppe plus dynamique avec un sustain
  let envelope;
  if (t < 0.05) {
    // Attack rapide
    envelope = t / 0.05;
  } else if (t < 0.3) {
    // Sustain
    envelope = 1.0;
  } else {
    // Release plus lent
    envelope = Math.exp(-5 * (t - 0.3));
  }

  // Mélanger les tons avec l'enveloppe (volume plus élevé pour attirer l'attention)
  const sample = (tone1 * 0.25 + tone2 * 0.2 + tone3 * 0.15) * envelope;

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
const outputPath = path.join(__dirname, '../apps/web/public/sounds/mention.wav');
const outputDir = path.dirname(outputPath);

// Créer le dossier si nécessaire
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, wavBuffer);

console.log('✅ Son de mention généré avec succès !');
console.log(`📁 Fichier créé: ${outputPath}`);
console.log(`🔊 Format: WAV 16-bit, ${SAMPLE_RATE}Hz, Stéréo`);
console.log(`⏱️  Durée: ${DURATION}s`);
console.log(`🎵 Tonalité: Sol majeur (G5 + B5 + D6) - Son énergique et attention-grabbing`);
console.log('');
console.log('💡 Ce son est plus long et plus énergique pour les mentions importantes.');
