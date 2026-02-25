import { base } from "$app/paths";
import { getToken } from "$lib/auth/index.js";
import { BACKEND_URL } from "$lib/config/backend-url.js";

const FEATURE_HEADER = "X-Anglicus-Feature";
const CHUNK_THRESHOLD_BYTES = 260_000;
const CHUNK_SIZE_BYTES = 150_000;

export type SpeechLanguage = "en" | "es";

export class SpeechRequestError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type SpeechTranscriptionResult = {
  transcript: string;
  confidence: number;
  source: "hint" | "provider";
  durationMs: number;
  bytes: number;
};

export type SpeechPronunciationResult = {
  score: number;
  intelligibility: number;
  fluency: number;
  confidence: number;
  verdict: "excellent" | "good" | "needs_work";
  acceptedVariants: string[];
  missingWords: string[];
  extraWords: string[];
  feedback: string;
  drills: string[];
  policy: "intelligibility_first";
};

export type SpeechSynthesisHint = {
  mode: "client_tts";
  language: SpeechLanguage;
  voice: string;
  text: string;
  hint: string;
};

type TranscribeOptions = {
  language: SpeechLanguage;
  durationMs: number;
  transcriptHint?: string;
  timeoutMs?: number;
};

function redirectToLogin(): void {
  window.location.href = `${base}/login`;
}

function requireAuthToken(): string {
  const token = getToken();
  if (!token) {
    redirectToLogin();
    throw new SpeechRequestError("auth_required", 401, "auth_required");
  }
  return token;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SpeechRequestError("request_timeout", 408, "request_timeout");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let chunkBinary = "";
    for (const value of chunk) {
      chunkBinary += String.fromCharCode(value);
    }
    binary += chunkBinary;
  }
  return btoa(binary);
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      "speech_request_failed";
    const code = payload?.error?.type;
    throw new SpeechRequestError(message, response.status, code);
  }
  return payload as T;
}

async function postSpeechPayload<T>(
  path: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
): Promise<T> {
  const token = requireAuthToken();
  const response = await fetchWithTimeout(
    `${BACKEND_URL}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        [FEATURE_HEADER]: "speaking",
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
  );
  if (response.status === 401) {
    redirectToLogin();
    throw new SpeechRequestError("auth_required", 401, "auth_required");
  }
  return parseJsonResponse<T>(response);
}

export async function transcribeSpeechBlob(
  audioBlob: Blob,
  options: TranscribeOptions,
): Promise<SpeechTranscriptionResult> {
  const bytes = await blobToBytes(audioBlob);
  const timeoutMs = options.timeoutMs ?? 16_000;

  if (bytes.length <= CHUNK_THRESHOLD_BYTES) {
    return postSpeechPayload<SpeechTranscriptionResult>(
      "/v1/speech/transcribe",
      {
        audioBase64: bytesToBase64(bytes),
        mimeType: audioBlob.type || "audio/webm",
        durationMs: options.durationMs,
        language: options.language,
        transcriptHint: options.transcriptHint,
      },
      timeoutMs,
    );
  }

  const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE_BYTES);
  const sessionId = crypto.randomUUID();
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * CHUNK_SIZE_BYTES;
    const end = Math.min(start + CHUNK_SIZE_BYTES, bytes.length);
    const chunk = bytes.subarray(start, end);
    const response = await postSpeechPayload<
      SpeechTranscriptionResult | { status: "chunk_received" }
    >(
      "/v1/speech/transcribe",
      {
        sessionId,
        chunkBase64: bytesToBase64(chunk),
        chunkIndex,
        totalChunks,
        finalize: chunkIndex === totalChunks - 1,
        mimeType: audioBlob.type || "audio/webm",
        durationMs: options.durationMs,
        language: options.language,
        transcriptHint: options.transcriptHint,
      },
      timeoutMs,
    );
    if ("status" in response && chunkIndex === totalChunks - 1) {
      throw new SpeechRequestError(
        "transcription_finalize_missing",
        500,
        "transcription_finalize_missing",
      );
    }
    if ("transcript" in response) {
      return response;
    }
  }

  throw new SpeechRequestError(
    "transcription_failed",
    500,
    "transcription_failed",
  );
}

export async function analyzeSpeechPronunciation(
  transcript: string,
  language: SpeechLanguage,
  referenceText?: string,
): Promise<SpeechPronunciationResult> {
  return postSpeechPayload<SpeechPronunciationResult>(
    "/v1/speech/pronunciation",
    {
      transcript,
      language,
      referenceText,
    },
    12_000,
  );
}

export async function getSpeechSynthesisHint(
  text: string,
  language: SpeechLanguage,
): Promise<SpeechSynthesisHint> {
  return postSpeechPayload<SpeechSynthesisHint>(
    "/v1/speech/synthesize",
    { text, language },
    10_000,
  );
}
