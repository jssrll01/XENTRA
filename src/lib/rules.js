import { askRules } from './rulesDialog';
import { getTeamRules, acceptTeamRules, joinTeam, joinTeamByCode } from './api';

async function accept(id) {
  const g = await getTeamRules(id);
  if (!g.ok) return g;
  if (g.data.rules && !g.data.accepted) {
    if (!await askRules(g.data.rules)) return { ok: false, error: 'Accept the rules to join.' };
    const a = await acceptTeamRules(id);
    if (!a.ok) return a;
  }
  return { ok: true, data: {} };
}

export async function joinWithRules(id) {
  const a = await accept(id);
  return a.ok ? joinTeam(id) : a;
}

export async function joinCodeWithRules(id, code) {
  const a = await accept(id);
  return a.ok ? joinTeamByCode(code) : a;
}
