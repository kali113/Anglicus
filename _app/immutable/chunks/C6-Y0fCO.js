import{S as a}from"./pPOLttk4.js";class o{user;constructor(t){this.user=t}generateSystemPrompt(t){const s=this.getLevelContext(),e=this.getVocabularyContext(),n=this.getPedagogicalStrategy();return`
You are Anglicus, an expert English tutor for a Spanish-speaking user.
Your goal is to help the user learn English through the activity: "${t}".

${s}

${e}

${n}

IMPORTANT:
- Always be encouraging and patient.
- Correct mistakes gently.
- If the user switches to Spanish, respond in ${this.user.level==="A1"?"Spanish":"English (with simple Spanish explanations if needed)"}.
- Output should be structured and easy to read.
`.trim()}getVocabularyContext(){const t=(this.user.skills||[]).filter(e=>e.status==="completed").map(e=>e.id),s=a.filter(e=>t.includes(e.id)).map(e=>e.name).join(", ");return s?`
KNOWN CONCEPTS:
The user has mastered the following topics: ${s}.
You can freely use vocabulary and grammar related to these topics.
Avoid advanced concepts not listed here unless you explain them first.
`.trim():"User is a complete beginner. Assume no prior vocabulary."}getLevelContext(){const t=this.user.level||"A1",s={A1:"USER LEVEL: A1 (Beginner). Use very simple sentences. Focus on basic vocabulary. Speak slowly (implied by text).",A2:"USER LEVEL: A2 (Elementary). Use simple phrases and everyday vocabulary. Can understand sentence structure but needs clarity.",B1:"USER LEVEL: B1 (Intermediate). Can understand standard inputs on familiar matters. You can use compound sentences.",B2:"USER LEVEL: B2 (Upper Intermediate). Can understand complex text. You can converse naturally but avoid obscure idioms.",C1:"USER LEVEL: C1 (Advanced). User is proficient. challenge them with nuanced language.",C2:"USER LEVEL: C2 (Mastery). User is essentially native-level. No restrictions."};return s[t]||s.A1}getPedagogicalStrategy(){return this.user.streakDays>7?"PEDAGOGY: The user is consistent and motivated. Challenge them slightly more to keep them engaged.":!this.user.skills||this.user.skills.length<3?"PEDAGOGY: The user is just starting. Focus on building confidence with easy wins.":"PEDAGOGY: Maintain a balanced scaffolding approach. Support new concepts with known ones."}}export{o as C};
