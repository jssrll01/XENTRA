import { supabase } from './supabase';

/*
 * DATA CONTRACT. Every backend call lives here. The SQL phase implements exactly these functions.
 * Every RPC returns jsonb: { ok: true, data: <payload> } or { ok: false, error: '<message>' }.
 *
 * get_my_profile()            -> { id, username, first_name, last_name, phone, avatar_url }
 * update_profile(p_first, p_last, p_username, p_phone) -> {}
 * set_avatar(p_url)           -> {}
 * home_summary()              -> { unread:{value,series[7]}, active:{..}, invites:{..}, scheduled:{..}, notifications:int }
 * list_notifications(p_limit) -> [{ id, type, title, body, link, read_at, created_at }]
 * mark_notifications_read(p_ids uuid[] | null) -> {}   (null = mark all)
 */

const NOT_READY = new Set(['PGRST202', 'PGRST205', '42883', '42P01']);

export async function call(name, args = {}) {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) {
      if (NOT_READY.has(error.code)) return { ok: false, notReady: true, error: 'The database is still being set up.' };
      return { ok: false, error: error.message || 'Request failed.' };
    }
    if (data && typeof data === 'object' && data.ok === false) return { ok: false, error: data.error || 'Request failed.' };
    const payload = data && typeof data === 'object' && 'data' in data ? data.data : data;
    return { ok: true, data: payload };
  } catch (e) {
    return { ok: false, error: 'Network problem. Check your connection and try again.' };
  }
}

export const getMyProfile = () => call('get_my_profile');
export const updateProfile = (p) => call('update_profile', { p_first: p.first, p_last: p.last, p_username: p.username, p_phone: p.phone || null });
export const setAvatar = (url) => call('set_avatar', { p_url: url });
export const homeSummary = () => call('home_summary');
export const listNotifications = (limit = 50) => call('list_notifications', { p_limit: limit });
export const markNotificationsRead = (ids = null) => call('mark_notifications_read', { p_ids: ids });
export const startDirect = (userId) => call('start_direct', { p_user: userId });
export const listConversations = () => call('list_conversations');
export const listMessages = (cid, before = null, limit = 50) => call('list_messages', { p_conversation: cid, p_before: before, p_limit: limit });
export const sendMessage = (cid, body, clientId, replyTo = null) => call('send_message', { p_conversation: cid, p_body: body, p_client_id: clientId, p_reply_to: replyTo });
export const editMessage = (id, body) => call('edit_message', { p_id: id, p_body: body });
export const deleteMessage = (id) => call('delete_message', { p_id: id });
export const markRead = (cid) => call('mark_read', { p_conversation: cid });
export const toggleReaction = (id, emoji) => call('toggle_reaction', { p_message: id, p_emoji: emoji });
