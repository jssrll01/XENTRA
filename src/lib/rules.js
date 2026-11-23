import { getTeamRules, acceptTeamRules, joinTeam, joinTeamByCode } from './api';

async function accept(id) {
  const g = await getTeamRules(id);
  if (!g.ok) return g;
  if (g.data.rules && !g.data.accepted) {
    if (!window.confirm('Community rules:\n\n' + g.data.rules + '\n\nDo you accept these rules?')) return { ok: false, error: 'Accept the rules to join.' };
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
