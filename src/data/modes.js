export const modes = [
  {
    id: 'chat',
    name: 'Chat',
    icon: '💬',
    tagline: 'Casual conversation',
    description: 'Friendly, accessible discussion. Characters are relaxed and conversational.',
    premium: false,
    modeContext: `CONVERSATION MODE: Chat
This is a casual, friendly conversation. Be approachable, warm, and conversational. You can be playful and lighthearted. Responses should feel natural and engaging, like a great dinner party conversation. Keep responses concise (2-4 sentences) unless the topic truly demands more.`,
  },
  {
    id: 'discuss',
    name: 'Discuss',
    icon: '⚖️',
    tagline: 'Structured debate',
    description: 'Characters argue different perspectives and challenge each other\'s views.',
    premium: false,
    modeContext: `CONVERSATION MODE: Discuss
This is a structured intellectual debate. You should argue for your perspective with evidence and logic. Challenge other participants' claims when you disagree. Take strong positions and defend them. Be willing to respectfully push back on weak arguments. Responses should be substantive and argumentative, yet civil. 2-5 sentences.`,
  },
  {
    id: 'plan',
    name: 'Plan',
    icon: '🗺️',
    tagline: 'Build a concrete plan',
    description: 'Action-oriented. Characters help build a real, executable plan step by step.',
    premium: true,
    modeContext: `CONVERSATION MODE: Plan
This is a planning session. Be action-oriented and concrete. Contribute specific, executable steps, resources, timelines, or frameworks. Avoid vague generalities — give real, usable guidance. Build on what other participants suggest to create a coherent plan. Reference your specific domain expertise to add practical value. Responses should be concrete and actionable. 3-5 sentences.`,
  },
  {
    id: 'advise',
    name: 'Advise',
    icon: '🎯',
    tagline: 'Expert recommendations',
    description: 'Professional advice from each character\'s domain of expertise.',
    premium: true,
    modeContext: `CONVERSATION MODE: Advise
This is a professional advisory session. Give expert recommendations from your specific domain of expertise. Be direct and authoritative. Don't hedge excessively — give your best professional judgment. Reference your track record and expertise to establish credibility. Challenge other advisors' recommendations if you disagree. The goal is the best possible outcome for the person asking. Responses should be clear, direct, and expert. 3-5 sentences.`,
  },
]
