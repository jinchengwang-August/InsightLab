type DiscoveryIdentity = { identityKey:string } | null;

export async function getPublishedValidations(user: DiscoveryIdentity, db: D1Database) {
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const result = await db.prepare(`SELECT
    v.id, v.title, v.description, v.category, v.status, v.study_type,
    v.reward_points, v.signal_score, v.survey_json,
    (SELECT COUNT(*) FROM responses r WHERE r.validation_id = v.id) AS response_count
    FROM validations v
    WHERE v.status = 'published' AND v.visibility = 'public'
    ORDER BY v.created_at DESC, v.id DESC LIMIT 50`).all();
  return Response.json({ validations: result.results });
}
