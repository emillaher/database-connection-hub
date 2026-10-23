// Mirrors the helpers in public/legacy/app.js (keep both in sync).

/** WS runs Oct–Feb (key WS<startYear>), SS runs Mar–Sep (key SS<year>). */
export function semesterKeyFromDate(d: Date): string {
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  if (m >= 10) return `WS${y}`;
  if (m <= 2) return `WS${y - 1}`;
  return `SS${y}`;
}

export function semesterLabel(key: string): string {
  const y = parseInt(key.slice(2), 10);
  if (key.startsWith("WS")) return `WS ${y}/${String((y + 1) % 100).padStart(2, "0")}`;
  return `SS ${y}`;
}

/** ECTS-weighted average of grades 1–5; courses without grade or ECTS are ignored. */
export function weightedGradeAverage(courses: { ects?: number | null; grade?: number | null }[]): number | null {
  let sum = 0;
  let ects = 0;
  for (const c of courses) {
    const g = Number(c.grade);
    const e = Number(c.ects);
    if (!g || !e || g < 1 || g > 5 || e <= 0) continue;
    sum += g * e;
    ects += e;
  }
  return ects > 0 ? sum / ects : null;
}
