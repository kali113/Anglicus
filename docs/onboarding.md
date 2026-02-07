# Onboarding / Incorporación

## Objetivo / Goal
ES: Detectar nivel y áreas débiles en la primera sesión.
EN: Detect the learner's level and weak areas in the first session.

## Flujo / Flow
1. **Bienvenida / Welcome**
2. **Autoevaluación / Self-assessment** (nivel aproximado)
3. **Diagnóstico / Diagnostic** (5-10 preguntas)
4. **Metas / Goals** (viaje, trabajo, estudios, etc.)
5. **Perfil / Profile** guardado localmente

## Perfil ejemplo / Example profile
```json
{
  "name": "María",
  "level": "B1",
  "nativeLanguage": "es",
  "goals": ["work", "travel"],
  "weakAreas": ["articles", "present_perfect", "false_friends"],
  "createdAt": "2026-02-03"
}
```

## Prompt corto / Short prompt
```
You are an English tutor for Spanish speakers.
Ask 5 diagnostic questions about articles, verb tenses, prepositions, and false friends.
Explain mistakes briefly in Spanish and summarize the result as JSON.
```
