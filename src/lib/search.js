import { supabase } from './supabase';

export async function searchPeople(q, selfId) {
  const t = String(q || '').toLowerCase().replace(/[^a-z0-9_ ]/g, ' ').trim().replace(/\s+/g, ' ');
  if (t.length < 2) return { ok: true, data: [] };
  try {
    let query = supabase.from('profiles').select('id, username, first_name, last_name, avatar_url').limit(20);
    if (selfId) query = query.neq('id', selfId);
    for (const w of t.split(' ').slice(0, 3)) {
      query = query.or('username.ilike.%' + w + '%,first_name.ilike.%' + w + '%,last_name.ilike.%' + w + '%');
    }
    const { data, error } = await query;
    if (error) return { ok: false, error: error.message || 'Search failed.' };
    return { ok: true, data: data || [] };
  } catch (e) {
    return { ok: false, error: 'Network problem. Check your connection and try again.' };
  }
}
