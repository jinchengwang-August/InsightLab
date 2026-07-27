function clamp(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }

export async function POST(request: Request) {
  const { response = "" } = await request.json() as { response?: string };
  const text = response.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const specificity = clamp(30 + Math.min(words.length, 80) * .65 + (/\d|because|example|when|如果|因为/.test(text) ? 18 : 0));
  const constructiveness = clamp(38 + (/(suggest|could|recommend|improve|建议|可以|改进)/i.test(text) ? 34 : 0) + Math.min(words.length, 50) * .35);
  const repetitionPenalty = new Set(words.map(w => w.toLowerCase())).size / Math.max(words.length, 1) < .45 ? 28 : 0;
  const integrity = clamp((specificity + constructiveness) / 2 - repetitionPenalty);
  return Response.json({
    scores: { specificity, constructiveness, integrity },
    weight: integrity >= 80 ? 1.25 : integrity >= 55 ? 1 : .45,
    flags: repetitionPenalty ? ["possible_repetition"] : [],
    note: "This transparent baseline is designed to be replaced or augmented by a trained moderation model as labeled response data grows."
  });
}
