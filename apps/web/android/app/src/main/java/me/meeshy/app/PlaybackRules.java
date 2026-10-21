package me.meeshy.app;

import android.media.session.PlaybackState;
import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Ce que dit et ce que permet la carte de lecture de la coque (#10624) —
 * miroir de la carte Now Playing d'iOS
 * (`ConversationAudioCoordinator+NowPlaying.swift`) :
 *
 * - titre « {conversation} — {date courte} », artiste l'auteur, album la
 *   conversation ; hors conversation (un post, une story), l'auteur seul ;
 * - un vocal PROTEGE ne dit que son auteur et « Message protege », comme la
 *   Live Activity iOS (`VoicePlaybackActivityLaw`) ;
 * - la position est EXTRAPOLEE depuis le dernier etat que la page a remis
 *   (position, vitesse, horodatage) : la page ne remet rien a chaque tic ;
 * - suivant / precedent n'existent que si la page declare une file.
 *
 * Logique pure, testee en JVM ({@code PlaybackRulesTest}) ;
 * {@link PlaybackForegroundService} n'en fait que l'execution.
 */
final class PlaybackRules {

    static final long SKIP_MS = 15_000L;
    static final String ACTION_BACK = "me.meeshy.app.playback.BACK15";
    static final String ACTION_FORWARD = "me.meeshy.app.playback.FORWARD15";

    private static final float BADGE_FRACTION = 0.26f;
    private static final float BADGE_PADDING_FRACTION = 0.04f;

    private PlaybackRules() {}

    static final class Labels {
        final String title;
        final String artist;
        final String album;

        Labels(String title, String artist, String album) {
            this.title = title;
            this.artist = artist;
            this.album = album;
        }
    }

    private static String present(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    static Labels labels(
        String sender,
        String conversation,
        Long sentAtMs,
        boolean protectedTrack,
        String voiceMessage,
        String protectedMessage,
        Locale locale,
        TimeZone zone
    ) {
        String author = present(sender);
        String named = author != null ? author : voiceMessage;
        if (protectedTrack) return new Labels(named, protectedMessage, null);
        String place = present(conversation);
        if (place == null) return new Labels(named, null, null);
        if (sentAtMs == null) return new Labels(place, author, place);
        DateFormat format = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, locale);
        format.setTimeZone(zone);
        return new Labels(place + " — " + format.format(new Date(sentAtMs)), author, place);
    }

    static long actions(boolean playing, long durationMs, boolean canNext, boolean canPrevious) {
        long actions = PlaybackState.ACTION_PLAY_PAUSE | (playing ? PlaybackState.ACTION_PAUSE : PlaybackState.ACTION_PLAY);
        if (durationMs > 0) actions |= PlaybackState.ACTION_SEEK_TO;
        if (canNext) actions |= PlaybackState.ACTION_SKIP_TO_NEXT;
        if (canPrevious) actions |= PlaybackState.ACTION_SKIP_TO_PREVIOUS;
        return actions;
    }

    /** Ou la lecture en est a {@code nowElapsed}, d'apres le dernier etat remis a {@code anchorElapsed}. */
    static long projected(long positionMs, float rate, long anchorElapsed, long nowElapsed, long durationMs, boolean playing) {
        if (!playing) return clamp(positionMs, durationMs);
        long elapsed = Math.max(0, nowElapsed - anchorElapsed);
        return clamp(positionMs + (long) (elapsed * rate), durationMs);
    }

    static long skip(long positionMs, long offsetMs, long durationMs) {
        return clamp(positionMs + offsetMs, durationMs);
    }

    /** Une duree inconnue ({@code 0}) ne borne que par le bas. */
    static long clamp(long positionMs, long durationMs) {
        long floor = Math.max(0, positionMs);
        return durationMs > 0 ? Math.min(floor, durationMs) : floor;
    }

    /** Le badge de l'app, en bas a gauche de l'image : {@code [gauche, haut, droite, bas]}. */
    static int[] badge(int side) {
        int size = Math.round(side * BADGE_FRACTION);
        int padding = Math.round(side * BADGE_PADDING_FRACTION);
        return new int[] { padding, side - padding - size, padding + size, side - padding };
    }

    /** Un nombre remis par la page : JSON le livre en Integer, Long ou Double selon sa valeur. */
    static long millis(Object value, long fallback) {
        return value instanceof Number ? Math.round(((Number) value).doubleValue()) : fallback;
    }

    static float rate(Object value) {
        if (!(value instanceof Number)) return 1f;
        float rate = ((Number) value).floatValue();
        return rate > 0 ? rate : 1f;
    }

    /** Le vocal que la page decrit, et l'instant ({@code anchor}, horloge monotone) ou elle l'a decrit. */
    static final class Track {
        final String key;
        final String sender;
        final String conversation;
        final Long sentAtMs;
        final String artworkUrl;
        final boolean protectedTrack;
        final long durationMs;
        final long positionMs;
        final float rate;
        final boolean playing;
        /** En lecture, mais la page attend le reseau : la barre ne court pas devant le son. */
        final boolean buffering;
        final boolean canNext;
        final boolean canPrevious;
        final long anchor;

        Track(
            String key,
            String sender,
            String conversation,
            Long sentAtMs,
            String artworkUrl,
            boolean protectedTrack,
            long durationMs,
            long positionMs,
            float rate,
            boolean playing,
            boolean buffering,
            boolean canNext,
            boolean canPrevious,
            long anchor
        ) {
            this.key = key;
            this.sender = sender;
            this.conversation = conversation;
            this.sentAtMs = sentAtMs;
            this.artworkUrl = artworkUrl;
            this.protectedTrack = protectedTrack;
            this.durationMs = durationMs;
            this.positionMs = positionMs;
            this.rate = rate;
            this.playing = playing;
            this.buffering = buffering;
            this.canNext = canNext;
            this.canPrevious = canPrevious;
            this.anchor = anchor;
        }

        long position(long now) {
            return projected(positionMs, rate, anchor, now, durationMs, playing && !buffering);
        }

        /** Le meme vocal, fige a {@code now} et passe en lecture ou en pause. */
        Track at(long now, boolean nowPlaying) {
            return with(position(now), nowPlaying, now);
        }

        Track seek(long target, long now) {
            return with(clamp(target, durationMs), playing, now);
        }

        private Track with(long position, boolean nowPlaying, long now) {
            return new Track(key, sender, conversation, sentAtMs, artworkUrl, protectedTrack, durationMs, position, rate, nowPlaying, buffering && nowPlaying, canNext, canPrevious, now);
        }
    }
}
