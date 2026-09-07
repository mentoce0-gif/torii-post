/*
 * The developer's read on Time to Decision, straight from the database.
 *
 * Deliberately a CLI and not a dashboard: for a few dozen households, the
 * question is "is the median under 60 seconds yet", and that fits on a screen.
 *
 *   npm run metrics            reads DB_PATH (or ./data/poc.sqlite)
 *   npm run metrics -- --json  machine-readable
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.resolve(ROOT, process.env.DB_PATH ?? './data/poc.sqlite');
const asJson = process.argv.includes('--json');

const db = new DatabaseSync(dbPath, { readOnly: true });

const rows = db
  .prepare('SELECT time_to_decision_ms AS ms FROM decisions WHERE time_to_decision_ms IS NOT NULL')
  .all()
  .map((row) => Number(row.ms));

const sorted = [...rows].sort((a, b) => a - b);
const median = sorted.length
  ? sorted.length % 2
    ? sorted[(sorted.length - 1) / 2]
    : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
  : null;
const mean = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null;
const p90 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1)] : null;
const underTarget = sorted.filter((ms) => ms <= 60_000).length;

const decisions = Object.fromEntries(
  db.prepare('SELECT kind, COUNT(*) AS n FROM decisions GROUP BY kind').all().map((r) => [r.kind, Number(r.n)]),
);
const events = Object.fromEntries(
  db
    .prepare('SELECT name, COUNT(*) AS n FROM analytics_events GROUP BY name ORDER BY name')
    .all()
    .map((r) => [r.name, Number(r.n)]),
);
const subjective = Object.fromEntries(
  db.prepare('SELECT answer, COUNT(*) AS n FROM subjective_ratings GROUP BY answer').all().map((r) => [r.answer, Number(r.n)]),
);

const visits = Number(db.prepare('SELECT COUNT(*) AS n FROM visits').get().n);
const feedback = Number(db.prepare('SELECT COUNT(*) AS n FROM visit_feedback').get().n);
const households = Number(db.prepare('SELECT COUNT(*) AS n FROM households').get().n);

const summary = {
  dbPath,
  households,
  timeToDecision: {
    count: sorted.length,
    medianMs: median,
    meanMs: mean,
    p90Ms: p90,
    underTargetRate: sorted.length ? underTarget / sorted.length : null,
    targetMs: 60_000,
  },
  decisions,
  events,
  subjective,
  visits,
  feedback,
  feedbackRate: visits ? feedback / visits : null,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const s = (ms) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}秒`);
  const pct = (rate) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);
  console.log(`db: ${dbPath}`);
  console.log(`世帯数: ${households}`);
  console.log('');
  console.log('Time to Decision  (目標: 中央値 60秒以内)');
  console.log(`  件数    ${summary.timeToDecision.count}`);
  console.log(`  中央値  ${s(median)}`);
  console.log(`  平均    ${s(mean)}`);
  console.log(`  p90     ${s(p90)}`);
  console.log(`  60秒以内 ${pct(summary.timeToDecision.underTargetRate)}`);
  console.log('');
  console.log('判断');
  console.log(`  行く ${decisions.go ?? 0} / 見送る ${decisions.skip ?? 0} / いつもの場 ${decisions.usual ?? 0}`);
  console.log(`  実行後の記録率 ${pct(summary.feedbackRate)}  (${feedback}/${visits})`);
  console.log('');
  console.log('主観評価「普段より早く決められましたか？」');
  console.log(`  はい ${subjective.faster ?? 0} / 同じ ${subjective.same ?? 0} / 遅い ${subjective.slower ?? 0}`);
  console.log('');
  console.log('イベント');
  for (const [name, n] of Object.entries(events)) console.log(`  ${name.padEnd(26)} ${n}`);
}

db.close();
