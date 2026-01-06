#!/usr/bin/env python3
"""
Chatterbox Voice Translation Test
==================================
Complete voice cloning + translation pipeline using Chatterbox TTS.

Features:
- Record any voice (male, female, child, high/low pitch)
- Transcribe speech with Whisper
- Translate to multiple languages
- Clone voice speaking translation with Chatterbox
- Compare original vs cloned in each language

Chatterbox advantages over XTTS:
- Faster inference (real-time on CPU)
- Better voice similarity preservation
- Lighter weight model
- Apache 2.0 license

Usage:
    # Record and translate to French
    python chatterbox_voice_translation_test.py --record 10 --targets fr

    # Record and translate to multiple languages
    python chatterbox_voice_translation_test.py --record 10 --targets fr,es,de

    # Use existing audio file
    python chatterbox_voice_translation_test.py --input voice.wav --targets fr,es

    # Full test with all major languages
    python chatterbox_voice_translation_test.py --record 10 --targets fr,es,de,it,pt,zh,ja
"""

import os
import sys
import time
import json
import argparse
import subprocess
import numpy as np
import warnings
warnings.filterwarnings('ignore')

import torch
import torchaudio
import soundfile as sf
import sounddevice as sd
import librosa

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "chatterbox_translation_test")

# Supported languages (via translation - Chatterbox generates in English prosody)
SUPPORTED_LANGUAGES = {
    'en': 'English',
    'fr': 'French',
    'es': 'Spanish',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'pl': 'Polish',
    'tr': 'Turkish',
    'ru': 'Russian',
    'nl': 'Dutch',
    'cs': 'Czech',
    'ar': 'Arabic',
    'zh': 'Chinese',
    'ja': 'Japanese',
    'ko': 'Korean',
    'hu': 'Hungarian'
}


class VoiceAnalyzer:
    """
    Comprehensive voice analysis with speaker diarization.

    Extracts:
    - Recording metadata (sample rate, channels, duration, SNR, format)
    - Voice characteristics (pitch, formants, jitter, shimmer, HNR, MFCCs)
    - Speaker diarization (multiple speakers detection)
    - Main speaker identification for voice cloning
    """

    @staticmethod
    def get_recording_metadata(audio_path):
        """Extract recording technical metadata."""
        import wave
        import os

        metadata = {
            'file_path': audio_path,
            'file_name': os.path.basename(audio_path),
            'file_size_bytes': os.path.getsize(audio_path),
            'file_format': os.path.splitext(audio_path)[1].lower(),
        }

        # Load audio for analysis
        audio, sr = librosa.load(audio_path, sr=None)  # Native sample rate

        metadata.update({
            'sample_rate_hz': int(sr),
            'duration_seconds': float(len(audio) / sr),
            'total_samples': len(audio),
        })

        # Try to get bit depth from wave file
        try:
            if audio_path.endswith('.wav'):
                with wave.open(audio_path, 'rb') as wav:
                    metadata['channels'] = wav.getnchannels()
                    metadata['bit_depth'] = wav.getsampwidth() * 8
        except:
            metadata['channels'] = 1
            metadata['bit_depth'] = 16  # Default assumption

        # Calculate SNR (Signal-to-Noise Ratio)
        rms = np.sqrt(np.mean(audio**2))
        noise_floor = np.percentile(np.abs(audio), 5)  # Bottom 5% as noise
        if noise_floor > 0:
            snr_db = 20 * np.log10(rms / noise_floor)
        else:
            snr_db = 60  # Very clean signal

        metadata['snr_db'] = float(snr_db)
        metadata['rms_level'] = float(rms)
        metadata['noise_floor'] = float(noise_floor)
        metadata['peak_amplitude'] = float(np.max(np.abs(audio)))

        # Quality assessment
        if snr_db > 30:
            metadata['quality_rating'] = 'Excellent'
        elif snr_db > 20:
            metadata['quality_rating'] = 'Good'
        elif snr_db > 10:
            metadata['quality_rating'] = 'Fair'
        else:
            metadata['quality_rating'] = 'Poor'

        return metadata

    @staticmethod
    def analyze_voice_characteristics(audio_path, detailed=True):
        """
        Extract comprehensive voice characteristics.

        Returns:
            dict with pitch, formants, jitter, shimmer, HNR, MFCCs, speaking rate
        """
        audio, sr = librosa.load(audio_path, sr=22050)

        result = {}

        # ===== PITCH ANALYSIS =====
        f0, voiced, _ = librosa.pyin(audio, fmin=50, fmax=500, sr=sr)
        f0_valid = f0[~np.isnan(f0)]

        if len(f0_valid) > 0:
            result['pitch'] = {
                'mean_hz': float(np.mean(f0_valid)),
                'std_hz': float(np.std(f0_valid)),
                'min_hz': float(np.min(f0_valid)),
                'max_hz': float(np.max(f0_valid)),
                'range_hz': float(np.max(f0_valid) - np.min(f0_valid)),
                'median_hz': float(np.median(f0_valid)),
            }

            # Jitter (pitch perturbation) - voice quality measure
            if len(f0_valid) > 1:
                jitter = np.mean(np.abs(np.diff(f0_valid))) / np.mean(f0_valid) * 100
                result['pitch']['jitter_percent'] = float(jitter)
        else:
            result['pitch'] = {'mean_hz': 0, 'std_hz': 0, 'jitter_percent': 0}

        # Voice type classification
        pitch_mean = result['pitch']['mean_hz']
        if pitch_mean > 250:
            voice_type = "Very High (child)"
            voice_gender = "child"
        elif pitch_mean > 200:
            voice_type = "High (female soprano)"
            voice_gender = "female"
        elif pitch_mean > 165:
            voice_type = "Medium-High (female alto)"
            voice_gender = "female"
        elif pitch_mean > 140:
            voice_type = "Medium (male tenor)"
            voice_gender = "male"
        elif pitch_mean > 100:
            voice_type = "Medium-Low (male baritone)"
            voice_gender = "male"
        else:
            voice_type = "Low (male bass)"
            voice_gender = "male"

        result['voice_type'] = voice_type
        result['voice_gender'] = voice_gender

        # ===== SPECTRAL ANALYSIS =====
        # Spectral centroid (brightness/timbre)
        centroid = librosa.feature.spectral_centroid(y=audio, sr=sr)[0]
        result['spectral'] = {
            'centroid_mean_hz': float(np.mean(centroid)),
            'centroid_std_hz': float(np.std(centroid)),
        }

        # Spectral bandwidth
        bandwidth = librosa.feature.spectral_bandwidth(y=audio, sr=sr)[0]
        result['spectral']['bandwidth_mean_hz'] = float(np.mean(bandwidth))

        # Spectral rolloff
        rolloff = librosa.feature.spectral_rolloff(y=audio, sr=sr)[0]
        result['spectral']['rolloff_mean_hz'] = float(np.mean(rolloff))

        # Spectral flatness (tonal vs noisy)
        flatness = librosa.feature.spectral_flatness(y=audio)[0]
        result['spectral']['flatness'] = float(np.mean(flatness))

        if detailed:
            # ===== FORMANT ANALYSIS (approximation) =====
            # Use LPC for formant estimation
            try:
                # Pre-emphasis
                pre_emphasis = 0.97
                audio_preemph = np.append(audio[0], audio[1:] - pre_emphasis * audio[:-1])

                # LPC analysis
                from scipy.signal import lfilter
                lpc_order = int(2 + sr / 1000)

                # Windowed analysis
                frame_length = int(0.025 * sr)  # 25ms
                hop_length = int(0.010 * sr)    # 10ms

                formants_list = []
                for i in range(0, len(audio_preemph) - frame_length, hop_length):
                    frame = audio_preemph[i:i+frame_length] * np.hamming(frame_length)

                    # Autocorrelation for LPC
                    autocorr = np.correlate(frame, frame, mode='full')
                    autocorr = autocorr[len(autocorr)//2:]

                    # Levinson-Durbin for LPC coefficients
                    try:
                        from scipy.linalg import solve_toeplitz
                        r = autocorr[:lpc_order+1]
                        if r[0] != 0:
                            a = solve_toeplitz(r[:-1], r[1:])
                            # Find roots
                            roots = np.roots(np.concatenate([[1], -a]))
                            roots = roots[np.imag(roots) >= 0]
                            angles = np.arctan2(np.imag(roots), np.real(roots))
                            freqs = sorted(angles * (sr / (2 * np.pi)))
                            freqs = [f for f in freqs if 90 < f < 5000]
                            if len(freqs) >= 3:
                                formants_list.append(freqs[:4])
                    except:
                        pass

                if formants_list:
                    formants_arr = np.array(formants_list)
                    result['formants'] = {
                        'F1_hz': float(np.mean(formants_arr[:, 0])) if formants_arr.shape[1] > 0 else 0,
                        'F2_hz': float(np.mean(formants_arr[:, 1])) if formants_arr.shape[1] > 1 else 0,
                        'F3_hz': float(np.mean(formants_arr[:, 2])) if formants_arr.shape[1] > 2 else 0,
                    }
                else:
                    result['formants'] = {'F1_hz': 0, 'F2_hz': 0, 'F3_hz': 0}
            except Exception as e:
                result['formants'] = {'F1_hz': 0, 'F2_hz': 0, 'F3_hz': 0, 'error': str(e)}

            # ===== ENERGY ANALYSIS =====
            rms = librosa.feature.rms(y=audio)[0]
            result['energy'] = {
                'mean_db': float(20 * np.log10(np.mean(rms) + 1e-10)),
                'std_db': float(20 * np.log10(np.std(rms) + 1e-10)),
                'max_db': float(20 * np.log10(np.max(rms) + 1e-10)),
                'dynamic_range_db': float(20 * np.log10(np.max(rms) / (np.min(rms) + 1e-10))),
            }

            # Shimmer (amplitude perturbation)
            if len(rms) > 1:
                shimmer = np.mean(np.abs(np.diff(rms))) / np.mean(rms) * 100
                result['energy']['shimmer_percent'] = float(shimmer)

            # ===== MFCC (Voice Fingerprint) =====
            mfccs = librosa.feature.mfcc(y=audio, sr=sr, n_mfcc=13)
            result['mfcc'] = {
                'coefficients': [float(np.mean(mfccs[i])) for i in range(13)],
                'delta_energy': float(np.std(mfccs[0])),
            }

            # ===== SPEAKING RATE =====
            # Estimate syllables from energy peaks
            onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
            peaks = librosa.util.peak_pick(onset_env, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=0.5, wait=10)
            duration = len(audio) / sr

            result['speaking_rate'] = {
                'estimated_syllables': len(peaks),
                'syllables_per_second': float(len(peaks) / duration) if duration > 0 else 0,
                'words_per_minute_estimate': float(len(peaks) / duration * 60 / 1.5) if duration > 0 else 0,  # ~1.5 syllables/word
            }

            # ===== HARMONICS TO NOISE RATIO (HNR) =====
            try:
                # Simple HNR estimation
                autocorr = np.correlate(audio, audio, mode='full')
                autocorr = autocorr[len(autocorr)//2:]

                # Find first peak after zero (fundamental period)
                peak_idx = np.argmax(autocorr[int(sr/500):int(sr/50)]) + int(sr/500)

                if peak_idx > 0 and autocorr[0] > 0:
                    hnr = 10 * np.log10(autocorr[peak_idx] / (autocorr[0] - autocorr[peak_idx] + 1e-10))
                    result['hnr_db'] = float(np.clip(hnr, 0, 40))
                else:
                    result['hnr_db'] = 0
            except:
                result['hnr_db'] = 0

        result['duration_seconds'] = float(len(audio) / sr)

        return result

    @staticmethod
    def detect_speakers(audio_path, max_speakers=5):
        """
        Detect multiple speakers in audio using speaker diarization.

        Returns:
            dict with speaker count, segments, and main speaker
        """
        try:
            # Try to use pyannote for speaker diarization
            from pyannote.audio import Pipeline

            pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                use_auth_token=os.environ.get("HF_TOKEN")
            )

            diarization = pipeline(audio_path)

            speakers = {}
            for turn, _, speaker in diarization.itertracks(yield_label=True):
                if speaker not in speakers:
                    speakers[speaker] = {
                        'id': speaker,
                        'segments': [],
                        'total_duration': 0,
                    }
                speakers[speaker]['segments'].append({
                    'start': turn.start,
                    'end': turn.end,
                    'duration': turn.end - turn.start
                })
                speakers[speaker]['total_duration'] += turn.end - turn.start

            # Identify main speaker (most speaking time)
            main_speaker = max(speakers.values(), key=lambda x: x['total_duration']) if speakers else None

            return {
                'speaker_count': len(speakers),
                'speakers': list(speakers.values()),
                'main_speaker_id': main_speaker['id'] if main_speaker else None,
                'main_speaker_duration': main_speaker['total_duration'] if main_speaker else 0,
                'diarization_method': 'pyannote'
            }

        except ImportError:
            # Fallback: Simple energy-based segmentation
            return VoiceAnalyzer._simple_speaker_detection(audio_path)
        except Exception as e:
            print(f"    Speaker diarization error: {e}")
            return VoiceAnalyzer._simple_speaker_detection(audio_path)

    @staticmethod
    def _simple_speaker_detection(audio_path):
        """Simple speaker detection based on pitch clustering."""
        audio, sr = librosa.load(audio_path, sr=22050)

        # Split into 1-second segments
        segment_length = sr  # 1 second
        segments = []

        for i in range(0, len(audio) - segment_length, segment_length // 2):
            segment = audio[i:i + segment_length]

            # Get pitch for segment
            f0, voiced, _ = librosa.pyin(segment, fmin=50, fmax=500, sr=sr)
            f0_valid = f0[~np.isnan(f0)]

            if len(f0_valid) > 0:
                segments.append({
                    'start': i / sr,
                    'end': (i + segment_length) / sr,
                    'pitch_mean': float(np.mean(f0_valid)),
                    'energy': float(np.sqrt(np.mean(segment**2)))
                })

        if not segments:
            return {
                'speaker_count': 1,
                'speakers': [{'id': 'speaker_0', 'total_duration': len(audio) / sr, 'segments': []}],
                'main_speaker_id': 'speaker_0',
                'main_speaker_duration': len(audio) / sr,
                'diarization_method': 'simple'
            }

        # Cluster by pitch (simple k-means)
        pitches = np.array([s['pitch_mean'] for s in segments]).reshape(-1, 1)

        try:
            from sklearn.cluster import KMeans

            # Determine optimal clusters (silhouette score)
            best_k = 1
            best_score = -1

            for k in range(2, min(4, len(segments))):
                kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                labels = kmeans.fit_predict(pitches)

                from sklearn.metrics import silhouette_score
                if len(set(labels)) > 1:
                    score = silhouette_score(pitches, labels)
                    if score > best_score and score > 0.3:  # Minimum threshold
                        best_score = score
                        best_k = k

            if best_k > 1:
                kmeans = KMeans(n_clusters=best_k, random_state=42, n_init=10)
                labels = kmeans.fit_predict(pitches)
            else:
                labels = [0] * len(segments)

        except ImportError:
            # No sklearn, assume single speaker
            labels = [0] * len(segments)

        # Build speaker info
        speakers = {}
        for i, (seg, label) in enumerate(zip(segments, labels)):
            speaker_id = f'speaker_{label}'
            if speaker_id not in speakers:
                speakers[speaker_id] = {
                    'id': speaker_id,
                    'segments': [],
                    'total_duration': 0,
                    'pitch_mean': 0,
                    'pitch_samples': []
                }
            speakers[speaker_id]['segments'].append({
                'start': seg['start'],
                'end': seg['end'],
                'duration': seg['end'] - seg['start']
            })
            speakers[speaker_id]['total_duration'] += seg['end'] - seg['start']
            speakers[speaker_id]['pitch_samples'].append(seg['pitch_mean'])

        # Calculate average pitch per speaker
        for speaker in speakers.values():
            speaker['pitch_mean'] = float(np.mean(speaker['pitch_samples']))
            del speaker['pitch_samples']

        # Identify main speaker
        main_speaker = max(speakers.values(), key=lambda x: x['total_duration'])

        return {
            'speaker_count': len(speakers),
            'speakers': list(speakers.values()),
            'main_speaker_id': main_speaker['id'],
            'main_speaker_duration': main_speaker['total_duration'],
            'diarization_method': 'pitch_clustering'
        }

    @staticmethod
    def analyze(audio_path, include_speakers=True, detailed=True):
        """
        Complete voice analysis with all metadata.

        Args:
            audio_path: Path to audio file
            include_speakers: Whether to run speaker diarization
            detailed: Whether to include detailed analysis (formants, MFCC, etc.)

        Returns:
            dict with recording_metadata, voice_characteristics, speakers
        """
        result = {
            'recording_metadata': VoiceAnalyzer.get_recording_metadata(audio_path),
            'voice_characteristics': VoiceAnalyzer.analyze_voice_characteristics(audio_path, detailed=detailed),
        }

        if include_speakers:
            result['speakers'] = VoiceAnalyzer.detect_speakers(audio_path)

            # Analyze main speaker's voice characteristics
            if result['speakers']['speaker_count'] > 1:
                # Note: Would need to extract main speaker audio segments for detailed analysis
                result['main_speaker'] = {
                    'id': result['speakers']['main_speaker_id'],
                    'duration': result['speakers']['main_speaker_duration'],
                    'speaking_percentage': result['speakers']['main_speaker_duration'] / result['recording_metadata']['duration_seconds'] * 100
                }
            else:
                result['main_speaker'] = {
                    'id': 'speaker_0',
                    'duration': result['recording_metadata']['duration_seconds'],
                    'speaking_percentage': 100.0
                }

        # Legacy compatibility
        result['pitch_hz'] = result['voice_characteristics']['pitch']['mean_hz']
        result['pitch_std'] = result['voice_characteristics']['pitch']['std_hz']
        result['voice_type'] = result['voice_characteristics']['voice_type']
        result['brightness'] = result['voice_characteristics']['spectral']['centroid_mean_hz']
        result['duration'] = result['recording_metadata']['duration_seconds']

        return result

    @staticmethod
    def extract_main_speaker_audio(audio_path, output_path=None, min_segment_duration=0.5, crossfade_ms=50):
        """
        Extract only the main speaker's audio segments for clean voice cloning.

        This removes other speakers' voices and background noise between segments,
        producing a clean audio file with only the target speaker's voice.

        Args:
            audio_path: Path to input audio file
            output_path: Path for output file (default: adds '_main_speaker' suffix)
            min_segment_duration: Minimum segment duration to include (seconds)
            crossfade_ms: Crossfade duration between segments (milliseconds)

        Returns:
            dict with extracted audio path and metadata
        """
        # Detect speakers
        diarization = VoiceAnalyzer.detect_speakers(audio_path)

        if diarization['speaker_count'] <= 1:
            print("    Single speaker detected - no extraction needed")
            return {
                'output_path': audio_path,
                'is_extracted': False,
                'speaker_count': 1,
                'main_speaker_duration': diarization['main_speaker_duration'],
                'segments_count': 0
            }

        # Load original audio
        audio, sr = librosa.load(audio_path, sr=22050)

        # Get main speaker's segments
        main_speaker_id = diarization['main_speaker_id']
        main_speaker = next(
            (s for s in diarization['speakers'] if s['id'] == main_speaker_id),
            None
        )

        if not main_speaker or not main_speaker['segments']:
            print("    Warning: No segments found for main speaker")
            return {
                'output_path': audio_path,
                'is_extracted': False,
                'error': 'No segments found'
            }

        # Filter segments by minimum duration
        valid_segments = [
            seg for seg in main_speaker['segments']
            if seg['duration'] >= min_segment_duration
        ]

        if not valid_segments:
            print("    Warning: No valid segments after filtering")
            return {
                'output_path': audio_path,
                'is_extracted': False,
                'error': 'No valid segments'
            }

        # Sort segments by start time
        valid_segments = sorted(valid_segments, key=lambda x: x['start'])

        # Extract and concatenate segments
        extracted_segments = []
        crossfade_samples = int(crossfade_ms * sr / 1000)

        for seg in valid_segments:
            start_sample = int(seg['start'] * sr)
            end_sample = int(seg['end'] * sr)

            # Add small padding to avoid cutting speech
            padding = int(0.05 * sr)  # 50ms padding
            start_sample = max(0, start_sample - padding)
            end_sample = min(len(audio), end_sample + padding)

            segment_audio = audio[start_sample:end_sample]
            extracted_segments.append(segment_audio)

        # Concatenate with crossfade
        if len(extracted_segments) == 1:
            extracted_audio = extracted_segments[0]
        else:
            extracted_audio = VoiceAnalyzer._concatenate_with_crossfade(
                extracted_segments, crossfade_samples
            )

        # Apply noise reduction to extracted audio
        extracted_audio = VoiceAnalyzer._reduce_noise(extracted_audio, sr)

        # Generate output path
        if output_path is None:
            base, ext = os.path.splitext(audio_path)
            output_path = f"{base}_main_speaker{ext}"

        # Save extracted audio
        sf.write(output_path, extracted_audio, sr)

        # Analyze extracted audio
        extracted_duration = len(extracted_audio) / sr
        original_duration = len(audio) / sr

        print(f"    Extracted {len(valid_segments)} segments ({extracted_duration:.1f}s)")
        print(f"    Removed {original_duration - extracted_duration:.1f}s of other speakers/noise")

        return {
            'output_path': output_path,
            'is_extracted': True,
            'speaker_count': diarization['speaker_count'],
            'main_speaker_id': main_speaker_id,
            'original_duration': original_duration,
            'extracted_duration': extracted_duration,
            'segments_count': len(valid_segments),
            'segments': valid_segments,
            'removed_duration': original_duration - extracted_duration,
            'removal_percentage': (1 - extracted_duration / original_duration) * 100
        }

    @staticmethod
    def _concatenate_with_crossfade(segments, crossfade_samples):
        """Concatenate audio segments with smooth crossfade transitions."""
        if len(segments) == 0:
            return np.array([])
        if len(segments) == 1:
            return segments[0]

        # Calculate total length
        total_length = sum(len(seg) for seg in segments) - crossfade_samples * (len(segments) - 1)
        result = np.zeros(total_length)

        current_pos = 0
        for i, segment in enumerate(segments):
            if i == 0:
                # First segment - no fade in
                result[:len(segment)] = segment
                current_pos = len(segment)
            else:
                # Apply crossfade
                fade_start = current_pos - crossfade_samples

                # Fade out previous
                fade_out = np.linspace(1, 0, crossfade_samples)
                result[fade_start:current_pos] *= fade_out

                # Fade in current
                fade_in = np.linspace(0, 1, crossfade_samples)
                segment_start = segment[:crossfade_samples] * fade_in

                # Add crossfaded portion
                result[fade_start:current_pos] += segment_start

                # Add rest of segment
                remaining = segment[crossfade_samples:]
                result[current_pos:current_pos + len(remaining)] = remaining
                current_pos += len(remaining)

        return result[:current_pos]

    @staticmethod
    def _reduce_noise(audio, sr, noise_reduce_strength=0.5):
        """Apply basic noise reduction to audio."""
        try:
            import noisereduce as nr
            return nr.reduce_noise(
                y=audio,
                sr=sr,
                prop_decrease=noise_reduce_strength,
                stationary=False
            )
        except ImportError:
            # Fallback: simple spectral gating
            # High-pass filter to remove low-frequency rumble
            from scipy.signal import butter, filtfilt

            # High-pass at 80Hz
            nyq = sr / 2
            low_cut = 80 / nyq
            b, a = butter(4, low_cut, btype='high')
            audio = filtfilt(b, a, audio)

            # Normalize
            max_val = np.max(np.abs(audio))
            if max_val > 0:
                audio = audio / max_val * 0.95

            return audio

    @staticmethod
    def extract_speaker_audio(audio_path, speaker_id, output_path=None, diarization=None):
        """
        Extract a specific speaker's audio from multi-speaker recording.

        Args:
            audio_path: Path to input audio
            speaker_id: ID of speaker to extract (e.g., 'speaker_0')
            output_path: Output file path
            diarization: Pre-computed diarization (optional)

        Returns:
            Path to extracted audio file
        """
        if diarization is None:
            diarization = VoiceAnalyzer.detect_speakers(audio_path)

        speaker = next(
            (s for s in diarization['speakers'] if s['id'] == speaker_id),
            None
        )

        if not speaker:
            raise ValueError(f"Speaker '{speaker_id}' not found in audio")

        audio, sr = librosa.load(audio_path, sr=22050)

        # Extract segments
        segments = []
        for seg in speaker['segments']:
            start = int(seg['start'] * sr)
            end = int(seg['end'] * sr)
            segments.append(audio[start:end])

        # Concatenate
        extracted = VoiceAnalyzer._concatenate_with_crossfade(segments, int(0.05 * sr))

        # Output path
        if output_path is None:
            base, ext = os.path.splitext(audio_path)
            output_path = f"{base}_{speaker_id}{ext}"

        sf.write(output_path, extracted, sr)
        return output_path

    @staticmethod
    def analyze_all_speakers(audio_path):
        """
        Analyze voice characteristics for each detected speaker.

        Returns detailed voice profile for each speaker to help identify
        which voice to clone.
        """
        diarization = VoiceAnalyzer.detect_speakers(audio_path)
        audio, sr = librosa.load(audio_path, sr=22050)

        speakers_analysis = []

        for speaker in diarization['speakers']:
            # Extract speaker's segments temporarily
            segments = []
            for seg in speaker['segments']:
                start = int(seg['start'] * sr)
                end = int(seg['end'] * sr)
                if end > start:
                    segments.append(audio[start:end])

            if not segments:
                continue

            # Concatenate for analysis
            speaker_audio = np.concatenate(segments)

            # Save temp file for analysis
            temp_path = f"/tmp/speaker_{speaker['id']}_temp.wav"
            sf.write(temp_path, speaker_audio, sr)

            # Analyze
            try:
                analysis = VoiceAnalyzer.analyze_voice_characteristics(temp_path, detailed=True)
                analysis['speaker_id'] = speaker['id']
                analysis['total_duration'] = speaker['total_duration']
                analysis['segment_count'] = len(speaker['segments'])
                analysis['speaking_percentage'] = (
                    speaker['total_duration'] / (len(audio) / sr) * 100
                )
                speakers_analysis.append(analysis)
            except Exception as e:
                print(f"    Error analyzing {speaker['id']}: {e}")
            finally:
                # Cleanup
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        # Sort by speaking duration (main speaker first)
        speakers_analysis.sort(key=lambda x: x['total_duration'], reverse=True)

        return {
            'speaker_count': diarization['speaker_count'],
            'main_speaker_id': diarization['main_speaker_id'],
            'speakers': speakers_analysis,
            'diarization_method': diarization['diarization_method']
        }

    @staticmethod
    def compare(original_path, cloned_path):
        """Compare original and cloned voice with detailed metrics."""
        orig = VoiceAnalyzer.analyze(original_path, include_speakers=False, detailed=True)
        clone = VoiceAnalyzer.analyze(cloned_path, include_speakers=False, detailed=True)

        orig_char = orig['voice_characteristics']
        clone_char = clone['voice_characteristics']

        # Pitch similarity
        if orig_char['pitch']['mean_hz'] > 0 and clone_char['pitch']['mean_hz'] > 0:
            pitch_diff = abs(orig_char['pitch']['mean_hz'] - clone_char['pitch']['mean_hz'])
            pitch_sim = max(0, 1 - pitch_diff / orig_char['pitch']['mean_hz'])
        else:
            pitch_sim = 0

        # Brightness/Timbre similarity
        bright_diff = abs(orig_char['spectral']['centroid_mean_hz'] - clone_char['spectral']['centroid_mean_hz'])
        bright_sim = max(0, 1 - bright_diff / max(orig_char['spectral']['centroid_mean_hz'], 1))

        # MFCC similarity (cosine similarity)
        if 'mfcc' in orig_char and 'mfcc' in clone_char:
            orig_mfcc = np.array(orig_char['mfcc']['coefficients'])
            clone_mfcc = np.array(clone_char['mfcc']['coefficients'])
            mfcc_sim = float(np.dot(orig_mfcc, clone_mfcc) / (np.linalg.norm(orig_mfcc) * np.linalg.norm(clone_mfcc) + 1e-10))
            mfcc_sim = (mfcc_sim + 1) / 2  # Normalize to 0-1
        else:
            mfcc_sim = 0.5

        # Overall weighted score
        overall = (pitch_sim * 0.3 + bright_sim * 0.3 + mfcc_sim * 0.4)

        return {
            'pitch_similarity': pitch_sim,
            'brightness_similarity': bright_sim,
            'mfcc_similarity': mfcc_sim,
            'overall': overall,
            'original': orig,
            'cloned': clone
        }


class ChatterboxVoiceCloner:
    """Chatterbox Multilingual voice cloning engine - supports 23 languages."""

    # Supported languages by Chatterbox Multilingual
    MULTILINGUAL_LANGUAGES = {
        'ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi',
        'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv',
        'sw', 'tr', 'zh'
    }

    def __init__(self):
        self.model = None
        self.model_multilingual = None
        self.loaded = False
        self.loaded_multilingual = False
        self.device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"

    def load(self, multilingual=False):
        """Load Chatterbox model."""
        if multilingual:
            if self.loaded_multilingual:
                return
            print(f"\n  Loading Chatterbox Multilingual on {self.device}...")

            # Monkey patch torch.load to handle CUDA -> CPU/MPS mapping
            import torch
            original_torch_load = torch.load
            def patched_torch_load(*args, **kwargs):
                if 'map_location' not in kwargs:
                    kwargs['map_location'] = self.device
                # Also handle weights_only issue
                if 'weights_only' not in kwargs:
                    kwargs['weights_only'] = False
                return original_torch_load(*args, **kwargs)
            torch.load = patched_torch_load

            try:
                from chatterbox.mtl_tts import ChatterboxMultilingualTTS
                self.model_multilingual = ChatterboxMultilingualTTS.from_pretrained(device=self.device)
                self.loaded_multilingual = True
                print("  Multilingual model loaded! (23 languages supported)")
            finally:
                # Restore original torch.load
                torch.load = original_torch_load
        else:
            if self.loaded:
                return
            print(f"\n  Loading Chatterbox model on {self.device}...")
            from chatterbox.tts import ChatterboxTTS
            self.model = ChatterboxTTS.from_pretrained(device=self.device)
            self.loaded = True
            print("  Model loaded!")

    def clone(self, reference_path, text, output_path, language='en', exaggeration=0.5, cfg_weight=0.5):
        """
        Clone voice speaking text.

        Args:
            reference_path: Path to reference voice audio
            text: Text to synthesize
            output_path: Output wav file path
            language: Target language code (ar, zh, fr, etc.)
            exaggeration: Voice characteristic exaggeration (0-1, default 0.5)
            cfg_weight: Classifier-free guidance weight (0-1, default 0.5)
        """
        # Use multilingual model for non-English or explicitly supported languages
        use_multilingual = language != 'en' or language in self.MULTILINGUAL_LANGUAGES

        if use_multilingual and language in self.MULTILINGUAL_LANGUAGES:
            self.load(multilingual=True)
            # For cross-language cloning, set cfg_weight=0 to reduce accent transfer
            effective_cfg = 0.0 if language != 'en' else cfg_weight

            wav = self.model_multilingual.generate(
                text=text,
                audio_prompt_path=reference_path,
                language_id=language,
                exaggeration=exaggeration,
                cfg_weight=effective_cfg
            )
            torchaudio.save(output_path, wav, self.model_multilingual.sr)
        else:
            self.load(multilingual=False)
            wav = self.model.generate(
                text=text,
                audio_prompt_path=reference_path,
                exaggeration=exaggeration,
                cfg_weight=cfg_weight
            )
            torchaudio.save(output_path, wav, self.model.sr)

        return output_path

    def clone_with_emotion(self, reference_path, text, output_path, language='en',
                           exaggeration=0.7, cfg_weight=0.3):
        """Clone with more expressive/emotional output."""
        return self.clone(
            reference_path, text, output_path,
            language=language,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight
        )

    def clone_neutral(self, reference_path, text, output_path, language='en'):
        """Clone with neutral/stable output."""
        return self.clone(
            reference_path, text, output_path,
            language=language,
            exaggeration=0.3,
            cfg_weight=0.7
        )


def record_voice(duration=10, sample_rate=22050):
    """Record voice from microphone."""
    print(f"\n  Recording {duration} seconds...")
    print("  Speak clearly in your natural voice!\n")

    for i in range(3, 0, -1):
        print(f"    {i}...")
        time.sleep(1)

    print("    >>> RECORDING <<<")

    audio = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='float32')
    sd.wait()

    print("    Done!\n")

    audio = audio.flatten()
    audio = audio / (np.abs(audio).max() + 1e-6) * 0.95

    return audio


def transcribe(audio_path, language=None, force_language=None):
    """Transcribe audio with Whisper."""
    import whisper

    print("  Transcribing with Whisper...")
    model = whisper.load_model('base')

    opts = {}
    if force_language:
        opts['language'] = force_language
    elif language:
        opts['language'] = language

    result = model.transcribe(audio_path, **opts)

    detected_lang = force_language or result.get('language', 'en')
    text = result['text'].strip()

    print(f"    Detected language: {detected_lang}")
    print(f"    Text: \"{text}\"")

    return {
        'text': text,
        'language': detected_lang
    }


def translate(text, source_lang, target_lang):
    """Translate text to target language."""
    if source_lang == target_lang:
        return text

    try:
        from deep_translator import GoogleTranslator
        translated = GoogleTranslator(source=source_lang, target=target_lang).translate(text)
        return translated
    except Exception as e:
        print(f"    Translation error: {e}")
        return text


def play_audio(path, label=""):
    """Play audio file."""
    if label:
        print(f"  Playing: {label}")
    subprocess.run(['afplay', path], check=True)


def run_translation_test(reference_path, target_languages, output_dir,
                         source_lang=None, provided_text=None,
                         exaggeration=0.5, cfg_weight=0.5):
    """Run full voice translation test."""

    os.makedirs(output_dir, exist_ok=True)

    # Initialize cloner
    cloner = ChatterboxVoiceCloner()

    # Analyze original voice
    print("\n" + "="*60)
    print("  ANALYZING YOUR VOICE")
    print("="*60)

    voice_info = VoiceAnalyzer.analyze(reference_path)
    print(f"""
    Pitch: {voice_info['pitch_hz']:.1f} Hz (+/- {voice_info['pitch_std']:.1f})
    Type: {voice_info['voice_type']}
    Brightness: {voice_info['brightness']:.1f} Hz
    Duration: {voice_info['duration']:.2f}s
    """)

    # Get text - either provided or transcribed
    if provided_text:
        print("="*60)
        print("  USING PROVIDED TEXT")
        print("="*60)
        original_text = provided_text
        source_lang = source_lang or 'en'
        print(f"    Text: \"{original_text}\"")
        print(f"    Language: {source_lang}")
    else:
        # Transcribe original
        print("="*60)
        print("  TRANSCRIBING YOUR SPEECH")
        print("="*60)

        transcription = transcribe(reference_path, force_language=source_lang)
        original_text = transcription['text']
        source_lang = source_lang or transcription['language']

    if not original_text:
        print("  ERROR: No speech detected!")
        return None

    # Results storage
    results = {
        'reference': {
            'path': reference_path,
            'text': original_text,
            'language': source_lang,
            'voice': voice_info
        },
        'translations': {},
        'settings': {
            'exaggeration': exaggeration,
            'cfg_weight': cfg_weight
        }
    }

    # Process each target language
    for target_lang in target_languages:
        if target_lang not in SUPPORTED_LANGUAGES:
            print(f"\n  WARNING: {target_lang} not supported, skipping")
            continue

        lang_name = SUPPORTED_LANGUAGES[target_lang]

        print("\n" + "="*60)
        print(f"  TRANSLATING TO {lang_name.upper()} ({target_lang})")
        print("="*60)

        # Translate text
        translated_text = translate(original_text, source_lang, target_lang)
        print(f"\n    Original ({source_lang}): \"{original_text}\"")
        print(f"    Translated ({target_lang}): \"{translated_text}\"")

        # Clone voice speaking translation
        print(f"\n  Cloning your voice in {lang_name}...")
        print(f"    (exaggeration={exaggeration}, cfg_weight={cfg_weight})")

        output_path = os.path.join(output_dir, f"cloned_{target_lang}.wav")

        start_time = time.time()
        cloner.clone(
            reference_path,
            translated_text,
            output_path,
            language=target_lang,
            exaggeration=exaggeration,
            cfg_weight=cfg_weight
        )
        clone_time = time.time() - start_time

        print(f"    Done in {clone_time:.2f}s")

        # Analyze cloned voice
        comparison = VoiceAnalyzer.compare(reference_path, output_path)

        print(f"""
    Voice Similarity:
      Pitch: {comparison['pitch_similarity']*100:.1f}%
      Timbre: {comparison['brightness_similarity']*100:.1f}%
      Overall: {comparison['overall']*100:.1f}%
        """)

        # Verify transcription of cloned audio
        print("  Verifying cloned audio...")
        cloned_transcription = transcribe(output_path, target_lang)

        results['translations'][target_lang] = {
            'language_name': lang_name,
            'translated_text': translated_text,
            'cloned_path': output_path,
            'clone_time': clone_time,
            'similarity': comparison,
            'verification': cloned_transcription['text']
        }

    return results


def print_summary(results, output_dir):
    """Print test summary."""

    print("\n" + "#"*60)
    print("#  CHATTERBOX VOICE TRANSLATION TEST SUMMARY")
    print("#"*60)

    ref = results['reference']
    settings = results.get('settings', {})

    print(f"""
  YOUR VOICE:
    Type: {ref['voice']['voice_type']}
    Pitch: {ref['voice']['pitch_hz']:.1f} Hz
    Original text ({ref['language']}): "{ref['text']}"

  SETTINGS:
    Exaggeration: {settings.get('exaggeration', 0.5)}
    CFG Weight: {settings.get('cfg_weight', 0.5)}
    """)

    print("  TRANSLATION RESULTS:")
    print("  " + "-"*56)

    for lang, data in results['translations'].items():
        sim = data['similarity']['overall'] * 100
        text_preview = data['translated_text'][:50] + "..." if len(data['translated_text']) > 50 else data['translated_text']
        verify_preview = data['verification'][:50] + "..." if len(data['verification']) > 50 else data['verification']
        print(f"""
    [{lang.upper()}] {data['language_name']}:
      Text: "{text_preview}"
      Similarity: {sim:.1f}%
      Time: {data['clone_time']:.2f}s
      Verified: "{verify_preview}"
        """)

    print("\n  OUTPUT FILES:")
    print(f"    Reference: {ref['path']}")
    for lang, data in results['translations'].items():
        print(f"    {lang.upper()}: {data['cloned_path']}")

    # Save results JSON
    results_path = os.path.join(output_dir, "results.json")

    # Convert for JSON serialization
    json_results = {
        'reference': {
            'path': ref['path'],
            'text': ref['text'],
            'language': ref['language'],
            'pitch_hz': ref['voice']['pitch_hz'],
            'voice_type': ref['voice']['voice_type']
        },
        'settings': settings,
        'translations': {}
    }

    for lang, data in results['translations'].items():
        json_results['translations'][lang] = {
            'text': data['translated_text'],
            'path': data['cloned_path'],
            'similarity': data['similarity']['overall'],
            'verification': data['verification']
        }

    with open(results_path, 'w') as f:
        json.dump(json_results, f, indent=2, ensure_ascii=False)

    print(f"\n    Results JSON: {results_path}")


def playback_comparison(results):
    """Play back original and all translations."""

    print("\n" + "#"*60)
    print("#  PLAYBACK COMPARISON")
    print("#"*60)

    ref = results['reference']

    print("\n  [ORIGINAL] Your voice:")
    time.sleep(0.5)
    play_audio(ref['path'])

    for lang, data in results['translations'].items():
        time.sleep(1)
        print(f"\n  [{lang.upper()}] {data['language_name']} - {data['similarity']['overall']*100:.1f}% similarity:")
        text_preview = data['translated_text'][:60] + "..." if len(data['translated_text']) > 60 else data['translated_text']
        print(f"      \"{text_preview}\"")
        time.sleep(0.5)
        play_audio(data['cloned_path'])

    print("\n  Playback complete!")


def main():
    parser = argparse.ArgumentParser(
        description="Chatterbox Voice Translation Test",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Record 10 seconds, translate to French
  python chatterbox_voice_translation_test.py --record 10 --targets fr

  # Record and translate to multiple languages
  python chatterbox_voice_translation_test.py --record 10 --targets fr,es,de,it

  # Use existing audio, translate to all major languages
  python chatterbox_voice_translation_test.py --input voice.wav --targets fr,es,de,it,pt,zh,ja

  # Adjust voice cloning parameters
  python chatterbox_voice_translation_test.py --record 10 --targets fr --exaggeration 0.7 --cfg 0.3

Chatterbox Parameters:
  --exaggeration: Voice characteristic exaggeration (0-1)
                  Higher = more expressive, Lower = more neutral
  --cfg:          Classifier-free guidance weight (0-1)
                  Higher = more faithful to prompt, Lower = more creative

Supported languages: """ + ", ".join(SUPPORTED_LANGUAGES.keys())
    )

    parser.add_argument('--record', '-r', type=float, default=0,
                        help='Record N seconds of voice')
    parser.add_argument('--input', '-i', type=str,
                        help='Use existing audio file')
    parser.add_argument('--targets', '-t', type=str, default='fr',
                        help='Target languages (comma-separated, e.g., fr,es,de)')
    parser.add_argument('--source-lang', '-s', type=str, default=None,
                        help='Force source language (en, fr, es, etc.)')
    parser.add_argument('--text', type=str, default=None,
                        help='Provide text directly (skip transcription)')
    parser.add_argument('--exaggeration', '-e', type=float, default=0.5,
                        help='Voice exaggeration (0-1, default 0.5)')
    parser.add_argument('--cfg', '-c', type=float, default=0.5,
                        help='CFG weight (0-1, default 0.5)')
    parser.add_argument('--play', '-p', action='store_true', default=True,
                        help='Play results after test')
    parser.add_argument('--no-play', dest='play', action='store_false',
                        help='Skip playback')

    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("\n" + "#"*60)
    print("#  CHATTERBOX VOICE TRANSLATION TEST")
    print("#  Fast, high-quality voice cloning!")
    print("#"*60)

    # Get reference audio
    if args.input:
        reference_path = args.input
        print(f"\n  Using input file: {reference_path}")
    elif args.record > 0:
        print("\n" + "="*60)
        print("  RECORDING YOUR VOICE")
        print("="*60)

        audio = record_voice(args.record)
        reference_path = os.path.join(OUTPUT_DIR, "original_voice.wav")
        sf.write(reference_path, audio, 22050)
        print(f"  Saved: {reference_path}")
    else:
        # Check for existing recording
        default_ref = os.path.join(OUTPUT_DIR, "original_voice.wav")
        if os.path.exists(default_ref):
            reference_path = default_ref
            print(f"\n  Using existing recording: {reference_path}")
        else:
            print("\n  ERROR: Provide --input or --record")
            print("  Example: python chatterbox_voice_translation_test.py --record 10 --targets fr,es")
            return

    # Parse target languages
    target_languages = [l.strip() for l in args.targets.split(',')]
    print(f"\n  Target languages: {', '.join(target_languages)}")
    print(f"  Exaggeration: {args.exaggeration}")
    print(f"  CFG weight: {args.cfg}")

    # Run test
    results = run_translation_test(
        reference_path, target_languages, OUTPUT_DIR,
        source_lang=args.source_lang,
        provided_text=args.text,
        exaggeration=args.exaggeration,
        cfg_weight=args.cfg
    )

    if results:
        # Print summary
        print_summary(results, OUTPUT_DIR)

        # Playback
        if args.play:
            playback_comparison(results)

    print("\n" + "="*60)
    print("  TEST COMPLETE!")
    print("="*60)
    print(f"\n  Output directory: {OUTPUT_DIR}")
    print("\n  To replay any file:")
    print(f"    afplay {OUTPUT_DIR}/original_voice.wav")
    for lang in target_languages:
        if lang in SUPPORTED_LANGUAGES:
            print(f"    afplay {OUTPUT_DIR}/cloned_{lang}.wav")


if __name__ == "__main__":
    main()
