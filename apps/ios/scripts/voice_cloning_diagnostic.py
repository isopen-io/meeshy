#!/usr/bin/env python3
"""
Voice Cloning Diagnostic Tool
=============================
Detailed logging of spectrogram, embeddings, and conversion process.
"""

import torch
import torch.nn.functional as F
import numpy as np
import os
import sys
import librosa
import soundfile as sf
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt

OPENVOICE_PATH = os.path.expanduser("~/OpenVoice")
sys.path.insert(0, OPENVOICE_PATH)

from openvoice.api import ToneColorConverter


def log_array_stats(name, arr, indent=0):
    """Log detailed statistics of a numpy array or tensor."""
    prefix = "   " * indent

    if isinstance(arr, torch.Tensor):
        arr = arr.detach().cpu().numpy()

    print("{}[{}]".format(prefix, name))
    print("{}  Shape: {}".format(prefix, arr.shape))
    print("{}  Dtype: {}".format(prefix, arr.dtype))
    print("{}  Min: {:.6f}".format(prefix, arr.min()))
    print("{}  Max: {:.6f}".format(prefix, arr.max()))
    print("{}  Mean: {:.6f}".format(prefix, arr.mean()))
    print("{}  Std: {:.6f}".format(prefix, arr.std()))
    print("{}  Norm (L2): {:.6f}".format(prefix, np.linalg.norm(arr.flatten())))

    # Check for NaN/Inf
    nan_count = np.isnan(arr).sum()
    inf_count = np.isinf(arr).sum()
    if nan_count > 0 or inf_count > 0:
        print("{}  WARNING: NaN={}, Inf={}".format(prefix, nan_count, inf_count))

    # Percentiles
    p = np.percentile(arr.flatten(), [1, 25, 50, 75, 99])
    print("{}  Percentiles [1,25,50,75,99]: [{:.4f}, {:.4f}, {:.4f}, {:.4f}, {:.4f}]".format(
        prefix, p[0], p[1], p[2], p[3], p[4]))

    # Zero ratio
    zero_ratio = (np.abs(arr) < 1e-6).sum() / arr.size
    print("{}  Zero ratio: {:.2%}".format(prefix, zero_ratio))


def plot_spectrogram(spec, title, output_path, sr=22050, hop_length=256):
    """Save spectrogram visualization."""
    plt.figure(figsize=(12, 4))

    if isinstance(spec, torch.Tensor):
        spec = spec.detach().cpu().numpy()

    if len(spec.shape) == 3:
        spec = spec.squeeze(0)

    librosa.display.specshow(
        librosa.amplitude_to_db(spec, ref=np.max),
        y_axis='hz', x_axis='time',
        sr=sr, hop_length=hop_length
    )
    plt.colorbar(format='%+2.0f dB')
    plt.title(title)
    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print("   Saved: {}".format(output_path))


def plot_embedding(emb, title, output_path):
    """Visualize speaker embedding."""
    plt.figure(figsize=(10, 3))

    if isinstance(emb, torch.Tensor):
        emb = emb.detach().cpu().numpy()

    emb = emb.flatten()

    plt.subplot(1, 2, 1)
    plt.bar(range(len(emb)), emb)
    plt.title("{} - Values".format(title))
    plt.xlabel("Dimension")
    plt.ylabel("Value")

    plt.subplot(1, 2, 2)
    plt.hist(emb, bins=50)
    plt.title("{} - Distribution".format(title))
    plt.xlabel("Value")
    plt.ylabel("Count")

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    plt.close()
    print("   Saved: {}".format(output_path))


def compute_spectrogram(audio, sr=22050, n_fft=1024, hop_length=256):
    """Compute STFT spectrogram matching OpenVoice."""
    stft = librosa.stft(audio, n_fft=n_fft, hop_length=hop_length,
                        win_length=n_fft, center=True, pad_mode='reflect')
    spec = np.abs(stft)
    return spec


def extract_embedding_with_logging(audio, converter, name="audio"):
    """Extract speaker embedding with detailed logging."""
    print("\n" + "=" * 60)
    print("EMBEDDING EXTRACTION: {}".format(name))
    print("=" * 60)

    # Audio stats
    print("\n[1] Audio Input")
    log_array_stats("audio", audio, indent=1)

    # Compute spectrogram
    print("\n[2] Spectrogram Computation")
    spec = compute_spectrogram(audio)
    log_array_stats("spectrogram", spec, indent=1)

    # Convert to tensor
    spec_tensor = torch.FloatTensor(spec).unsqueeze(0)
    print("   Tensor shape: {}".format(spec_tensor.shape))

    # Get model
    model = converter.model

    # Run encoder
    print("\n[3] Encoder Output")
    with torch.no_grad():
        spec_len = torch.LongTensor([spec_tensor.shape[2]])
        g = torch.zeros(1, 256, 1)

        z, m, logs, y_mask = model.enc_q(spec_tensor, spec_len, g=g, tau=0.0)

        log_array_stats("z (latent)", z, indent=1)
        log_array_stats("m (mean)", m, indent=1)
        log_array_stats("logs (log variance)", logs, indent=1)

    # Compute embedding
    print("\n[4] Speaker Embedding")
    embedding = m.mean(dim=2, keepdim=True)

    if embedding.shape[1] != 256:
        print("   Projecting from {} to 256 dims...".format(embedding.shape[1]))
        embedding = F.adaptive_avg_pool1d(embedding.transpose(1, 2), 256).transpose(1, 2)

    # Normalize
    norm_before = torch.norm(embedding)
    embedding = embedding / (norm_before + 1e-6) * 16.0

    log_array_stats("embedding (normalized)", embedding, indent=1)
    print("   Norm before: {:.4f}".format(norm_before))
    print("   Norm after: {:.4f}".format(torch.norm(embedding)))

    return embedding, spec


def run_diagnostic(reference_path, source_path, output_dir):
    """Run full diagnostic on voice cloning pipeline."""

    os.makedirs(output_dir, exist_ok=True)

    print("\n" + "#" * 70)
    print("#  VOICE CLONING DIAGNOSTIC")
    print("#" * 70)

    # Load converter
    print("\n[LOADING CONVERTER]")
    ckpt_dir = os.path.join(OPENVOICE_PATH, "checkpoints_v2/converter")
    converter = ToneColorConverter(os.path.join(ckpt_dir, "config.json"), device="cpu")
    converter.load_ckpt(os.path.join(ckpt_dir, "checkpoint.pth"))

    # Model info
    print("\n[MODEL CONFIGURATION]")
    hps = converter.hps
    print("   zero_g: {}".format(hps.model.zero_g))
    print("   hidden_channels: {}".format(hps.model.hidden_channels))
    print("   inter_channels: {}".format(hps.model.inter_channels))
    print("   gin_channels: {}".format(hps.model.gin_channels))
    print("   sampling_rate: {}".format(hps.data.sampling_rate))
    print("   filter_length: {}".format(hps.data.filter_length))
    print("   hop_length: {}".format(hps.data.hop_length))

    # Load audio files
    print("\n[LOADING AUDIO]")
    ref_audio, sr = librosa.load(reference_path, sr=22050)
    src_audio, _ = librosa.load(source_path, sr=22050)

    print("   Reference: {} ({:.2f}s)".format(reference_path, len(ref_audio)/sr))
    print("   Source: {} ({:.2f}s)".format(source_path, len(src_audio)/sr))

    # Extract embeddings with logging
    target_emb, target_spec = extract_embedding_with_logging(ref_audio, converter, "YOUR VOICE (target)")
    source_emb, source_spec = extract_embedding_with_logging(src_audio, converter, "TTS (source)")

    # Save spectrograms
    print("\n[SAVING VISUALIZATIONS]")
    plot_spectrogram(target_spec, "Your Voice Spectrogram",
                     os.path.join(output_dir, "1_target_spectrogram.png"))
    plot_spectrogram(source_spec, "TTS Source Spectrogram",
                     os.path.join(output_dir, "2_source_spectrogram.png"))
    plot_embedding(target_emb, "Your Voice Embedding",
                   os.path.join(output_dir, "3_target_embedding.png"))
    plot_embedding(source_emb, "TTS Embedding",
                   os.path.join(output_dir, "4_source_embedding.png"))

    # Compare embeddings
    print("\n" + "=" * 60)
    print("EMBEDDING COMPARISON")
    print("=" * 60)

    cos_sim = F.cosine_similarity(
        target_emb.flatten().unsqueeze(0),
        source_emb.flatten().unsqueeze(0)
    ).item()

    l2_dist = torch.norm(target_emb - source_emb).item()

    print("   Cosine Similarity: {:.4f}".format(cos_sim))
    print("   L2 Distance: {:.4f}".format(l2_dist))
    print("   Interpretation:")
    if cos_sim > 0.9:
        print("      Very similar voices (may not see much change)")
    elif cos_sim > 0.7:
        print("      Similar voices (moderate transformation expected)")
    elif cos_sim > 0.4:
        print("      Different voices (good transformation expected)")
    else:
        print("      Very different voices (strong transformation expected)")

    # Run conversion
    print("\n" + "=" * 60)
    print("VOICE CONVERSION")
    print("=" * 60)

    output_path = os.path.join(output_dir, "5_converted.wav")

    # Save temp source
    temp_src = os.path.join(output_dir, "temp_source.wav")
    sf.write(temp_src, src_audio, 22050)

    print("   Running conversion with tau=0.3...")
    converter.convert(
        audio_src_path=temp_src,
        src_se=source_emb,
        tgt_se=target_emb,
        output_path=output_path,
        tau=0.3
    )

    os.remove(temp_src)

    # Analyze output
    output_audio, _ = sf.read(output_path)

    print("\n[OUTPUT ANALYSIS]")
    log_array_stats("output_audio", output_audio, indent=1)

    output_spec = compute_spectrogram(output_audio)
    plot_spectrogram(output_spec, "Converted Output Spectrogram",
                     os.path.join(output_dir, "6_output_spectrogram.png"))

    # Transcribe
    print("\n[TRANSCRIPTION VERIFICATION]")
    try:
        import whisper
        import warnings
        warnings.filterwarnings('ignore')
        model = whisper.load_model('base')
        result = model.transcribe(output_path)
        print("   Transcription: \"{}\"".format(result['text'].strip()))
    except Exception as e:
        print("   Transcription failed: {}".format(e))

    print("\n" + "#" * 70)
    print("#  DIAGNOSTIC COMPLETE")
    print("#" * 70)
    print("\nOutput directory: {}".format(output_dir))
    print("Converted audio: {}".format(output_path))
    print("\nVisualization files:")
    print("   1_target_spectrogram.png - Your voice spectrogram")
    print("   2_source_spectrogram.png - TTS source spectrogram")
    print("   3_target_embedding.png   - Your voice embedding")
    print("   4_source_embedding.png   - TTS embedding")
    print("   6_output_spectrogram.png - Converted output spectrogram")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Voice Cloning Diagnostic")
    parser.add_argument('--reference', '-r', required=True, help='Your voice audio')
    parser.add_argument('--source', '-s', required=True, help='TTS audio to convert')
    parser.add_argument('--output', '-o', default='diagnostic_output', help='Output directory')

    args = parser.parse_args()

    run_diagnostic(args.reference, args.source, args.output)
