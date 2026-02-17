import type { LanguageCode } from "$lib/types/user";
import { getLanguageLabel } from "$lib/types/user";

export function getWelcomeMessage(
  lessonId: string,
  targetLanguage: LanguageCode = "en",
  userName?: string,
): string {
  const topic = lessonId.replace(/-/g, " ");
  const resolvedName = userName?.trim();
  if (targetLanguage === "es") {
    if (resolvedName) {
      return `Hola, ${resolvedName}! Soy tu tutor de espanol. Hoy practicamos **${topic}**. \n\nPuedo ayudarte con conversacion, corregir tu gramatica y explicar palabras nuevas. Con que quieres empezar?`;
    }
    return `Hola! Soy tu tutor de espanol. Hoy practicamos **${topic}**. \n\nPuedo ayudarte con conversacion, corregir tu gramatica y explicar palabras nuevas. Con que quieres empezar?`;
  }
  if (resolvedName) {
    return `Hello, ${resolvedName}! I'm your English tutor. Today we are learning about **${topic}**. \n\nI can help you practice conversations, correct your grammar, or explain new words. What would you like to start with?`;
  }
  return `Hello! I'm your English tutor. Today we are learning about **${topic}**. \n\nI can help you practice conversations, correct your grammar, or explain new words. What would you like to start with?`;
}

export function getSystemPrompt(
  lessonId: string,
  targetLanguage: LanguageCode = "en",
  userName?: string,
): string {
  const targetLabel = getLanguageLabel(targetLanguage, "en");
  const resolvedName = userName?.trim();
  return `You are a helpful and encouraging ${targetLabel} language tutor for a student learning "${lessonId}". 
    Level: Beginner/Intermediate.
    Goal: Help them practice conversation, correct mistakes gently, and explain concepts simply.
    Keep responses concise (under 50 words usually) unless explaining a complex concept.
    If the user makes a mistake, correct it politely.
    Encourage them to speak more.
    ${resolvedName ? `Address the student by name (${resolvedName}) naturally in your replies.` : ""}`;
}
