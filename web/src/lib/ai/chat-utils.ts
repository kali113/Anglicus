export function getWelcomeMessage(lessonId: string): string {
  const topic = lessonId.replace(/-/g, " ");
  return `Hello! I'm your English tutor. Today we are learning about **${topic}**. \n\nI can help you practice conversations, correct your grammar, or explain new words. What would you like to start with?`;
}

export function getSystemPrompt(lessonId: string): string {
  return `You are a helpful and encouraging English language tutor for a student learning "${lessonId}". 
    Level: Beginner/Intermediate.
    Goal: Help them practice conversation, correct mistakes gently, and explain concepts simply.
    Keep responses concise (under 50 words usually) unless explaining a complex concept.
    If the user makes a mistake, correct it politely.
    Encourage them to speak more.`;
}
