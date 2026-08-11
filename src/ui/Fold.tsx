// A panel that can be put away (docs/design-phase6-space.md 4.2).
//
// The sidebar had eleven panels stacked in one 300px column with no way to
// close any of them, so the ones you wanted were always below the ones you did
// not. This wraps a panel in its own heading-as-button; the fold state lives in
// localStorage (see panelState.ts) and never in the save.
import type { ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { defaultOpenFrom, usePanelFold } from './panelState';
import type { PanelId } from './panelState';

export function Fold({
  id,
  title,
  /** shown beside the title while folded, so a closed panel still says something */
  badge,
  children,
}: {
  id: PanelId;
  title: string;
  badge?: string;
  children: ReactNode;
}): React.JSX.Element {
  // Narrow selectors only. Reading `s.state` here would subscribe every panel
  // to every tick; these are the whole of what `defaultOpen` looks at.
  const colonists = useGameStore((s) => Object.keys(s.state.colonists).length);
  const anyTame = useGameStore((s) => Object.values(s.state.animals).some((a) => a.tame));
  const hasResearchDesk = useGameStore((s) =>
    Object.values(s.state.buildings).some((b) => b.type === 'researchDesk' && !b.isBlueprint),
  );
  const { open, toggle } = usePanelFold(
    id,
    defaultOpenFrom(id, { colonists, anyTame, hasResearchDesk }),
  );
  return (
    <section className={`panel fold${open ? '' : ' fold--closed'}`}>
      <button type="button" className="fold__head" onClick={toggle} aria-expanded={open}>
        <span className="fold__caret">{open ? '▾' : '▸'}</span>
        <span className="fold__title">{title}</span>
        {badge ? <span className="fold__badge">{badge}</span> : null}
      </button>
      {open ? <div className="fold__body">{children}</div> : null}
    </section>
  );
}
