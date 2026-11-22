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
export const setFlags = (cid, f) => call('set_conversation_flags', { p_conversation: cid, ...f });
export const togglePin = (id) => call('toggle_pin_message', { p_message: id });
export const listPins = (cid) => call('list_pins', { p_conversation: cid });
export const forwardMessage = (id, cid, clientId) => call('forward_message', { p_message: id, p_conversation: cid, p_client_id: clientId });
export const searchMessages = (cid, q) => call('search_messages', { p_conversation: cid, p_q: q });
export const scheduleMessage = (cid, body, at) => call('schedule_message', { p_conversation: cid, p_body: body, p_send_at: at });
export const listScheduled = (cid = null) => call('list_scheduled', { p_conversation: cid });
export const cancelScheduled = (id) => call('cancel_scheduled', { p_id: id });
export const createReminder = (note, at, cid = null, mid = null) => call('create_reminder', { p_note: note, p_remind_at: at, p_conversation: cid, p_message: mid });
export const listReminders = () => call('list_reminders');
export const cancelReminder = (id) => call('cancel_reminder', { p_id: id });
export const createPoll = (cid, q, options, multiple, clientId) => call('create_poll', { p_conversation: cid, p_question: q, p_options: options, p_multiple: multiple, p_client_id: clientId });
export const votePoll = (pid, oid) => call('vote_poll', { p_poll: pid, p_option: oid });
export const closePoll = (pid) => call('close_poll', { p_poll: pid });
export const listThread = (rid) => call('list_thread', { p_root: rid });
export const sendThreadReply = (rid, body, clientId) => call('send_thread_reply', { p_root: rid, p_body: body, p_client_id: clientId });
export const sendAttachment = (cid, path, name, mime, size, clientId) => call('send_attachment', { p_conversation: cid, p_path: path, p_name: name, p_mime: mime, p_size: size, p_client_id: clientId });
export const getMyCode = () => call('get_my_code');
export const regenerateMyCode = () => call('regenerate_my_code');
export const lookupCode = (code) => call('lookup_code', { p_code: code });
export const sendContactRequest = (uid) => call('send_contact_request', { p_user: uid });
export const respondContactRequest = (id, accept) => call('respond_contact_request', { p_id: id, p_accept: accept });
export const cancelContactRequest = (id) => call('cancel_contact_request', { p_id: id });
export const removeContact = (uid) => call('remove_contact', { p_user: uid });
export const setFavorite = (uid, on) => call('set_favorite', { p_user: uid, p_on: on });
export const listLabels = () => call('list_labels');
export const createLabel = (name) => call('create_label', { p_name: name });
export const renameLabel = (id, name) => call('rename_label', { p_id: id, p_name: name });
export const deleteLabel = (id) => call('delete_label', { p_id: id });
export const setContactLabel = (uid, labelId) => call('set_contact_label', { p_user: uid, p_label: labelId });
export const blockUser = (uid) => call('block_user', { p_user: uid });
export const unblockUser = (uid) => call('unblock_user', { p_user: uid });
export const listBlocks = () => call('list_blocks');
export const listContacts = () => call('list_contacts');
export const listRequests = () => call('list_requests');
export const contactRelations = (ids) => call('contact_relations', { p_ids: ids });
export const mutualContacts = (uid) => call('mutual_contacts', { p_user: uid });
