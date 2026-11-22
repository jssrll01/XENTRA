import React from 'react';
import { Link } from 'react-router-dom';
import { BellOff, Pin } from 'lucide-react';
import Avatar from './ui/Avatar';
import { fullName } from '../lib/format';
import { listTime } from '../lib/chatTime';
import usePresence from '../lib/usePresence';
import { draftOf, useDrafts } from '../lib/drafts';

export default function ConvRow({ c, meId }) {
  const name = fullName(c.other);
  const pr = usePresence(c.other.is_group || c.other.is_channel ? null : c.other.id);
  const last = c.last;
  useDrafts();
  const draft = draftOf(c.id);
  const who = !last ? '' : last.sender_id === meId ? 'You: ' : (c.other.is_group && last.sender_name ? last.sender_name + ': ' : '');
  const text = !last ? 'No messages yet' : last.deleted ? 'Message deleted' : who + last.body;
  return (
    <Link className="row" to={'/messages/' + c.id}>
      <Avatar name={name} url={c.other.avatar_url} size={46} presence={pr && (pr.state === 'online' || pr.state === 'dnd') ? pr.state : undefined} />
      <div className="row-main"><b>{name}{c.pinned ? <Pin size={13} className="ci" /> : null}{c.muted ? <BellOff size={13} className="ci" /> : null}</b><span>{draft ? 'Draft: ' + draft : text}</span></div>
      <div className="row-side">
        <span className="row-time">{listTime(c.last_message_at)}</span>
        {c.unread > 0 ? <span className={'badge' + (c.muted ? ' off' : '')}>{c.unread > 99 ? '99+' : c.unread}</span> : null}
      </div>
    </Link>
  );
}
