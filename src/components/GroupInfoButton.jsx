import React from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';

export default function GroupInfoButton({ id, other }) {
  const to = other.is_channel ? '/teams/' + other.team_id : '/groups/' + id + '/info';
  return <Link className="icon-btn" to={to} aria-label={other.is_channel ? 'Team' : 'Group info'}><Info size={20} /></Link>;
}
