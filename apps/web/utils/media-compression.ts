/**
 * Utilitaire de compression des médias (images et vidéos)
 * Compresse automatiquement les fichiers >100MB avant upload
 */

import imageCompression from 'browser-image-compression';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const COMPRESSION_THRESHOLD = 100 * 1024 * 1024; // 100MB
const TARGET_SIZE = 50 * 1024 * 1024; // Cible: 50MB après compression

/**
 * Type pour le callback de progression
 */
export type CompressionProgressCallback = (progress: number, status: string) => void;

/**
 * Instance FFmpeg singleton
 */
let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;

/**
 * Initialise FFmpeg (chargé une seule fois)
 */
async function initFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  // Attendre si déjà en cours de chargement
  while (ffmpegLoading) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  ffmpegLoading = true;

  try {
    const ffmpeg = new FFmpeg();

    // Charger les fichiers core depuis CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    ffmpegLoaded = true;
    ffmpegLoading = false;

    return ffmpeg;
  } catch (error) {
    ffmpegLoading = false;
    throw new Error(`Failed to load FFmpeg: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Vérifie si un fichier nécessite une compression
 */
export function needsCompression(file: File): boolean {
  return file.size > COMPRESSION_THRESHOLD;
}

/**
 * Détecte si on est sur Safari/iOS
 */
function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(ua);
  return iOS || isSafariBrowser;
}

/**
 * Compresse une image
 */
export async function compressImage(
  file: File,
  onProgress?: CompressionProgressCallback
): Promise<File> {
  try {
    onProgress?.(0, 'Démarrage de la compression image...');

    // Calculer le ratio de compression nécessaire
    const compressionRatio = TARGET_SIZE / file.size;
    const quality = Math.max(0.5, Math.min(0.95, compressionRatio));

    onProgress?.(20, 'Compression en cours...');

    const options = {
      maxSizeMB: TARGET_SIZE / (1024 * 1024), // Convertir en MB
      maxWidthOrHeight: 4096, // Limite la résolution
      useWebWorker: true,
      fileType: file.type as any,
      initialQuality: quality,
    };

    const compressedFile = await imageCompression(file, options);

    onProgress?.(100, 'Compression terminée');

    // Créer un nouveau fichier avec le même nom
    return new File([compressedFile], file.name, {
      type: file.type,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error('Erreur compression image:', error);
    throw new Error(`Compression image échouée: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Compresse une vidéo
 */
export async function compressVideo(
  file: File,
  onProgress?: CompressionProgressCallback
): Promise<File> {
  try {
    // Sur Safari/iOS, utiliser une compression plus légère pour éviter les problèmes de mémoire
    const useLightCompression = isSafari() && file.size > 500 * 1024 * 1024; // >500MB sur Safari

    if (useLightCompression) {
      onProgress?.(0, 'Préparation de la compression légère...');
      // Pour les très gros fichiers sur Safari, on retourne le fichier original
      // avec un avertissement plutôt que de risquer un crash
      console.warn('Fichier très volumineux sur Safari/iOS - compression désactivée pour éviter un crash');
      onProgress?.(100, 'Fichier trop volumineux pour compression sur Safari');
      return file;
    }

    onProgress?.(0, 'Initialisation de FFmpeg...');

    const ffmpeg = await initFFmpeg();

    onProgress?.(10, 'Chargement de la vidéo...');

    // Écouter les logs de progression FFmpeg
    ffmpeg.on('progress', ({ progress }) => {
      const percent = Math.min(90, Math.round(progress * 80) + 10); // 10-90%
      onProgress?.(percent, 'Compression en cours...');
    });

    // Écrire le fichier dans le système de fichiers virtuel de FFmpeg
    const inputFileName = 'input' + getFileExtension(file.name);
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));

    onProgress?.(10, 'Compression vidéo en cours...');

    // Calculer le bitrate cible basé sur la taille souhaitée
    const durationSeconds = await getVideoDuration(file);
    const targetBitrate = Math.floor((TARGET_SIZE * 8) / durationSeconds); // en bits/sec
    const videoBitrate = Math.floor(targetBitrate * 0.9); // 90% pour la vidéo
    const audioBitrate = '128k'; // Bitrate audio fixe

    // Compression avec H.264 et réduction de résolution si nécessaire
    const outputFileName = 'output.mp4';

    await ffmpeg.exec([
      '-i', inputFileName,
      '-c:v', 'libx264', // Codec vidéo H.264
      '-preset', 'ultrafast', // Preset ultra-rapide pour Safari
      '-crf', '28', // Constant Rate Factor (18-28 = bonne qualité, 28-35 = compression élevée)
      '-maxrate', `${videoBitrate}`, // Bitrate maximum
      '-bufsize', `${videoBitrate * 2}`, // Taille du buffer
      '-vf', 'scale=iw*min(1\\,min(1920/iw\\,1080/ih)):-2', // Limiter à 1920x1080 max
      '-c:a', 'aac', // Codec audio AAC
      '-b:a', audioBitrate, // Bitrate audio
      '-movflags', '+faststart', // Optimiser pour le streaming
      outputFileName
    ]);

    onProgress?.(90, 'Finalisation...');

    // Lire le fichier compressé
    const data = await ffmpeg.readFile(outputFileName);
    const compressedBlob = new Blob([data], { type: 'video/mp4' });

    // Nettoyer les fichiers temporaires
    try {
      await ffmpeg.deleteFile(inputFileName);
      await ffmpeg.deleteFile(outputFileName);
    } catch (e) {
      console.warn('Erreur nettoyage fichiers temporaires FFmpeg:', e);
    }

    onProgress?.(100, 'Compression terminée');

    // Créer un nouveau fichier
    const originalName = file.name.replace(/\.[^.]+$/, '.mp4'); // Forcer .mp4
    return new File([compressedBlob], originalName, {
      type: 'video/mp4',
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error('Erreur compression vidéo:', error);
    throw new Error(`Compression vidéo échouée: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Obtient la durée d'une vidéo en secondes
 */
async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration || 60); // Défaut: 60 secondes si non disponible
    };

    video.onerror = () => {
      reject(new Error('Impossible de lire la durée de la vidéo'));
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Obtient l'extension d'un fichier
 */
function getFileExtension(filename: string): string {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0] : '.mp4';
}

/**
 * Compresse un fichier média (image ou vidéo) si nécessaire
 */
export async function compressMediaIfNeeded(
  file: File,
  onProgress?: CompressionProgressCallback
): Promise<File> {
  // Vérifier si compression nécessaire
  if (!needsCompression(file)) {
    return file;
  }

  onProgress?.(0, `Fichier trop volumineux (${formatFileSize(file.size)}), compression en cours...`);

  // Déterminer le type de fichier
  if (file.type.startsWith('image/')) {
    return await compressImage(file, onProgress);
  } else if (file.type.startsWith('video/')) {
    return await compressVideo(file, onProgress);
  }

  // Si ce n'est ni une image ni une vidéo, retourner le fichier original
  return file;
}

/**
 * Compresse plusieurs fichiers en parallèle
 */
export async function compressMultipleFiles(
  files: File[],
  onFileProgress?: (fileIndex: number, progress: number, status: string) => void
): Promise<File[]> {
  const compressedFiles: File[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      const compressed = await compressMediaIfNeeded(file, (progress, status) => {
        onFileProgress?.(i, progress, status);
      });
      compressedFiles.push(compressed);
    } catch (error) {
      console.error(`Erreur compression fichier ${file.name}:`, error);
      // En cas d'erreur, garder le fichier original
      compressedFiles.push(file);
      onFileProgress?.(i, 100, `Erreur: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return compressedFiles;
}

/**
 * Formate une taille de fichier pour l'affichage
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
