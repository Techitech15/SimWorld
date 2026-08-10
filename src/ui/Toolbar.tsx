import { techForBuilding } from '../core/research';
import { useGameStore } from '../store/gameStore';
import type { Tool } from '../store/gameStore';
import {
  BUILD_CATEGORIES,
  BUILD_MENU,
  buildMenuHint,
  buildMenuLabel,
  useBuildCategoryStore,
} from './buildMenu';
import type { BuildMenuTool } from './buildMenu';
import { icons } from './icons';
import { useStrings } from './language';

// zone tools keep the icons of the jobs they create; buildings share one
const MENU_ICONS: Record<BuildMenuTool['kind'], string> = {
  build: icons.build,
  storage: icons.haul,
  pasture: icons.handle,
};

function sameTool(a: Tool, b: Tool): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'designate' && b.kind === 'designate') return a.designation === b.designation;
  if (a.kind === 'animal' && b.kind === 'animal') return a.designation === b.designation;
  if (a.kind === 'build' && b.kind === 'build') return a.building === b.building;
  return true;
}

export function Toolbar(): React.JSX.Element {
  const tool = useGameStore((s) => s.tool);
  const setTool = useGameStore((s) => s.setTool);
  const category = useBuildCategoryStore((s) => s.category);
  const setCategory = useBuildCategoryStore((s) => s.setCategory);
  // a joined string, not the array: this selector runs every tick and a fresh
  // array reference would never compare equal (the same reason ResearchPanel
  // joins its rows)
  const unlockedJoined = useGameStore((s) => s.state.research.unlocked.join(','));
  const strings = useStrings();

  const button = (
    candidate: Tool,
    label: string,
    iconUrl?: string,
    title?: string,
    locked?: boolean,
  ) => (
    <button
      key={label}
      type="button"
      title={title ?? label}
      className={`${sameTool(tool, candidate) ? 'tool active' : 'tool'}${locked ? ' tool--locked' : ''}`}
      onClick={() => setTool(candidate)}
    >
      {iconUrl ? <img src={iconUrl} alt="" width={20} height={20} /> : null}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        <h3>{strings.ordersGroup}</h3>
        {button({ kind: 'select' }, strings.toolSelect, undefined, strings.toolSelectHint)}
        {button({ kind: 'designate', designation: 'chop' }, strings.toolChop, icons.chop, strings.toolChopHint)}
        {button({ kind: 'designate', designation: 'mine' }, strings.toolMine, icons.mine, strings.toolMineHint)}
        {button(
          { kind: 'designate', designation: 'deconstruct' },
          strings.toolDeconstruct,
          icons.deconstruct,
          strings.toolDeconstructHint,
        )}
        {button({ kind: 'clearDesignation' }, strings.toolClear)}
      </div>

      <div className="toolbar__group">
        <h3>{strings.buildGroup}</h3>
        <div className="toolbar__categories">
          {BUILD_CATEGORIES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={candidate === category ? 'toolbar__category active' : 'toolbar__category'}
              onClick={() => setCategory(candidate)}
            >
              {strings.buildCategoryLabels[candidate]}
            </button>
          ))}
        </div>
        {BUILD_MENU.filter((entry) => entry.category === category).map((entry) => {
          // grey it out rather than hide it (design-phase12-research.md 3.3):
          // "here is something, here is how to unlock it" is the whole point
          const tech =
            entry.tool.kind === 'build' ? techForBuilding(entry.tool.building) : undefined;
          const locked = !!tech && !unlockedJoined.split(',').includes(tech);
          return button(
            entry.tool,
            buildMenuLabel(strings, entry),
            MENU_ICONS[entry.tool.kind],
            locked ? strings.lockedHint(strings.techLabels[tech]) : buildMenuHint(strings, entry),
            locked,
          );
        })}
        {button({ kind: 'cancel' }, strings.toolCancel, undefined, strings.toolCancelHint)}
      </div>

      <div className="toolbar__group">
        <h3>{strings.animalsGroup}</h3>
        {button({ kind: 'animal', designation: 'hunt' }, strings.toolHunt, icons.hunt, strings.toolHuntHint)}
        {button({ kind: 'animal', designation: 'tame' }, strings.toolTame, icons.handle, strings.toolTameHint)}
        {button(
          { kind: 'animal', designation: 'slaughter' },
          strings.toolSlaughter,
          icons.handle,
          strings.toolSlaughterHint,
        )}
        {button({ kind: 'clearAnimal' }, strings.toolClearMarks)}
      </div>

      <p className="toolbar__hint muted">
        {strings.toolbarHintDrag}
        <br />
        {strings.toolbarHintKeys}
      </p>
    </div>
  );
}
