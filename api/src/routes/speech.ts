import type { Env } from "../index.js";
import { jsonError, jsonSuccess } from "../lib/response.js";

type SpeechLanguage = "en" | "es";

type SpeechChunkSession = {
  chunks: string[];
  totalChunks: number;
  mimeType: string;
  durationMs: number;
  language: SpeechLanguage;
  transcriptHint?: string;
  createdAt: number;
};

const MAX_AUDIO_BYTES = 1_200_000; // ~1.2MB
const MAX_CHUNK_BYTES = 180_000;
const MAX_DURATION_MS = 45_000;
const MAX_TEXT_CHARS = 280;
const MAX_CHUNKS = 16;
const CHUNK_SESSION_TTL_MS = 1000 * 60 * 10;
const SUPPORTED_MIME_TYPES = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/ogg",
];

const speechChunkSessions = new Map<string, SpeechChunkSession>();

const ACCEPTED_VARIANTS: Record<string, string> = {
  colour: "color",
  colours: "colors",
  favourite: "favorite",
  favourites: "favorites",
  realise: "realize",
  realised: "realized",
  centre: "center",
  centres: "centers",
  mum: "mom",
  mums: "moms",
  learnt: "learned",
  practise: "practice",
  travelling: "traveling",
  travelled: "traveled",
  catalogue: "catalog",
  theatre: "theater",
};

const FILLER_WORDS = new Set(["um", "uh", "eh", "mmm", "like"]);

function requireJson(request: Request): Response | null {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return jsonError(
      "Content-Type must be application/json",
      "invalid_request_error",
      415,
    );
  }
  return null;
}

function normalizeLanguage(value: unknown): SpeechLanguage {
  return value === "en" ? "en" : "es";
}

function normalizeTranscript(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
}

function estimateBase64Bytes(value: string): number {
  const sanitized = value.replace(/\s+/g, "");
  const padding = sanitized.endsWith("==")
    ? 2
    : sanitized.endsWith("=")
      ? 1
      : 0;
  return Math.floor((sanitized.length * 3) / 4) - padding;
}

function decodeBase64(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function concatBase64Chunks(chunks: string[]): Uint8Array | null {
  const decoded: Uint8Array[] = [];
  let totalBytes = 0;
  for (const chunk of chunks) {
    const bytes = decodeBase64(chunk);
    if (!bytes) return null;
    decoded.push(bytes);
    totalBytes += bytes.length;
  }
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const bytes of decoded) {
    merged.set(bytes, offset);
    offset += bytes.length;
  }
  return merged;
}

function isSupportedMimeType(value: string): boolean {
  return SUPPORTED_MIME_TYPES.includes(value);
}

function cleanupChunkSessions(now = Date.now()): void {
  for (const [sessionId, session] of speechChunkSessions.entries()) {
    if (now - session.createdAt > CHUNK_SESSION_TTL_MS) {
      speechChunkSessions.delete(sessionId);
    }
  }
}

function validateAudioEnvelope(
  mimeType: string,
  durationMs: number,
  bytes: number,
): Response | null {
  if (!isSupportedMimeType(mimeType)) {
    return jsonError("Unsupported audio format", "invalid_request_error", 415);
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
    return jsonError(
      `Audio duration must be between 1 and ${MAX_DURATION_MS} ms`,
      "invalid_request_error",
      400,
    );
  }
  if (bytes <= 0 || bytes > MAX_AUDIO_BYTES) {
    return jsonError(
      `Audio payload too large. Max ${MAX_AUDIO_BYTES} bytes`,
      "invalid_request_error",
      413,
    );
  }
  return null;
}

function makeUnavailableTranscriptionError(language: SpeechLanguage): Response {
  return language === "en"
    ? jsonError(
        "Speech transcription provider unavailable. Please type your sentence.",
        "speech_provider_unavailable",
        503,
      )
    : jsonError(
        "No hay proveedor de transcripcion disponible. Escribe tu frase.",
        "speech_provider_unavailable",
        503,
      );
}

function normalizeToken(token: string): string {
  const lettersOnly = token
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\p{Letter}']/gu, "")
    .toLowerCase();
  return ACCEPTED_VARIANTS[lettersOnly] || lettersOnly;
}

function tokenize(text: string): string[] {
  const tokens = text.match(/[\p{Letter}']+/gu) ?? [];
  return tokens.map(normalizeToken).filter((token) => token.length > 0);
}

function countOverlap(reference: string[], spoken: string[]): number {
  const referenceCounts = new Map<string, number>();
  for (const token of reference) {
    referenceCounts.set(token, (referenceCounts.get(token) || 0) + 1);
  }
  let overlap = 0;
  for (const token of spoken) {
    const available = referenceCounts.get(token) || 0;
    if (available > 0) {
      overlap += 1;
      referenceCounts.set(token, available - 1);
    }
  }
  return overlap;
}

function getWordDiff(reference: string[], spoken: string[]): {
  missingWords: string[];
  extraWords: string[];
} {
  const referenceCounts = new Map<string, number>();
  const spokenCounts = new Map<string, number>();
  for (const token of reference) {
    referenceCounts.set(token, (referenceCounts.get(token) || 0) + 1);
  }
  for (const token of spoken) {
    spokenCounts.set(token, (spokenCounts.get(token) || 0) + 1);
  }

  const missingWords: string[] = [];
  const extraWords: string[] = [];

  for (const [token, count] of referenceCounts.entries()) {
    const diff = count - (spokenCounts.get(token) || 0);
    if (diff > 0) {
      missingWords.push(token);
    }
  }
  for (const [token, count] of spokenCounts.entries()) {
    const diff = count - (referenceCounts.get(token) || 0);
    if (diff > 0) {
      extraWords.push(token);
    }
  }

  return {
    missingWords: missingWords.slice(0, 6),
    extraWords: extraWords.slice(0, 6),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function countRepetitions(tokens: string[]): number {
  let repetitions = 0;
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] === tokens[i - 1]) repetitions += 1;
  }
  return repetitions;
}

function findAcceptedVariants(rawText: string): string[] {
  const rawTokens = rawText.match(/[\p{Letter}']+/gu) ?? [];
  const variants = new Set<string>();
  for (const token of rawTokens) {
    const cleaned = token
      .normalize("NFKD")
      .replace(/\p{Mark}/gu, "")
      .replace(/[^\p{Letter}']/gu, "")
      .toLowerCase();
    const mapped = ACCEPTED_VARIANTS[cleaned];
    if (mapped && mapped !== cleaned) {
      variants.add(`${cleaned} → ${mapped}`);
    }
  }
  return Array.from(variants).slice(0, 5);
}

function buildDrills(
  language: SpeechLanguage,
  missingWords: string[],
  score: number,
): string[] {
  const drills: string[] = [];
  for (const word of missingWords.slice(0, 3)) {
    drills.push(
      language === "en"
        ? `Repeat clearly with "${word}" in a short sentence.`
        : `Repite con claridad una frase corta con "${word}".`,
    );
  }
  if (score < 70) {
    drills.push(
      language === "en"
        ? "Try one slower repetition and stress each content word."
        : "Haz una repeticion mas lenta y marca cada palabra clave.",
    );
  }
  if (drills.length === 0) {
    drills.push(
      language === "en"
        ? "Great clarity. Try a faster repeat while keeping pronunciation stable."
        : "Muy buena claridad. Repite mas rapido manteniendo pronunciacion estable.",
    );
  }
  return drills;
}

function buildFeedback(
  language: SpeechLanguage,
  score: number,
  intelligibility: number,
  acceptedVariants: string[],
  missingWords: string[],
): string {
  if (language === "en") {
    const variantNote =
      acceptedVariants.length > 0
        ? " Accent variants were accepted when they remained intelligible."
        : "";
    const missing =
      missingWords.length > 0
        ? ` Focus on these words: ${missingWords.join(", ")}.`
        : "";
    if (score >= 85) return `Excellent clarity and pacing.${variantNote}${missing}`;
    if (score >= 65) return `Good attempt. Keep improving rhythm and word accuracy.${variantNote}${missing}`;
    return `Main goal: maximize intelligibility before accent perfection.${variantNote}${missing}`;
  }

  const variantNote =
    acceptedVariants.length > 0
      ? " Se aceptaron variantes de acento cuando fueron comprensibles."
      : "";
  const missing =
    missingWords.length > 0
      ? ` Enfocate en estas palabras: ${missingWords.join(", ")}.`
      : "";
  if (score >= 85) return `Excelente claridad y ritmo.${variantNote}${missing}`;
  if (score >= 65) return `Buen intento. Mejora ritmo y precision de palabras.${variantNote}${missing}`;
  return `Objetivo principal: comprensibilidad antes que acento perfecto.${variantNote}${missing}`;
}

type PronunciationResult = {
  score: number;
  intelligibility: number;
  fluency: number;
  confidence: number;
  verdict: "excellent" | "good" | "needs_work";
  acceptedVariants: string[];
  missingWords: string[];
  extraWords: string[];
};

function scorePronunciation(
  transcript: string,
  referenceText: string,
): PronunciationResult {
  const spokenTokens = tokenize(transcript);
  const referenceTokens = tokenize(referenceText);

  if (spokenTokens.length === 0) {
    return {
      score: 0,
      intelligibility: 0,
      fluency: 0,
      confidence: 0,
      verdict: "needs_work",
      acceptedVariants: findAcceptedVariants(transcript),
      missingWords: [],
      extraWords: [],
    };
  }

  const overlap = referenceTokens.length > 0 ? countOverlap(referenceTokens, spokenTokens) : 0;
  const recall = referenceTokens.length > 0 ? overlap / referenceTokens.length : 0;
  const precision = overlap / spokenTokens.length;
  const baseIntelligibility =
    referenceTokens.length > 0
      ? Math.round((recall * 0.7 + precision * 0.3) * 100)
      : Math.min(95, 50 + spokenTokens.length * 4);

  const fillerCount = spokenTokens.filter((token) => FILLER_WORDS.has(token)).length;
  const fillerRatio = fillerCount / Math.max(spokenTokens.length, 1);
  const repetitionPenalty = countRepetitions(spokenTokens) * 6;
  const fluency = clamp(
    Math.round(90 - fillerRatio * 120 - repetitionPenalty),
    15,
    100,
  );

  const confidence = clamp(
    Math.round(45 + Math.min(spokenTokens.length, 15) * 3 - fillerRatio * 35),
    20,
    99,
  );

  const intelligibility = clamp(baseIntelligibility, 0, 100);
  const score = clamp(
    Math.round(intelligibility * 0.6 + fluency * 0.25 + confidence * 0.15),
    0,
    100,
  );
  const verdict: PronunciationResult["verdict"] =
    score >= 85 ? "excellent" : score >= 65 ? "good" : "needs_work";
  const { missingWords, extraWords } = getWordDiff(referenceTokens, spokenTokens);

  return {
    score,
    intelligibility,
    fluency,
    confidence,
    verdict,
    acceptedVariants: findAcceptedVariants(transcript),
    missingWords,
    extraWords,
  };
}

function parseDuration(value: unknown): number {
  return typeof value === "number" ? Math.round(value) : Number.NaN;
}

export async function handleSpeechTranscribe(
  request: Request,
  _env: Env,
): Promise<Response> {
  const jsonErrorResponse = requireJson(request);
  if (jsonErrorResponse) return jsonErrorResponse;
  cleanupChunkSessions();

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body) {
    return jsonError("Invalid JSON body", "invalid_request_error", 400);
  }

  const language = normalizeLanguage(body.language);
  const transcriptHint = normalizeTranscript(body.transcriptHint);

  if (typeof body.chunkBase64 === "string") {
    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return jsonError("sessionId is required for chunk uploads", "invalid_request_error", 400);
    }

    const totalChunks = typeof body.totalChunks === "number" ? body.totalChunks : Number.NaN;
    const chunkIndex = typeof body.chunkIndex === "number" ? body.chunkIndex : Number.NaN;
    const finalize = body.finalize === true;
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
    const durationMs = parseDuration(body.durationMs);

    if (
      !Number.isInteger(totalChunks) ||
      totalChunks < 1 ||
      totalChunks > MAX_CHUNKS ||
      !Number.isInteger(chunkIndex) ||
      chunkIndex < 0 ||
      chunkIndex >= totalChunks
    ) {
      return jsonError("Invalid chunk metadata", "invalid_request_error", 400);
    }

    const chunkBytes = estimateBase64Bytes(body.chunkBase64);
    if (chunkBytes <= 0 || chunkBytes > MAX_CHUNK_BYTES) {
      return jsonError(
        `Chunk too large. Max ${MAX_CHUNK_BYTES} bytes`,
        "invalid_request_error",
        413,
      );
    }

    let session = speechChunkSessions.get(sessionId);
    if (!session) {
      const envelopeError = validateAudioEnvelope(mimeType, durationMs, chunkBytes);
      if (envelopeError) return envelopeError;
      session = {
        chunks: new Array(totalChunks).fill(""),
        totalChunks,
        mimeType,
        durationMs,
        language,
        transcriptHint: transcriptHint || undefined,
        createdAt: Date.now(),
      };
      speechChunkSessions.set(sessionId, session);
    }

    session.chunks[chunkIndex] = body.chunkBase64;
    if (transcriptHint) {
      session.transcriptHint = transcriptHint;
    }

    const receivedChunks = session.chunks.filter((chunk) => chunk.length > 0).length;
    const allChunksReceived = receivedChunks === session.totalChunks;

    if (!finalize && !allChunksReceived) {
      return jsonSuccess({
        status: "chunk_received",
        sessionId,
        receivedChunks,
        totalChunks: session.totalChunks,
      });
    }

    if (!allChunksReceived) {
      return jsonError("Missing chunks before finalize", "invalid_request_error", 400);
    }

    const mergedAudio = concatBase64Chunks(session.chunks);
    speechChunkSessions.delete(sessionId);
    if (!mergedAudio) {
      return jsonError("Invalid chunk payload", "invalid_request_error", 400);
    }
    const envelopeError = validateAudioEnvelope(
      session.mimeType,
      session.durationMs,
      mergedAudio.length,
    );
    if (envelopeError) return envelopeError;

    if (session.transcriptHint) {
      return jsonSuccess({
        transcript: session.transcriptHint,
        confidence: 0.74,
        source: "hint",
        durationMs: session.durationMs,
        bytes: mergedAudio.length,
      });
    }
    return makeUnavailableTranscriptionError(session.language);
  }

  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const durationMs = parseDuration(body.durationMs);
  if (!audioBase64) {
    return jsonError("audioBase64 is required", "invalid_request_error", 400);
  }

  const estimatedBytes = estimateBase64Bytes(audioBase64);
  const envelopeError = validateAudioEnvelope(mimeType, durationMs, estimatedBytes);
  if (envelopeError) return envelopeError;
  const decodedAudio = decodeBase64(audioBase64);
  if (!decodedAudio) {
    return jsonError("Invalid audio payload", "invalid_request_error", 400);
  }

  if (transcriptHint) {
    return jsonSuccess({
      transcript: transcriptHint,
      confidence: 0.74,
      source: "hint",
      durationMs,
      bytes: decodedAudio.length,
    });
  }
  return makeUnavailableTranscriptionError(language);
}

export async function handleSpeechPronunciation(
  request: Request,
  _env: Env,
): Promise<Response> {
  const jsonErrorResponse = requireJson(request);
  if (jsonErrorResponse) return jsonErrorResponse;

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body) {
    return jsonError("Invalid JSON body", "invalid_request_error", 400);
  }

  const language = normalizeLanguage(body.language);
  const transcript = normalizeTranscript(body.transcript);
  const referenceText = normalizeTranscript(body.referenceText);
  if (!transcript) {
    return jsonError("transcript is required", "invalid_request_error", 400);
  }
  if (transcript.length > MAX_TEXT_CHARS || referenceText.length > MAX_TEXT_CHARS) {
    return jsonError(
      `Text length must be <= ${MAX_TEXT_CHARS} characters`,
      "invalid_request_error",
      400,
    );
  }

  const result = scorePronunciation(transcript, referenceText);
  const drills = buildDrills(language, result.missingWords, result.score);
  const feedback = buildFeedback(
    language,
    result.score,
    result.intelligibility,
    result.acceptedVariants,
    result.missingWords,
  );

  return jsonSuccess({
    ...result,
    feedback,
    drills,
    policy: "intelligibility_first",
  });
}

export async function handleSpeechSynthesize(
  request: Request,
  _env: Env,
): Promise<Response> {
  const jsonErrorResponse = requireJson(request);
  if (jsonErrorResponse) return jsonErrorResponse;

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (!body) {
    return jsonError("Invalid JSON body", "invalid_request_error", 400);
  }
  const language = normalizeLanguage(body.language);
  const voice =
    typeof body.voice === "string" && body.voice.trim().length > 0
      ? body.voice.trim()
      : language === "en"
        ? "en-US-neutral"
        : "es-ES-neutral";
  const text = normalizeTranscript(body.text);
  if (!text) {
    return jsonError("text is required", "invalid_request_error", 400);
  }
  if (text.length > MAX_TEXT_CHARS) {
    return jsonError(
      `text must be <= ${MAX_TEXT_CHARS} characters`,
      "invalid_request_error",
      400,
    );
  }

  return jsonSuccess({
    mode: "client_tts",
    language,
    voice,
    text,
    hint:
      language === "en"
        ? "Use browser SpeechSynthesis with this text and voice preference."
        : "Usa SpeechSynthesis del navegador con este texto y preferencia de voz.",
  });
}
