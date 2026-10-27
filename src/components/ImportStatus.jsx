import React from 'react';
import { Ban, CircleHelp, CircleSlash, CircleCheck, Plus, Link2 } from 'lucide-react';

// One visual vocabulary for both review tables. Icons keep meaning visible without color.
const icons = { blocked: Ban, review: CircleHelp, excluded: CircleSlash, connected: CircleCheck, new: Plus, candidate: Link2 };
export default function ImportStatus({ tone, children, description }) {
  const Icon = icons[tone] || CircleHelp;
  return <span className={`import-status ${tone}`} aria-label={description ? `${children}: ${description}` : undefined}>
    <Icon size={14} aria-hidden="true" strokeWidth={2.2} />{children}
  </span>;
}
