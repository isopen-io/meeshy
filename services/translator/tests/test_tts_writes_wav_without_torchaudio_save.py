"""
#16340 — une piste TTS s'écrit sans `torchaudio.save`.

Depuis torchaudio 2.9, `torchaudio.save` délègue à TorchCodec et lève
`ImportError` quand TorchCodec n'est pas installé. Le bump de speechbrain 1.1.2
(qui exige torch>=2.7.1) a fait monter l'image de staging à torch 2.12 /
torchaudio 2.11 : CHAQUE synthèse échouait à l'écriture, et chaque vocal
partait sans aucune traduction (« Toutes les traductions ont échoué »),
quel que soit le client qui l'avait envoyé.

L'écriture d'une piste ne dépend donc plus de la version de torchaudio : elle
passe par soundfile (libsndfile), déjà requis par le translator.
"""

import os
import re
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from utils.wav_write import write_wav

SRC = Path(__file__).resolve().parents[1] / "src"


@pytest.mark.unit
def test_a_mono_tensor_shaped_like_a_tts_output_is_written_as_a_readable_wav(tmp_path):
    torch = pytest.importorskip("torch")
    wav = torch.sin(torch.linspace(0, 400, 24000)).unsqueeze(0) * 0.5
    target = tmp_path / "piste_fr.wav"

    written = write_wav(str(target), wav, 24000)

    data, sample_rate = sf.read(written)
    assert written == str(target)
    assert sample_rate == 24000
    assert data.shape == (24000,)
    assert np.allclose(data, wav.squeeze(0).numpy(), atol=1e-3)


@pytest.mark.unit
def test_a_plain_numpy_signal_is_written_too(tmp_path):
    signal = np.zeros(16000, dtype=np.float32)
    target = tmp_path / "silence.wav"

    write_wav(str(target), signal, 16000)

    data, sample_rate = sf.read(str(target))
    assert sample_rate == 16000
    assert data.shape == (16000,)


@pytest.mark.unit
def test_a_channels_first_stereo_tensor_keeps_its_two_channels(tmp_path):
    torch = pytest.importorskip("torch")
    wav = torch.zeros(2, 8000)
    target = tmp_path / "stereo.wav"

    write_wav(str(target), wav, 8000)

    data, _ = sf.read(str(target))
    assert data.shape == (8000, 2)


@pytest.mark.unit
def test_no_tts_backend_writes_its_track_with_torchaudio_save():
    offenders = [
        f"{path.relative_to(SRC)}:{number}"
        for path in (SRC / "services" / "tts").rglob("*.py")
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if re.search(r"\btorchaudio\.save\(", line) and not line.lstrip().startswith("#")
    ]
    assert offenders == []
