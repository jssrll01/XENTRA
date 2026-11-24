import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PlannerPage({ title, children }) {
  return (
    <div className="hm">
      <div className="hm-bar">
        <Link to="/home" className="icon-btn" aria-label="Back to Home"><ArrowLeft size={20} /></Link>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
