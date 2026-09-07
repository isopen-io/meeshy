# ADR-003: Client-side (P2P) vs Server-side (SFU) Transcription Strategy

**Status**: Accepted

**Date**: 2025-10-28

**Deciders**: Microservices Architecture Team

---

## Context

The Video Call Feature requires real-time speech transcription with translation. We need to determine:

1. Where to perform transcription (client vs server)
2. Which transcription engines to use
3. How to optimize for latency, accuracy, and cost

### Requirements
- **Latency**: <1s from speech → displayed subtitle
- **Accuracy**: >90% transcription confidence
- **Privacy**: Minimize sensitive audio data transmission
- **Cost**: Minimize API costs (OpenAI Whisper API charges per minute)
- **Languages**: Support 50+ languages (same as translator service)
- **Modes**: Different strategies for P2P vs SFU modes

---

## Decision

We will use a **hybrid approach**:

1. **P2P mode (2 participants)**: **Client-side transcription**
   - **Primary**: Web Speech API (browser native)
   - **Fallback**: Whisper.js (TensorFlow.js in browser)

2. **SFU mode (3+ participants)**: **Server-side transcription**
   - **Engine**: faster-whisper (self-hosted on media server)
   - **Fallback**: OpenAI Whisper API (paid, high accuracy)

---

## Rationale

### P2P Mode: Client-side Transcription

#### Why Web Speech API (Primary)

| Feature | Web Speech API | Whisper.js | OpenAI Whisper API |
|---------|----------------|------------|-------------------|
| **Latency** | ~200ms (real-time) | ~500ms (model load) | ~1-2s (network + API) |
| **Accuracy** | 85-95% (depends on browser) | 90-95% | 95-98% |
| **Cost** | Free | Free | $0.006/min |
| **Privacy** | Local (Chrome/Edge), Cloud (Safari) | Fully local | Cloud API |
| **Browser support** | Chrome, Edge, Safari | All (WASM) | N/A |
| **Languages** | 50+ (browser-dependent) | 99 (Whisper model) | 99 |
| **Offline** | No | Yes (after model load) | No |

**Decision**: Web Speech API as primary because:
- ✅ **Lowest latency**: ~200ms (real-time streaming)
- ✅ **Zero cost**: No API charges, no server processing
- ✅ **Best UX**: Instant feedback (interim results)
- ✅ **Native integration**: No additional JS bundle size
- ✅ **Privacy-preserving**: Audio never leaves device (Chrome/Edge uses on-device models)

**Limitations**:
- ❌ **Browser-dependent accuracy**: Safari uses Siri (cloud), Chrome uses on-device models
- ❌ **No offline support**: Requires internet connection (except Chrome's on-device model)
- ❌ **Limited control**: Can't customize model or fine-tune

#### Why Whisper.js (Fallback)

Use Whisper.js when:
1. Web Speech API not supported (older browsers)
2. User prefers offline transcription
3. Web Speech API accuracy <80% (based on confidence scores)

**Trade-offs**:
- ✅ **High accuracy**: 90-95% (OpenAI Whisper model)
- ✅ **Fully local**: Privacy-preserving, no cloud API
- ✅ **Consistent**: Same model across all browsers
- ❌ **Slower**: ~500ms latency (model load, WASM overhead)
- ❌ **Bundle size**: ~50 MB model (loaded on-demand)

### SFU Mode: Server-side Transcription

#### Why faster-whisper (Primary)

| Feature | faster-whisper | OpenAI Whisper API | Deepgram API |
|---------|----------------|-------------------|--------------|
| **Latency** | ~500ms-1s | ~1-2s | ~300ms |
| **Accuracy** | 90-95% | 95-98% | 92-96% |
| **Cost** | Free (self-hosted) | $0.006/min | $0.0043/min |
| **Languages** | 99 | 99 | 36 |
| **GPU support** | Yes (CUDA, TensorRT) | N/A | N/A |
| **Self-hosted** | Yes | No | No |
| **Batch transcription** | Yes | No | Partial |

**Decision**: faster-whisper as primary because:
- ✅ **Fast**: 4x faster than OpenAI Whisper (C++/CUDA optimizations)
- ✅ **Zero cost**: Self-hosted, no per-minute charges
- ✅ **Batch processing**: Transcribe multiple participants in parallel
- ✅ **GPU acceleration**: Leverage media server GPU (if available)
- ✅ **Privacy**: Audio stays on our servers (not sent to third-party API)
- ✅ **Control**: Fine-tune models, adjust parameters

**Why server-side in SFU mode**:
1. **Single audio source**: Media server already receives all audio streams (SFU routing)
2. **Batch efficiency**: Transcribe multiple participants simultaneously
3. **Consistent quality**: Server-grade GPU (vs. varied client devices)
4. **No client overhead**: Clients already handling video decoding + display

#### Why OpenAI Whisper API (Fallback)

Use OpenAI API when:
1. faster-whisper server unavailable (failover)
2. No GPU available (CPU transcription too slow)
3. Need highest accuracy (e.g., legal/medical conversations)

**Cost estimate**:
- 10 participants × 60 min call × $0.006/min = **$3.60 per call**
- Expected usage: <1% of calls (fallback only)

---

## Comparison: Client vs Server Transcription

### Latency Breakdown

#### Client-side (P2P)
```
Speech → Mic → Web Speech API → Translation API → Display
  0ms     50ms       200ms            300ms          50ms
                   Total: ~600ms
```

#### Server-side (SFU)
```
Speech → Mic → WebRTC → Media Server → faster-whisper → Translation → Display
  0ms     50ms    100ms      50ms         500ms          300ms      50ms
                          Total: ~1050ms
```

**Conclusion**: Client-side is ~2x faster (600ms vs 1050ms).

### Privacy Comparison

| Mode | Audio Location | Transcription Location | Privacy Level |
|------|----------------|------------------------|---------------|
| **P2P (Web Speech API)** | Client device | Client (Chrome) or Cloud (Safari) | High (on-device) / Medium (cloud) |
| **P2P (Whisper.js)** | Client device | Client browser | High (fully local) |
| **SFU (faster-whisper)** | Media server | Media server | Medium (our servers) |
| **SFU (OpenAI API)** | Media server → OpenAI | OpenAI cloud | Low (third-party) |

**Conclusion**: Client-side (especially Whisper.js) is most privacy-preserving.

### Cost Comparison (1000 calls/month, 30 min avg)

| Approach | Cost per Call | Monthly Cost |
|----------|---------------|--------------|
| **Client-side (Web Speech API)** | $0 | $0 |
| **Client-side (Whisper.js)** | $0 | $0 |
| **Server-side (faster-whisper)** | $0 (server cost) | ~$50/month (GPU server) |
| **Server-side (OpenAI API)** | $1.80 (10 participants × 30 min × $0.006) | $1,800/month |

**Conclusion**: Client-side has zero marginal cost. Server-side with faster-whisper has fixed cost ($50/month), 36x cheaper than OpenAI API.

---

## Consequences

### Positive

1. **Lowest latency**: P2P mode uses client-side (~600ms)
2. **Cost-effective**: 70-80% of calls (P2P) have zero transcription cost
3. **Privacy-preserving**: Audio stays on client (P2P) or our servers (SFU)
4. **Scalable**: Server-side transcription scales with media server
5. **Fallback resilience**: Multiple fallback options (Web Speech → Whisper.js, faster-whisper → OpenAI)

### Negative

1. **Complexity**: Two transcription pipelines (client vs server)
2. **Testing overhead**: Must test both modes, fallbacks, error handling
3. **Accuracy variance**: Web Speech API quality varies by browser
4. **GPU dependency**: faster-whisper requires GPU for best performance (CPU is slow)
5. **Bundle size**: Whisper.js adds ~50 MB (lazy-loaded)

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Web Speech API unavailable** | Fallback to Whisper.js |
| **Whisper.js model load failure** | Graceful degradation (show "Transcription unavailable") |
| **faster-whisper server down** | Failover to OpenAI Whisper API (cost alert) |
| **OpenAI API rate limit** | Queue requests, retry with exponential backoff |
| **High OpenAI API costs** | Alert if usage >$100/day, disable for low-priority calls |

---

## Implementation Details

### Client-side (P2P) - Web Speech API

```typescript
// Frontend: Transcription Client
import { TranslatorService } from '@/services/translator';

class TranscriptionClient {
  private recognition: SpeechRecognition | null = null;

  start() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported, fallback to Whisper.js');
      this.fallbackToWhisperJS();
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.userLanguage; // e.g., 'en-US'

    this.recognition.onresult = async (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;
      const isFinal = result.isFinal;

      // Display original (local)
      this.displaySubtitle(transcript, this.userLanguage, isFinal);

      if (isFinal) {
        // Translate for other participant
        const translation = await TranslatorService.translate({
          text: transcript,
          from: this.userLanguage,
          to: this.otherParticipantLanguage
        });

        // Send via Socket.IO
        this.socket.emit('call:transcription', {
          callId: this.callId,
          participantId: this.participantId,
          text: transcript,
          language: this.userLanguage,
          translation: translation.text,
          targetLanguage: this.otherParticipantLanguage,
          isFinal: true,
          confidenceScore: confidence
        });
      }
    };

    this.recognition.start();
  }
}
```

### Server-side (SFU) - faster-whisper

```typescript
// Media Server: Audio tap + transcription
import { exec } from 'child_process';
import fetch from 'node-fetch';

class AudioTranscriptionPipeline {
  async tapAudioProducer(producer: mediasoup.types.Producer) {
    // Create PlainTransport to receive RTP
    const plainTransport = await this.router.createPlainTransport({
      listenIp: '127.0.0.1',
      rtcpMux: false,
      comedia: true
    });

    // Pipe audio to transcription service
    await plainTransport.connect({ ip: '127.0.0.1', port: 5004 });

    const consumer = await plainTransport.consume({
      producerId: producer.id,
      rtpCapabilities: this.router.rtpCapabilities
    });

    // RTP → Audio buffer (using FFmpeg)
    const ffmpegProcess = exec(`
      ffmpeg -protocol_whitelist file,udp,rtp \
        -i rtp://127.0.0.1:5004 \
        -f s16le -acodec pcm_s16le -ar 16000 -ac 1 pipe:1
    `);

    // Send audio buffer to faster-whisper (every 2 seconds)
    let audioBuffer = Buffer.alloc(0);
    ffmpegProcess.stdout.on('data', async (chunk) => {
      audioBuffer = Buffer.concat([audioBuffer, chunk]);

      // 2 seconds of audio (16kHz, 16-bit, mono) = 64,000 bytes
      if (audioBuffer.length >= 64000) {
        const transcription = await this.transcribeAudio(audioBuffer.slice(0, 64000));
        audioBuffer = audioBuffer.slice(64000);

        // Send to Gateway for translation + broadcast
        await fetch(`${GATEWAY_URL}/api/calls/${callId}/transcriptions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantId: producer.appData.participantId,
            text: transcription.text,
            language: transcription.language,
            confidenceScore: transcription.confidence
          })
        });
      }
    });
  }

  async transcribeAudio(buffer: Buffer): Promise<{ text: string, language: string, confidence: number }> {
    // Call faster-whisper service
    const response = await fetch('http://localhost:5000/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer
    });

    return await response.json();
  }
}
```

---

## Alternatives Rejected

### Alternative 1: Always Client-side
**Rejected because**:
- Poor quality on low-end devices (mobile, old laptops)
- Inconsistent accuracy across browsers
- No central transcription log for analytics

### Alternative 2: Always Server-side (OpenAI API)
**Rejected because**:
- High cost ($1.80/call for 10 participants × 30 min)
- Unnecessary for 2-person P2P calls
- Privacy concerns (third-party API)

### Alternative 3: Always faster-whisper
**Rejected because**:
- Requires GPU server (higher infrastructure cost)
- Higher latency than Web Speech API (~1s vs ~200ms)
- P2P calls would need to send audio to server (defeats P2P purpose)

---

## Monitoring & Metrics

Track these metrics to validate the decision:

1. **Transcription latency**:
   - P2P (Web Speech API): p50, p95, p99 (expect <500ms)
   - SFU (faster-whisper): p50, p95, p99 (expect <1.2s)

2. **Transcription accuracy**:
   - Confidence scores (expect >0.9)
   - User-reported errors ("Transcription incorrect")

3. **Fallback usage**:
   - % of calls using Whisper.js (expect <10%)
   - % of calls using OpenAI API (expect <1%)

4. **Cost**:
   - OpenAI API spend per month (expect <$50/month)
   - faster-whisper server cost (GPU instance)

---

**Approved by**: Architecture Team
**Implementation start**: Week 2
**Review date**: 3 months post-deployment
