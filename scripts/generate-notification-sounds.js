#!/usr/bin/env node

/**
 * Générateur de tous les sons de notification
 * Génère notification.wav (doux) et mention.wav (énergique)
 */

const fs = require('fs');
const path = require('path');

function generateSound(config) {
  const { filename, duration, tones, volumeMix, envelopeConfig, description } = config;

  const SAMPLE_RATE = 44100;
  const NUM_SAMPLES = Math.floor(SAMPLE_RATE * duration);
  const NUM_CHANNELS = 2; // Stéréo

  // Créer le buffer audio
  const samples = new Float32Array(NUM_SAMPLES * NUM_CHANNELS);

  // Générer le son
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;

    // Générer les tons
    let sample = 0;
    tones.forEach((freq, index) => {
      const tone = Math.sin(2 * Math.PI * freq * t);
      sample += tone * volumeMix[index];
    });

    // Appliquer l'enveloppe
    let envelope;
    if (t < envelopeConfig.attack) {
      envelope = t / envelopeConfig.attack;
    } else if (t < envelopeConfig.attack + envelopeConfig.sustain) {
      envelope = 1.0;
    } else {
      envelope = Math.exp(-envelopeConfig.decay * (t - envelopeConfig.attack - envelopeConfig.sustain));
    }

    sample *= envelope;

    // Écrire en stéréo
    samples[i * 2] = sample;
    samples[i * 2 + 1] = sample;
  }

  // Convertir en PCM 16-bit
  const pcmData = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  // Créer l'en-tête WAV
  const blockAlign = NUM_CHANNELS * 2;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = pcmData.length * 2;

  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  // Combiner l'en-tête et les données
  const wavBuffer = Buffer.concat([header, Buffer.from(pcmData.buffer)]);

  // Sauvegarder le fichier
  const outputPath = path.join(__dirname, '../apps/web/public/sounds', filename);
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, wavBuffer);

  console.log(`✅ ${filename} généré avec succès !`);
  console.log(`   ${description}`);
  console.log(`   Durée: ${duration}s, Taille: ${Math.round(wavBuffer.length / 1024)}KB`);
  console.log('');
}

// Configuration des sons
const sounds = [
  {
    filename: 'notification.wav',
    duration: 0.4,
    tones: [523.25, 659.25], // C5, E5 (Do majeur)
    volumeMix: [0.2, 0.15],
    envelopeConfig: {
      attack: 0.05,
      sustain: 0,
      decay: 8
    },
    description: '🎵 Notification standard - Son doux et harmonieux (Do majeur)'
  },
  {
    filename: 'mention.wav',
    duration: 0.7,
    tones: [783.99, 987.77, 1174.66], // G5, B5, D6 (Sol majeur)
    volumeMix: [0.25, 0.2, 0.15],
    envelopeConfig: {
      attack: 0.05,
      sustain: 0.25,
      decay: 5
    },
    description: '🔔 Mention - Son énergique et attention-grabbing (Sol majeur)'
  }
];

console.log('🎶 Génération des sons de notification...\n');

sounds.forEach(generateSound);

console.log('✨ Tous les sons ont été générés avec succès !');
console.log('📁 Emplacement: apps/web/public/sounds/');
