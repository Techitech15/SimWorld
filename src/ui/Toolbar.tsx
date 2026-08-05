import { BUILDING_COSTS } from '../core/constants';
import type { BuildingType } from '../core/types';
import { useGameStore } from '../store/gameStore';
import type { Tool } from '../store/gameStore';
import { icons } from './icons';

const BUILDINGS: { type: BuildingType; label: string }[] = [
  { type: 'wall', label: 'Wall' },
  { type: 'stoneWall', label: 'Stone wall' },
  { type: 'floor', label: 'Floor' },
  { type: 'stoneFloor', label: 'Stone floor' },
  { type: 'door', label: 'Door' },
  { type: 'bed', label: 'Bed' },
  { type: 'farmPlot', label: 'Farm' },
];

function costLabel(type: BuildingType): string {
  const costs = BUILDING_COSTS[type];
  if (costs.length === 0) return 'free';
  return costs.map((c) => `${c.quantity} ${c.type}`).join(', ');
}

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

  const button = (candidate: Tool, label: string, iconUrl?: string, title?: string) => (
    <button
      key={label}
      type="button"
      title={title ?? label}
      className={sameTool(tool, candidate) ? 'tool active' : 'tool'}
      onClick={() => setTool(candidate)}
    >
      {iconUrl ? <img src={iconUrl} alt="" width={20} height={20} /> : null}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        <h3>Orders</h3>
        {button({ kind: 'select' }, 'Select', undefined, 'Select a colonist, then click to move')}
        {button({ kind: 'designate', designation: 'chop' }, 'Chop', icons.chop, 'Designate forest')}
        {button({ kind: 'designate', designation: 'mine' }, 'Mine', icons.mine, 'Designate stone')}
        {button(
          { kind: 'designate', designation: 'deconstruct' },
          'Deconstruct',
          icons.deconstruct,
          'Dismantle a finished building and get half the materials back',
        )}
        {button({ kind: 'clearDesignation' }, 'Clear')}
      </div>

      <div className="toolbar__group">
        <h3>Build</h3>
        {BUILDINGS.map((b) =>
          button(
            { kind: 'build', building: b.type },
            b.label,
            icons.build,
            `${b.label} — ${costLabel(b.type)}`,
          ),
        )}
        {button({ kind: 'storage' }, 'Storage', icons.haul, 'Storage zone (free)')}
        {button({ kind: 'pasture' }, 'Pasture', icons.handle, 'Pasture zone on grass (free)')}
        {button({ kind: 'cancel' }, 'Cancel', undefined, 'Remove blueprints and zone tiles')}
      </div>

      <div className="toolbar__group">
        <h3>Animals</h3>
        {button(
          { kind: 'animal', designation: 'hunt' },
          'Hunt',
          icons.hunt,
          'Mark wild animals to be hunted for meat',
        )}
        {button(
          { kind: 'animal', designation: 'tame' },
          'Tame',
          icons.handle,
          'Mark wild animals to be tamed (wolves cannot be tamed)',
        )}
        {button(
          { kind: 'animal', designation: 'slaughter' },
          'Slaughter',
          icons.handle,
          'Mark tamed animals to be slaughtered',
        )}
        {button({ kind: 'clearAnimal' }, 'Clear marks')}
      </div>

      <p className="toolbar__hint muted">
        Drag to apply a tool over an area. Right-drag or shift-drag pans, wheel zooms; WASD or the
        arrow keys pan too.
        <br />
        Keys: space pauses, 1/2/3 set speed, Esc selects. c chop, m mine, x deconstruct, q clear,
        b wall, f floor, r door, n bed, v farm, z storage, p pasture, e cancel, h hunt, t tame,
        k slaughter.
      </p>
    </div>
  );
}
