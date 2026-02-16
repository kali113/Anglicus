<script lang="ts">
  import { onMount } from "svelte";
  import {
    analyzeSpeechPronunciation,
    transcribeSpeechBlob,
    type SpeechLanguage,
    type SpeechPronunciationResult,
    SpeechRequestError,
  } from "$lib/ai/speech-client.js";
  import {
    checkBillingAccess,
    getFeatureLabel,
    recordBillingUsage,
  } from "$lib/billing/index.js";
  import { t } from "$lib/i18n";
  import { recordSpeakingPractice } from "$lib/storage/user-store.js";
  import type { LanguageCode } from "$lib/types/user.js";

  interface SpeechRecognitionAlternativeLike {
    transcript: string;
  }

  interface SpeechRecognitionResultLike {
    isFinal: boolean;
    [index: number]: SpeechRecognitionAlternativeLike;
  }

  interface SpeechRecognitionEventLike {
    resultIndex: number;
    results: ArrayLike<SpeechRecognitionResultLike>;
  }

  interface SpeechRecognitionLike {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
  }

  type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

  interface Props {
    targetLanguage: LanguageCode;
    referenceText?: string;
    onTranscript?: (transcript: string) => Promise<void> | void;
    onPaywall?: (
      mode: "nag" | "block",
      featureLabel: string,
    ) => Promise<void> | void;
  }

  const MAX_RECORDING_MS = 45_000;
  const MAX_LOCAL_AUDIO_BYTES = 1_200_000;
  const SILENCE_THRESHOLD = 0.02;
  const SILENCE_STOP_MS = 2_500;
  const MIN_RECORDING_MS = 1_000;

  let {
    targetLanguage,
    referenceText = "",
    onTranscript,
    onPaywall,
  }: Props = $props();

  let recordingState = $state<
    | "idle"
    | "requestingPermission"
    | "recording"
    | "encoding"
    | "uploading"
    | "scoring"
    | "error"
  >("idle");
  let errorMessage = $state("");
  let statusMessage = $state("");
  let supportsVoice = $state(false);
  let isOnline = $state(true);
  let selectedMimeType = $state<string | null>(null);
  let pronunciationResult = $state<SpeechPronunciationResult | null>(null);

  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let recordingStartedAt = 0;
  let silenceStartedAt: number | null = null;
  let silenceMonitorTimer: number | null = null;
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let mediaSourceNode: MediaStreamAudioSourceNode | null = null;
  let recognition: SpeechRecognitionLike | null = null;
  let transcriptHint = "";
  let autoStopReason: "silence" | "limit" | null = null;
  let pendingAbortMessage: string | null = null;

  const actionLabel = $derived(
    recordingState === "recording" ? $t("tutor.voiceStop") : $t("tutor.voiceStart"),
  );

  function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
    const scope = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
  }

  function getPreferredMimeType(): string | null {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      return null;
    }
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/webm",
      "audio/ogg",
    ];
    if (typeof MediaRecorder.isTypeSupported !== "function") {
      return "audio/webm";
    }
    for (const candidate of candidates) {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    }
    return null;
  }

  function detectVoiceSupport(): void {
    if (typeof window === "undefined") {
      supportsVoice = false;
      selectedMimeType = null;
      return;
    }
    const hasMicApi = Boolean(navigator.mediaDevices?.getUserMedia);
    const mimeType = getPreferredMimeType();
    selectedMimeType = mimeType;
    supportsVoice = hasMicApi && typeof MediaRecorder !== "undefined" && Boolean(mimeType);
  }

  function cleanupSilenceMonitor(): void {
    if (silenceMonitorTimer !== null) {
      window.clearInterval(silenceMonitorTimer);
      silenceMonitorTimer = null;
    }
    silenceStartedAt = null;
    if (mediaSourceNode) {
      mediaSourceNode.disconnect();
      mediaSourceNode = null;
    }
    if (analyserNode) {
      analyserNode.disconnect();
      analyserNode = null;
    }
    if (audioContext) {
      void audioContext.close();
      audioContext = null;
    }
  }

  function stopSpeechRecognition(): void {
    if (!recognition) return;
    try {
      recognition.stop();
    } catch (error) {
      console.warn("Speech recognition stop failed:", error);
    } finally {
      recognition = null;
    }
  }

  function cleanupMediaResources(): void {
    cleanupSilenceMonitor();
    stopSpeechRecognition();
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
      mediaStream = null;
    }
    mediaRecorder = null;
  }

  function toSpeechLanguage(language: LanguageCode): SpeechLanguage {
    return language === "en" ? "en" : "es";
  }

  function startSpeechRecognition(language: SpeechLanguage): void {
    transcriptHint = "";
    const RecognitionCtor = getSpeechRecognitionCtor();
    if (!RecognitionCtor) return;
    recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = language === "en" ? "en-US" : "es-ES";
    recognition.onresult = (event) => {
      const parts: string[] = [];
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result || !result.isFinal) continue;
        const transcript = result[0]?.transcript?.trim();
        if (transcript) parts.push(transcript);
      }
      if (parts.length > 0) {
        transcriptHint = `${transcriptHint} ${parts.join(" ")}`.trim();
      }
    };
    recognition.onerror = () => {
      // Keep recording even if recognition fails, transcription endpoint may still work.
    };
    recognition.onend = () => {
      recognition = null;
    };
    try {
      recognition.start();
    } catch (error) {
      console.warn("Speech recognition start failed:", error);
      recognition = null;
    }
  }

  function startSilenceMonitor(stream: MediaStream): void {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
    try {
      audioContext = new AudioContext();
      mediaSourceNode = audioContext.createMediaStreamSource(stream);
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 512;
      mediaSourceNode.connect(analyserNode);

      silenceMonitorTimer = window.setInterval(() => {
        if (!analyserNode || recordingState !== "recording") return;
        const elapsed = Date.now() - recordingStartedAt;
        if (elapsed >= MAX_RECORDING_MS) {
          autoStopReason = "limit";
          stopRecording();
          return;
        }

        const samples = new Uint8Array(analyserNode.fftSize);
        analyserNode.getByteTimeDomainData(samples);
        let sumSquares = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          sumSquares += centered * centered;
        }
        const rms = Math.sqrt(sumSquares / samples.length);
        if (rms < SILENCE_THRESHOLD) {
          if (silenceStartedAt === null) silenceStartedAt = Date.now();
          const silenceDuration = Date.now() - silenceStartedAt;
          if (elapsed > MIN_RECORDING_MS && silenceDuration >= SILENCE_STOP_MS) {
            autoStopReason = "silence";
            stopRecording();
          }
        } else {
          silenceStartedAt = null;
        }
      }, 250);
    } catch (error) {
      console.warn("Silence monitor unavailable:", error);
      cleanupSilenceMonitor();
    }
  }

  async function startRecording(): Promise<void> {
    if (recordingState !== "idle" && recordingState !== "error") return;
    errorMessage = "";
    statusMessage = "";
    pronunciationResult = null;

    if (!supportsVoice) {
      recordingState = "error";
      errorMessage = $t("tutor.voiceUnavailable");
      return;
    }
    if (!isOnline) {
      recordingState = "error";
      errorMessage = $t("tutor.voiceOffline");
      return;
    }

    const billingDecision = await checkBillingAccess("speaking");
    if (billingDecision) {
      if (billingDecision.mode === "block") {
        await onPaywall?.("block", getFeatureLabel("speaking"));
        return;
      }
      if (billingDecision.mode === "nag") {
        await onPaywall?.("nag", getFeatureLabel("speaking"));
      }
    }

    recordingState = "requestingPermission";
    const language = toSpeechLanguage(targetLanguage);

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      recordingState = "error";
      const domError = error as DOMException;
      if (domError.name === "NotAllowedError") {
        errorMessage = $t("tutor.voicePermissionDenied");
      } else {
        errorMessage = $t("tutor.voiceUnavailable");
      }
      return;
    }

    for (const track of mediaStream.getAudioTracks()) {
      track.addEventListener("ended", () => {
        if (recordingState === "recording") {
          pendingAbortMessage = $t("tutor.voiceMicLost");
          stopRecording();
        }
      });
    }

    recordedChunks = [];
    transcriptHint = "";
    autoStopReason = null;
    pendingAbortMessage = null;

    try {
      mediaRecorder = selectedMimeType
        ? new MediaRecorder(mediaStream, { mimeType: selectedMimeType })
        : new MediaRecorder(mediaStream);
    } catch (error) {
      console.error("MediaRecorder init failed:", error);
      cleanupMediaResources();
      recordingState = "error";
      errorMessage = $t("tutor.voiceUnavailable");
      return;
    }

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    mediaRecorder.onstop = () => {
      void finalizeRecording();
    };
    mediaRecorder.onerror = () => {
      pendingAbortMessage = $t("tutor.voiceInterrupted");
      stopRecording();
    };

    startSpeechRecognition(language);
    startSilenceMonitor(mediaStream);
    recordingStartedAt = Date.now();
    mediaRecorder.start(300);
    recordingState = "recording";
    statusMessage = $t("tutor.voiceRecording");
  }

  function stopRecording(): void {
    if (recordingState !== "recording") return;
    recordingState = "encoding";
    stopSpeechRecognition();
    cleanupSilenceMonitor();
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      void finalizeRecording();
    }
  }

  async function finalizeRecording(): Promise<void> {
    const durationMs = Math.max(1, Date.now() - recordingStartedAt);
    const blob = new Blob(recordedChunks, {
      type: selectedMimeType || "audio/webm",
    });
    recordedChunks = [];

    cleanupMediaResources();

    if (pendingAbortMessage) {
      recordingState = "error";
      errorMessage = pendingAbortMessage;
      pendingAbortMessage = null;
      return;
    }

    if (blob.size === 0) {
      recordingState = "error";
      errorMessage = $t("tutor.voiceNoTranscript");
      return;
    }

    if (blob.size > MAX_LOCAL_AUDIO_BYTES) {
      recordingState = "error";
      errorMessage = $t("tutor.voiceTooLarge");
      return;
    }

    const language = toSpeechLanguage(targetLanguage);
    statusMessage = $t("tutor.voiceProcessing");
    recordingState = "uploading";

    try {
      const transcription = await transcribeSpeechBlob(blob, {
        language,
        durationMs,
        transcriptHint: transcriptHint || undefined,
      });
      const transcript = transcription.transcript.trim();
      if (!transcript) {
        throw new SpeechRequestError("empty_transcript", 422, "empty_transcript");
      }

      recordingState = "scoring";
      const pronunciation = await analyzeSpeechPronunciation(
        transcript,
        language,
        referenceText || undefined,
      );
      pronunciationResult = pronunciation;
      await recordSpeakingPractice(durationMs, pronunciation.score, transcript);
      await recordBillingUsage("speaking");
      await onTranscript?.(transcript);

      if (autoStopReason === "silence") {
        statusMessage = $t("tutor.voiceSilenceStop");
      } else if (autoStopReason === "limit") {
        statusMessage = $t("tutor.voiceLimitStop");
      } else {
        statusMessage = "";
      }
      autoStopReason = null;
      recordingState = "idle";
    } catch (error) {
      console.error("Voice processing failed:", error);
      if (error instanceof SpeechRequestError && error.status === 429) {
        await onPaywall?.("block", getFeatureLabel("speaking"));
      }
      recordingState = "error";
      if (
        error instanceof SpeechRequestError &&
        (error.code === "speech_provider_unavailable" || error.status === 503)
      ) {
        errorMessage = $t("tutor.voiceNoTranscript");
      } else if (
        error instanceof SpeechRequestError &&
        (error.code === "request_timeout" || error.status === 408)
      ) {
        errorMessage = $t("tutor.connectionError");
      } else {
        errorMessage = $t("tutor.voiceInterrupted");
      }
    }
  }

  function resetVoiceError(): void {
    errorMessage = "";
    statusMessage = "";
    recordingState = "idle";
  }

  onMount(() => {
    detectVoiceSupport();
    isOnline = navigator.onLine;

    const onOnline = () => {
      isOnline = true;
    };
    const onOffline = () => {
      isOnline = false;
      if (recordingState === "recording") {
        pendingAbortMessage = $t("tutor.voiceOffline");
        stopRecording();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && recordingState === "recording") {
        pendingAbortMessage = $t("tutor.voiceInterrupted");
        stopRecording();
      }
    };
    const onPageHide = () => {
      if (recordingState === "recording") {
        pendingAbortMessage = $t("tutor.voiceInterrupted");
        stopRecording();
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      cleanupMediaResources();
    };
  });
</script>

<section class="speaking-coach">
  <h2>{$t("tutor.voiceMode")}</h2>
  <p class="hint">{$t("tutor.voiceReady")}</p>

  {#if !supportsVoice}
    <p class="warning">{$t("tutor.voiceUnavailable")}</p>
  {/if}
  {#if !isOnline}
    <p class="warning">{$t("tutor.voiceOffline")}</p>
  {/if}

  <div class="actions">
    <button
      class:recording={recordingState === "recording"}
      onclick={recordingState === "recording" ? stopRecording : startRecording}
      disabled={!supportsVoice || !isOnline || (recordingState !== "idle" && recordingState !== "recording" && recordingState !== "error")}
    >
      {actionLabel}
    </button>
    {#if recordingState === "recording"}
      <span class="live">● {$t("tutor.voiceRecording")}</span>
    {/if}
  </div>

  {#if statusMessage}
    <p class="status">{statusMessage}</p>
  {/if}

  {#if errorMessage}
    <div class="error-box">
      <p>{errorMessage}</p>
      <button class="retry" onclick={resetVoiceError}>{$t("tutor.voiceRetry")}</button>
    </div>
  {/if}

  {#if pronunciationResult}
    <div class="result-box">
      <p class="score">{$t("tutor.voiceScore", { score: pronunciationResult.score })}</p>
      <p class="label">{$t("tutor.voiceFeedback")}</p>
      <p>{pronunciationResult.feedback}</p>
      <p class="label">{$t("tutor.voiceDrills")}</p>
      <ul>
        {#each pronunciationResult.drills as drill}
          <li>{drill}</li>
        {/each}
      </ul>
    </div>
  {/if}
</section>

<style>
  .speaking-coach {
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 1rem;
    margin-bottom: 1rem;
    background: color-mix(in srgb, var(--bg-card-light) 30%, transparent);
  }

  h2 {
    margin: 0;
    font-size: 1rem;
  }

  .hint {
    margin: 0.4rem 0 0.8rem 0;
    color: var(--text-secondary, #9ca3af);
    font-size: 0.9rem;
  }

  .warning {
    margin: 0.4rem 0;
    color: #fbbf24;
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  button {
    border: none;
    border-radius: 999px;
    padding: 0.55rem 1rem;
    background: var(--primary);
    color: #fff;
    font-weight: 600;
    cursor: pointer;
  }

  button.recording {
    background: #ef4444;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .live {
    font-size: 0.85rem;
    color: #ef4444;
    font-weight: 600;
  }

  .status {
    margin: 0.75rem 0 0 0;
    color: var(--text-secondary, #9ca3af);
    font-size: 0.85rem;
  }

  .error-box {
    margin-top: 0.75rem;
    padding: 0.65rem;
    background: #7f1d1d33;
    border: 1px solid #7f1d1d;
    border-radius: 10px;
  }

  .error-box p {
    margin: 0;
    font-size: 0.85rem;
    color: #fecaca;
  }

  .retry {
    margin-top: 0.55rem;
    background: transparent;
    border: 1px solid #fecaca;
    color: #fecaca;
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
  }

  .result-box {
    margin-top: 0.8rem;
    border-top: 1px solid var(--border);
    padding-top: 0.7rem;
    font-size: 0.9rem;
  }

  .score {
    margin: 0 0 0.5rem 0;
    font-weight: 700;
    color: var(--primary-light, #5eead4);
  }

  .label {
    margin: 0.5rem 0 0.2rem 0;
    font-weight: 600;
  }

  ul {
    margin: 0.25rem 0 0 1rem;
    padding: 0;
  }
</style>
