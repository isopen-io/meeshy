import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { servableExtension, staticFileUrl } from './soundFormats';

const log = enhancedLogger.child({ module: 'SoundCaptureService' });

const AUDIO_MIME_PREFIX = 'audio/';

export interface CaptureTrack {
  /** `StoryAudioPlayerObject.id`. */
  trackId: string;
  /** Fichier propre à l'auteur — déclenche une capture. */
  postMediaId?: string;
  /** Son emprunté — aucune capture, seulement un usage. */
  soundId?: string;
  startMs?: number;
  endMs?: number;
}

export interface CaptureContext {
  postId: string;
  authorId: string;
  /** Seuls les contenus PUBLICS alimentent la bibliothèque. */
  isPublic: boolean;
  tracks: CaptureTrack[];
  viaPostId?: string;
}

/**
 * Capture des sons originaux à la publication d'un contenu public.
 *
 * INVARIANT : `captureSounds` ne rejette JAMAIS. Chaque piste est isolée dans
 * son propre try/catch. Publier ne dépend pas de la bibliothèque.
 */
export class SoundCaptureService {
  constructor(
    private prisma: PrismaClient,
    private soundsDir: string = process.env.UPLOAD_DIR ?? '/app/sounds',
    /** `PostMedia.filePath` est RELATIF à cette racine (tus-handler.ts:129). */
    private uploadsRoot: string = process.env.UPLOAD_PATH ?? '/app/uploads',
  ) {}

  /** SHA-256 lu EN FLUX : la durée est illimitée, charger en mémoire ferait tomber le gateway. */
  static hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  async captureSounds(ctx: CaptureContext): Promise<void> {
    try {
      if (process.env.SOUND_LIBRARY_ENABLED !== 'true') return;
      if (!ctx.isPublic) return;

      // Édition : les usages des pistes disparues sont retirés, sinon elles
      // surcomptent pour toujours.
      await this.dropRemovedUsages(ctx);
      if (ctx.tracks.length === 0) return;

      await this.recordBorrowed(ctx);
      await this.captureOwned(ctx);
    } catch (error) {
      log.error('captureSounds a échoué — la publication n\'est pas affectée',
        error instanceof Error ? error : new Error(String(error)), { postId: ctx.postId });
    }
  }

  private async dropRemovedUsages(ctx: CaptureContext): Promise<void> {
    const kept = ctx.tracks.map((t) => t.trackId);
    await this.releaseUsages({ postId: ctx.postId, trackId: { notIn: kept } });
  }

  /**
   * Libère TOUS les usages d'un post — suppression, expiration, purge.
   *
   * Le `Sound`, lui, SURVIT : c'est l'invariant d'indépendance du modèle. Ne
   * rejette jamais ; supprimer un post ne peut pas échouer à cause de la
   * bibliothèque.
   */
  async releasePost(postId: string): Promise<void> {
    try {
      await this.releaseUsages({ postId });
    } catch (error) {
      log.error('releasePost a échoué — la suppression n\'est pas affectée',
        error instanceof Error ? error : new Error(String(error)), { postId });
    }
  }

  /**
   * Variante en lot pour la purge des stories expirées et de leurs reposts.
   *
   * Ne rejette pas non plus : la purge tourne dans un `try` unique côté
   * appelant, une exception ici avorterait le hard-delete des posts eux-mêmes
   * et les laisserait s'accumuler sans limite.
   */
  async releasePosts(postIds: string[]): Promise<void> {
    if (postIds.length === 0) return;
    try {
      await this.releaseUsages({ postId: { in: postIds } });
    } catch (error) {
      log.error('releasePosts a échoué — la purge des posts n\'est pas affectée',
        error instanceof Error ? error : new Error(String(error)), { count: postIds.length });
    }
  }

  /**
   * Supprime les usages désignés puis RECOMPTE `usageCount` depuis
   * `SoundUsage` pour chaque son touché.
   *
   * Un recomptage, jamais un `decrement`. Le décrément aveugle dérivait de
   * façon DÉFINITIVE : un crash entre le `deleteMany` et la boucle laissait un
   * compteur trop haut pour toujours, et `usageCount` trie la découverte. Le
   * recomptage est idempotent — rejouer la même purge donne le même résultat,
   * et le prochain passage sur ce son corrige une dérive antérieure.
   */
  private async releaseUsages(where: Record<string, unknown>): Promise<void> {
    const removed = await this.prisma.soundUsage.findMany({ where: where as never, select: { soundId: true } });
    if (removed.length === 0) return;
    await this.prisma.soundUsage.deleteMany({ where: where as never });
    const touched = [...new Set(removed.map((u) => u.soundId))];
    for (const soundId of touched) {
      await this.recountSound(soundId).catch(() => undefined);
    }
  }

  /** Aligne `usageCount` sur le nombre réel de lignes `SoundUsage`. */
  private async recountSound(soundId: string): Promise<void> {
    const usageCount = await this.prisma.soundUsage.count({ where: { soundId } });
    await this.prisma.sound.update({ where: { id: soundId }, data: { usageCount } });
  }

  /**
   * Réconciliation complète — outil d'exploitation, jamais sur un chemin chaud.
   *
   * Parcourt les sons par pages et réaligne ceux dont le compteur ment.
   * IMPLÉMENTATION UNIQUE : `scripts/reconcile-sound-usage.ts` n'est qu'une
   * façade CLI par-dessus, sans quoi le script et le service dériveraient.
   *
   * N'écrit QUE si `apply` est vrai — un audit doit pouvoir être lancé en
   * production sans rien changer.
   */
  async reconcileUsageCounts(options: {
    apply?: boolean;
    batchSize?: number;
    onDrift?: (drift: { soundId: string; from: number; to: number }) => void;
  } = {}): Promise<{ examined: number; drifted: number; fixed: number }> {
    const { apply = false, batchSize = 200, onDrift } = options;
    let cursor: string | undefined;
    let examined = 0;
    let drifted = 0;
    let fixed = 0;

    for (;;) {
      // Projection MINIMALE : les documents hérités n'ont ni `waveform` ni
      // `mimeType`, et Prisma/MongoDB lève à la LECTURE sur un champ absent.
      const page = await this.prisma.sound.findMany({
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, usageCount: true },
      });
      if (page.length === 0) break;
      cursor = page[page.length - 1]?.id;

      for (const sound of page) {
        examined += 1;
        const real = await this.prisma.soundUsage.count({ where: { soundId: sound.id } });
        if (real === sound.usageCount) continue;

        drifted += 1;
        onDrift?.({ soundId: sound.id, from: sound.usageCount, to: real });
        log.warn('usageCount en dérive', { soundId: sound.id, from: sound.usageCount, to: real, apply });
        if (!apply) continue;

        await this.prisma.sound.update({ where: { id: sound.id }, data: { usageCount: real } });
        fixed += 1;
      }

      if (page.length < batchSize) break;
    }

    return { examined, drifted, fixed };
  }

  /**
   * Pistes empruntées. GARDE OBLIGATOIRE : sans elle, n'importe qui lie son
   * post au son privé d'autrui et gonfle le compteur qui trie la découverte.
   */
  private async recordBorrowed(ctx: CaptureContext): Promise<void> {
    const borrowed = ctx.tracks.filter((t) => t.soundId);
    if (borrowed.length === 0) return;

    const sounds = await this.prisma.sound.findMany({
      where: { id: { in: borrowed.map((t) => t.soundId!) } },
      select: { id: true, isPublic: true, uploaderId: true, mutedAt: true },
    });
    const allowed = new Set(
      sounds
        .filter((s) => !s.mutedAt && (s.isPublic || s.uploaderId === ctx.authorId))
        .map((s) => s.id),
    );

    for (const track of borrowed) {
      if (!allowed.has(track.soundId!)) {
        log.warn('soundId refusé (privé, coupé ou inexistant)', { postId: ctx.postId, soundId: track.soundId });
        continue;
      }
      await this.recordUsage(ctx, track.soundId!, track);
    }
  }

  private async captureOwned(ctx: CaptureContext): Promise<void> {
    const owned = ctx.tracks.filter((t) => !t.soundId && t.postMediaId);
    if (owned.length === 0) return;

    // SCOPE OBLIGATOIRE `postId` : `storyEffects` est contrôlé par le client.
    // Sans lui, un utilisateur désigne le PostMedia audio de n'importe qui et
    // se le fait créditer.
    // `language` est sélectionnée ICI : la ligne est déjà lue, une seconde
    // requête `findUnique` sur le même document ne rapporterait rien de plus.
    const medias = await this.prisma.postMedia.findMany({
      where: { id: { in: owned.map((t) => t.postMediaId!) }, postId: ctx.postId },
      select: { id: true, fileUrl: true, filePath: true, mimeType: true, duration: true, language: true },
    });
    const byId = new Map(medias.map((m) => [m.id, m]));

    for (const track of owned) {
      const media = byId.get(track.postMediaId!);
      if (!media) continue;
      if (!media.mimeType.startsWith(AUDIO_MIME_PREFIX)) continue;
      await this.captureOne(ctx, track, media);
    }
  }

  private async captureOne(
    ctx: CaptureContext,
    track: CaptureTrack,
    media: { id: string; filePath: string; mimeType: string; duration: number | null; language?: string | null },
  ): Promise<void> {
    try {
      const absolute = path.isAbsolute(media.filePath)
        ? media.filePath
        : path.join(this.uploadsRoot, media.filePath);

      // Ce qui n'est pas SERVABLE n'est pas capturé : sinon le `Sound` naît
      // avec un `fileUrl` que `GET /static` refusera pour toujours (400).
      const ext = servableExtension(media.mimeType, absolute);
      if (!ext) {
        log.warn('format non servable — capture ignorée',
          { postId: ctx.postId, trackId: track.trackId, mimeType: media.mimeType });
        return;
      }

      const hash = await SoundCaptureService.hashFile(absolute);

      const existing = await this.prisma.sound.findFirst({
        where: { uploaderId: ctx.authorId, contentHash: hash },
        select: { id: true },
      });
      if (existing) {
        await this.recordUsage(ctx, existing.id, track);
        return;
      }

      await fsp.mkdir(this.soundsDir, { recursive: true });
      await fsp.copyFile(absolute, path.join(this.soundsDir, `${hash}${ext}`));

      const sound = await this.prisma.sound.create({
        data: {
          uploaderId: ctx.authorId,
          fileUrl: staticFileUrl(`${hash}${ext}`),
          // Chaîne NEUTRE : le crédit se résout à la lecture via `uploader`.
          title: 'Son original',
          duration: Math.round((media.duration ?? 0) / 1000),
          durationMs: media.duration ?? 0,
          contentHash: hash,
          sourcePostId: ctx.postId,
          canonicalPostMediaId: media.id,
          mimeType: media.mimeType,
          sourceLanguage: media.language ?? null,
          isPublic: true,
        },
        select: { id: true },
      });

      await this.recordUsage(ctx, sound.id, track);
    } catch (error) {
      log.error('Capture d\'une piste impossible',
        error instanceof Error ? error : new Error(String(error)),
        { postId: ctx.postId, trackId: track.trackId });
    }
  }

  private async recordUsage(ctx: CaptureContext, soundId: string, track: CaptureTrack): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.soundUsage.create({
          data: {
            soundId, postId: ctx.postId, trackId: track.trackId,
            viaPostId: ctx.viaPostId, startMs: track.startMs, endMs: track.endMs,
          },
        }),
        this.prisma.sound.update({
          where: { id: soundId },
          data: { usageCount: { increment: 1 } },
        }),
      ]);
    } catch {
      // Doublon `(postId, trackId)` = republication idempotente, comportement voulu.
    }
  }
}
