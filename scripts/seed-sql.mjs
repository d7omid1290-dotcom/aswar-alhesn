// يولّد supabase/seed.sql من بنك الأسئلة المدمج: node scripts/seed-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/lib/game/questions.ts', import.meta.url), 'utf8');
const rows = [...src.matchAll(/\{id: "q\d+",c: (".*?"),l: (\d),q: (".*?"),a: (".*?"),w: (\[.*?\])\}/g)];
const lit = (s) => `'${JSON.parse(s).replace(/'/g, "''")}'`;
const arr = (s) => `array[${JSON.parse(s).map((x) => `'${x.replace(/'/g, "''")}'`).join(', ')}]::text[]`;
const values = rows.map(([, c, l, q, a, w]) => `  (${lit(c)}, ${l}, ${lit(q)}, ${lit(a)}, ${arr(w)})`).join(',\n');
writeFileSync(new URL('../supabase/seed.sql', import.meta.url),
  `-- بنك الأسئلة الأولي (${rows.length} سؤالًا)\ninsert into public.questions (category, level, question, answer, wrong) values\n${values};\n`);
console.log('seed.sql:', rows.length, 'questions');
