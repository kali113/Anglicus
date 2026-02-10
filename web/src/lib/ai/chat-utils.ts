import type { LanguageCode } from "$lib/types/user";
import { getLanguageLabel } from "$lib/types/user";

export function getWelcomeMessage(
  lessonId: string,
  targetLanguage: LanguageCode = "en",
): string {
  const topic = lessonId.replace(/-/g, " ");
  if (targetLanguage === "es") {
    return `Hola! Soy tu tutor de espanol. Hoy practicamos **${topic}**. \n\nPuedo ayudarte con conversacion, corregir tu gramatica y explicar palabras nuevas. Con que quieres empezar?`;
  }
  return `Hello! I'm your English tutor. Today we are learning about **${topic}**. \n\nI can help you practice conversations, correct your grammar, or explain new words. What would you like to start with?`;
}

export function getSystemPrompt(
  lessonId: string,
  targetLanguage: LanguageCode = "en",
): string {
  const targetLabel = getLanguageLabel(targetLanguage, "en");
  return `You are a helpful and encouraging ${targetLabel} language tutor for a student learning "${lessonId}". 
    Level: Beginner/Intermediate.
    Goal: Help them practice conversation, correct mistakes gently, and explain concepts simply.
    Keep responses concise (under 50 words usually) unless explaining a complex concept.
    If the user makes a mistake, correct it politely.
    Encourage them to speak more.`;
}
