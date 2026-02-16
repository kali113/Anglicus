import { describe, expect, it } from "vitest";
import { handleSpeechPronunciation, handleSpeechSynthesize, handleSpeechTranscribe } from "./speech.js";

function createJsonRequest(
  body: Record<string, unknown>,
  contentType: string = "application/json",
): Request {
  return new Request("http://test", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });
}

describe("speech routes", () => {
  it("rejects non-json transcription requests", async () => {
    const response = await handleSpeechTranscribe(
      createJsonRequest({ audioBase64: "aGVsbG8=", mimeType: "audio/webm", durationMs: 2000 }, "text/plain"),
      {},
    );
    expect(response.status).toBe(415);
  });

  it("transcribes using transcript hints", async () => {
    const response = await handleSpeechTranscribe(
      createJsonRequest({
        audioBase64: "aGVsbG8=",
        mimeType: "audio/webm;codecs=opus",
        durationMs: 1800,
        transcriptHint: "Hello teacher",
        language: "en",
      }),
      {},
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      transcript: string;
      source: string;
    };
    expect(data.transcript).toBe("Hello teacher");
    expect(data.source).toBe("hint");
  });

  it("supports chunked transcription uploads", async () => {
    const firstChunkResponse = await handleSpeechTranscribe(
      createJsonRequest({
        sessionId: "session-1",
        chunkBase64: "aGVs",
        chunkIndex: 0,
        totalChunks: 2,
        durationMs: 2500,
        mimeType: "audio/webm",
        transcriptHint: "hello there",
      }),
      {},
    );
    expect(firstChunkResponse.status).toBe(200);
    const firstPayload = (await firstChunkResponse.json()) as { status: string };
    expect(firstPayload.status).toBe("chunk_received");

    const finalChunkResponse = await handleSpeechTranscribe(
      createJsonRequest({
        sessionId: "session-1",
        chunkBase64: "bG8h",
        chunkIndex: 1,
        totalChunks: 2,
        finalize: true,
      }),
      {},
    );
    expect(finalChunkResponse.status).toBe(200);
    const finalPayload = (await finalChunkResponse.json()) as { transcript: string };
    expect(finalPayload.transcript).toBe("hello there");
  });

  it("enforces recording duration limits", async () => {
    const response = await handleSpeechTranscribe(
      createJsonRequest({
        audioBase64: "aGVsbG8=",
        mimeType: "audio/webm",
        durationMs: 100_000,
      }),
      {},
    );
    expect(response.status).toBe(400);
  });

  it("scores pronunciation with accent-aware normalization", async () => {
    const response = await handleSpeechPronunciation(
      createJsonRequest({
        transcript: "My favourite colour is blue",
        referenceText: "My favorite color is blue",
        language: "en",
      }),
      {},
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      score: number;
      acceptedVariants: string[];
      policy: string;
    };
    expect(data.score).toBeGreaterThanOrEqual(80);
    expect(data.acceptedVariants.length).toBeGreaterThan(0);
    expect(data.policy).toBe("intelligibility_first");
  });

  it("requires pronunciation transcript text", async () => {
    const response = await handleSpeechPronunciation(
      createJsonRequest({ referenceText: "hello world" }),
      {},
    );
    expect(response.status).toBe(400);
  });

  it("returns client-side synthesis instructions", async () => {
    const response = await handleSpeechSynthesize(
      createJsonRequest({
        text: "Practice this sentence",
        language: "en",
      }),
      {},
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as { mode: string; text: string };
    expect(data.mode).toBe("client_tts");
    expect(data.text).toBe("Practice this sentence");
  });
});
