import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import fsp from 'fs/promises';
import path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { servableExtension, staticFileUrl } from './soundFormats';

const log = enhancedLogger.child({ module: 'SoundCaptureService' });

const AUDIO_MIME_PREFIX = 'audio/';
const VIDEO_MIME_PREFIX = 'video/';

/**
 * Démuxe la piste audio d'une vidéo vers un `.m4a` AAC.
 *
 * Injectable (tests) ; l'implémentation par défaut spawn le ffmpeg du
 * conteneur — même binaire que `UploadProcessor`. Rejette sur échec : c'est
 * l'appelant (`captureOneFromVideo`) qui décide que l'échec est non bloquant.
 */
export type VideoAudioExtractor = (inputPath: string, outputPath: string) => Promise<void>;

function spawnFfmpegExtract(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vn',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-f', 'ipod',
      outputPath,
    ]);
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('ffmpeg extraction timeout'));
    }, 5 * 60_000);
    proc.stderr.on('data', (d) => { stderr += String(d); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

export interface CaptureTrack {
  /** `StoryAudioPlayerObject.id`. */
  trackId: string;
  /** Fichier propre à l'auteur — déclenche une capture. */
  postMediaId?: string;
  /** Son emprunté — aucune capture, seulement un usage. */
  soundId?: string;
  startMs?: number;
  endMs?: number;
  /**
   * Échantillons de forme d'onde calculés par le client. `Sound.waveform`
   * n'avait AUCUN écrivain : la donnée arrivait ici et était jetée, et toute la
   * bibliothèque servait un tableau vide. Sans elle, un sélecteur de zone
   * s'ouvre sur du vide.
   */
  waveform?: number[];
  /** L'auteur a lui-même déplacé la fenêtre de source (pas le défaut accepté). */
  windowAdjusted?: boolean;
  /**
   * Média VIDÉO dont la bande-son doit être démuxée vers la bibliothèque.
   * Posé UNIQUEMENT par `mediaCaptureTracks` quand l'auteur a opté pour
   * `Post.allowSoundExtraction` — jamais lu depuis le blob client.
   */
  extractFromVideo?: boolean;
}

export interface CaptureContext {
  postId: string;
  authorId: string;
  /**
   * Le contenu alimente-t-il la bibliothèque ? Calculé par `feedsSoundLibrary`
   * (PUBLIC ou COMMUNITY, jamais un repost) — surtout pas « le post est
   * public » : depuis le 2026-07-31 les deux notions ont divergé.
   */
  feedsLibrary: boolean;
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
    private extractVideoAudio: VideoAudioExtractor = spawnFfmpegExtract,
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
      // Repasser un contenu public en privé doit LIBÉRER ses usages, pas les
      // figer : sinon publier puis restreindre laisse le compteur gonflé pour
      // toujours, et c'est lui qui trie la découverte.
      if (!ctx.feedsLibrary) {
        await this.releasePost(ctx.postId);
        return;
      }

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
   * REJETTE, délibérément, à l'inverse de `releasePost`. `SoundUsage.postId` est
   * une chaîne nue : ni relation, ni cascade (schema.prisma:3063). Avaler
   * l'erreur ici laisserait la purge supprimer les posts quand même, et les
   * usages devenus orphelins ne seraient plus atteints par AUCUN chemin — pire,
   * `reconcileUsageCounts` recompte *depuis* ces lignes et confirmerait le
   * compteur gonflé au lieu de le corriger.
   *
   * Échouer coûte une heure — la passe se rejoue. Orphaner coûte l'éternité.
   */
  async releasePosts(postIds: string[]): Promise<void> {
    if (postIds.length === 0) return;
    await this.releaseUsages({ postId: { in: postIds } });
  }

  /**
   * Supprime les usages désignés puis RECOMPTE `usageCount` depuis
   * `SoundUsage` pour chaque son touché.
   *
   * Un recomptage, jamais un `decrement` : le décrément était une opération
   * RELATIVE, donc un rejeu la comptait deux fois et une perte la comptait zéro.
   * Le recomptage écrit une valeur absolue — rejouer la même purge donne le même
   * résultat.
   *
   * Ce qu'il ne garantit PAS, et il faut le lire tel quel : un crash entre le
   * `deleteMany` et la boucle laisse encore le compteur trop haut, et rien ne
   * re-déclenche automatiquement un recomptage sur ces sons. Le rattrapage est
   * `reconcileUsageCounts`, lancé à la main. Le gain est qu'une dérive est
   * désormais RATTRAPABLE et détectable, là où le décrément la gravait.
   *
   * C'est aussi un lire-puis-écrire, non atomique : un `recordUsage` concurrent
   * entre le `count` et l'`update` est perdu. Même filet.
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
   * Supprime les usages dont le post n'existe plus ou est supprimé.
   *
   * Nécessaire parce que `releasePost` avale ses erreurs — il le DOIT, la
   * suppression d'un post par son auteur ne peut pas échouer à cause de la
   * bibliothèque. Mais `SoundUsage.postId` n'a ni relation ni cascade : un échec
   * laisse des lignes que rien ne rattrape, et `reconcileUsageCounts` les
   * compterait comme légitimes. Ce balayage est le filet de ce compromis, et
   * doit tourner AVANT le recomptage.
   *
   * `deletedAt` non nul compte comme supprimé : c'est précisément le cas où
   * `releasePost` avait échoué.
   */
  async sweepOrphanUsages(options: {
    apply?: boolean;
    batchSize?: number;
    onOrphan?: (orphan: { usageId: string; postId: string }) => void;
  } = {}): Promise<{ examined: number; orphans: number; deleted: number }> {
    const { apply = false, batchSize = 200, onOrphan } = options;
    let cursor: string | undefined;
    let examined = 0;
    let orphans = 0;
    let deleted = 0;

    for (;;) {
      const page = await this.prisma.soundUsage.findMany({
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, postId: true, soundId: true },
      });
      if (page.length === 0) break;
      cursor = page[page.length - 1]?.id;
      examined += page.length;

      const posts = await this.prisma.post.findMany({
        where: { id: { in: [...new Set(page.map((u) => u.postId))] } },
        select: { id: true, deletedAt: true },
      });
      const alive = new Set(posts.filter((p) => !p.deletedAt).map((p) => p.id));

      const dead = page.filter((u) => !alive.has(u.postId));
      orphans += dead.length;
      for (const usage of dead) onOrphan?.({ usageId: usage.id, postId: usage.postId });

      if (apply && dead.length > 0) {
        const result = await this.prisma.soundUsage.deleteMany({
          where: { id: { in: dead.map((u) => u.id) } },
        });
        deleted += result.count;
        for (const soundId of new Set(dead.map((u) => u.soundId))) {
          await this.recountSound(soundId).catch(() => undefined);
        }
      }

      if (page.length < batchSize) break;
    }

    return { examined, orphans, deleted };
  }

  /**
   * Réconciliation complète — outil d'exploitation, jamais sur un chemin chaud.
   *
   * Parcourt les sons par pages et réaligne ceux dont le compteur ment.
   * IMPLÉMENTATION UNIQUE : `scripts/reconcile-sound-usage.ts` n'est qu'une
   * façade CLI par-dessus, sans quoi le script et le service dériveraient.
   *
   * À lancer APRÈS `sweepOrphanUsages` : recompter d'abord confirmerait les
   * lignes orphelines au lieu de les corriger.
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
      // Projection MINIMALE à cause de `waveform Float[]` : Prisma/MongoDB lève
      // à la LECTURE sur un champ REQUIS absent, et les documents hérités n'ont
      // pas ce tableau. (`mimeType` est nullable, lui : il ne lève pas.)
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
      select: { id: true, isPublic: true, uploaderId: true, mutedAt: true, durationMs: true },
    });
    const byId = new Map(sounds.map((s) => [s.id, s]));
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
      // La part réellement utilisée ne peut pas dépasser la durée réelle du
      // son : au-delà, la piste BOUCLE, elle ne consomme pas plus de source.
      // Seulement quand la durée réelle est connue — un son sans `durationMs`
      // (fond legacy) laisse `endMs` tel quel plutôt que de le tronquer à 0.
      const durationMs = byId.get(track.soundId!)?.durationMs;
      const clamped = durationMs != null && track.endMs !== undefined && track.endMs > durationMs
        ? { ...track, endMs: durationMs }
        : track;
      await this.recordUsage(ctx, track.soundId!, clamped);
    }
  }

  /**
   * Vignette du contenu source, pour le sélecteur de sons.
   *
   * Une seule lecture par publication, partagée par toutes les pistes du post.
   * Jamais bloquante : sans vignette, le client dégrade sur l'avatar de
   * l'uploadeur.
   */
  private async findCover(postId: string): Promise<{ url: string | null; thumbHash: string | null }> {
    try {
      const media = await this.prisma.postMedia.findFirst({
        where: {
          postId,
          OR: [{ mimeType: { startsWith: 'image/' } }, { mimeType: { startsWith: 'video/' } }],
        },
        orderBy: { order: 'asc' },
        select: { thumbnailUrl: true, thumbHash: true, fileUrl: true, mimeType: true },
      });
      if (!media) return { url: null, thumbHash: null };
      // Une image sert d'elle-même de vignette ; une vidéo n'a que la sienne.
      const url = media.thumbnailUrl
        ?? (media.mimeType.startsWith('image/') ? media.fileUrl : null);
      return { url: url ?? null, thumbHash: media.thumbHash ?? null };
    } catch {
      return { url: null, thumbHash: null };
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
    // Lue UNE fois pour toutes les pistes du post, et seulement s'il y a
    // quelque chose à capturer.
    const cover = await this.findCover(ctx.postId);

    for (const track of owned) {
      const media = byId.get(track.postMediaId!);
      if (!media) continue;
      if (media.mimeType.startsWith(AUDIO_MIME_PREFIX)) {
        await this.captureOne(ctx, track, media, cover);
        continue;
      }
      // Bande-son d'une VIDÉO (réel) : capture UNIQUEMENT sur opt-in auteur —
      // `extractFromVideo` n'est posé que par `mediaCaptureTracks`, jamais lu
      // du blob client (`extractCaptureTracks` ne le produit pas).
      if (track.extractFromVideo === true && media.mimeType.startsWith(VIDEO_MIME_PREFIX)) {
        await this.captureOneFromVideo(ctx, track, media, cover);
      }
    }
  }

  /**
   * Capture la bande-son d'un média VIDÉO : démuxage ffmpeg vers un `.m4a`
   * AAC, puis même pipeline que `captureOne` — dédoublonnage par SHA-256,
   * nom de fichier opaque, `Sound` crédité à l'auteur avec provenance
   * (`sourcePostId`, `canonicalPostMediaId`).
   *
   * Le hash porte sur le FLUX EXTRAIT, pas sur le mp4 source : c'est le
   * fichier extrait qui vit en bibliothèque, et deux vidéos partageant la
   * même bande-son doivent se dédoublonner entre elles.
   *
   * Une vidéo SANS piste audio fait échouer ffmpeg (ou produit un conteneur
   * vide) : les deux cas se soldent par un `warn`, jamais un rejet — publier
   * ne dépend pas de la bibliothèque.
   */
  private async captureOneFromVideo(
    ctx: CaptureContext,
    track: CaptureTrack,
    media: { id: string; filePath: string; mimeType: string; duration: number | null; language?: string | null },
    cover: { url: string | null; thumbHash: string | null },
  ): Promise<void> {
    const extracted = path.join(os.tmpdir(), `sound-extract-${crypto.randomUUID()}.m4a`);
    try {
      const absolute = path.isAbsolute(media.filePath)
        ? media.filePath
        : path.join(this.uploadsRoot, media.filePath);

      await this.extractVideoAudio(absolute, extracted);

      const size = (await fsp.stat(extracted).catch(() => ({ size: 0 }))).size;
      if (size === 0) {
        log.warn('extraction vidéo sans piste audio — capture ignorée',
          { postId: ctx.postId, trackId: track.trackId });
        return;
      }

      const hash = await SoundCaptureService.hashFile(extracted);
      const existing = await this.prisma.sound.findFirst({
        where: { uploaderId: ctx.authorId, contentHash: hash },
        select: { id: true },
      });
      if (existing) {
        await this.recordUsage(ctx, existing.id, track);
        return;
      }

      // Même règle que `captureOne` : nom OPAQUE, jamais le hash (oracle de
      // possession — cf. commentaire de `captureOne`).
      const filename = `${crypto.randomUUID()}.m4a`;
      await fsp.mkdir(this.soundsDir, { recursive: true });
      await fsp.copyFile(extracted, path.join(this.soundsDir, filename));

      const sound = await this.prisma.sound.create({
        data: {
          uploaderId: ctx.authorId,
          fileUrl: staticFileUrl(filename),
          // Même doctrine que `captureOne` : titre vide + isAutoGenerated,
          // le client compose « Son original · @pseudo » dans sa langue.
          title: '',
          isAutoGenerated: true,
          duration: Math.round((media.duration ?? 0) / 1000),
          durationMs: media.duration ?? 0,
          waveform: track.waveform ?? [],
          contentHash: hash,
          sourcePostId: ctx.postId,
          canonicalPostMediaId: media.id,
          coverUrl: cover.url,
          coverThumbHash: cover.thumbHash,
          mimeType: 'audio/mp4',
          sourceLanguage: media.language ?? null,
          isPublic: true,
        },
        select: { id: true },
      });

      await this.recordUsage(ctx, sound.id, track);
    } catch (error) {
      log.warn('Extraction de bande-son impossible — la publication n\'est pas affectée', {
        postId: ctx.postId,
        trackId: track.trackId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await fsp.unlink(extracted).catch(() => undefined);
    }
  }

  private async captureOne(
    ctx: CaptureContext,
    track: CaptureTrack,
    media: { id: string; filePath: string; mimeType: string; duration: number | null; language?: string | null },
    cover: { url: string | null; thumbHash: string | null },
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

      // Nom OPAQUE, surtout pas le hash. `fileUrl` est dans le DTO public : le
      // nommer `<sha256>.<ext>` publiait le `contentHash` que `toDTO` retire
      // explicitement, et donnait un oracle de possession — `GET /static/<hash
      // du fichier suspecté>` répondant 200/404. Effet de bord voulu : deux
      // uploadeurs au même contenu ont désormais deux fichiers distincts, donc
      // couper le son de l'un ne renvoie plus 410 à l'autre.
      const filename = `${crypto.randomUUID()}${ext}`;
      await fsp.mkdir(this.soundsDir, { recursive: true });
      await fsp.copyFile(absolute, path.join(this.soundsDir, filename));

      const sound = await this.prisma.sound.create({
        data: {
          uploaderId: ctx.authorId,
          fileUrl: staticFileUrl(filename),
          // TITRE VIDE, délibérément. Écrire « Son original » gravait du
          // français en base, qui serait ressorti tel quel dans les sept
          // langues. Le couple `title: ''` + `isAutoGenerated: true` dit au
          // client : compose « Son original · @pseudo » dans TA langue, avec
          // l'auteur résolu à la lecture. L'auteur peut ensuite nommer son son
          // par `PATCH /sounds/:id` — ce titre-là, lui, s'affiche tel quel.
          title: '',
          isAutoGenerated: true,
          duration: Math.round((media.duration ?? 0) / 1000),
          durationMs: media.duration ?? 0,
          // `Float[]` n'est pas nullable en Prisma : l'absence s'écrit `[]`,
          // qui est exactement ce que sert déjà toute la bibliothèque
          // existante — donc aucun changement pour une piste sans échantillons.
          // Sans cette ligne, `Sound.waveform` n'avait AUCUN écrivain.
          waveform: track.waveform ?? [],
          contentHash: hash,
          sourcePostId: ctx.postId,
          canonicalPostMediaId: media.id,
          coverUrl: cover.url,
          coverThumbHash: cover.thumbHash,
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

  /**
   * Republier une piste (édition, retentative) doit METTRE À JOUR sa fenêtre,
   * pas être avalée comme un doublon inerte — sinon `windowAdjustedAt` et un
   * déplacement de fenêtre après coup ne sont jamais écrits.
   *
   * `usageCount` est RECOMPTÉ après coup plutôt qu'incrémenté : `upsert` ne
   * dit pas s'il a créé ou mis à jour la ligne, et un incrément aveugle
   * gonflerait le compteur à chaque republication. Même invariant que
   * `releaseUsages`/`reconcileUsageCounts` — un recomptage est rejouable.
   */
  private async recordUsage(ctx: CaptureContext, soundId: string, track: CaptureTrack): Promise<void> {
    const window = {
      startMs: track.startMs,
      endMs: track.endMs,
      windowAdjustedAt: track.windowAdjusted ? new Date() : null,
    };
    try {
      await this.prisma.soundUsage.upsert({
        where: { postId_trackId: { postId: ctx.postId, trackId: track.trackId } },
        create: { soundId, postId: ctx.postId, trackId: track.trackId, viaPostId: ctx.viaPostId, ...window },
        update: window,
      });
      await this.recountSound(soundId);
    } catch (error) {
      log.error('recordUsage a échoué', error instanceof Error ? error : new Error(String(error)),
        { postId: ctx.postId, trackId: track.trackId });
    }
  }
}
