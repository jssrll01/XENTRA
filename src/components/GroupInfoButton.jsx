import React from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';

export default function GroupInfoButton({ id }) {
  return <Link className="grp-info-btn" to={'/groups/' + id + '/info'} aria-label="Group info"><Info size={20} /></Link>;
}
