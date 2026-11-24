import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export default function ClockWidget() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now);
  const date = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(now);
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(now);
  return (
    <section className="glass card wd-clock" aria-label="Date and time">
      <span className="sec-ic"><Clock size={18} /></span>
      <div className="row-main"><b className="wd-time">{time}</b><span>{day}, {date}</span></div>
    </section>
  );
}
