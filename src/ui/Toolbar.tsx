import { BUILDING_COSTS } from '../core/constants';
import type { BuildingType } from '../core/types';
import { useGameStore } from '../store/gameStore';
import type { Tool } from '../store/gameStore';
import { icons } from './icons';
import { useStrings } from './language';
import type { Strings } from './strings';

// the one list of what the build menu offers; the names come from the dictionary
const BUILD_MENU: BuildingType[] = [
  'wall',
  'stoneWall',
  'floor',
  'stoneFloor',
  'door',
  'bed',
  'hearth',
  'farmPlot',
  'manaFurnace',
  'manaConduit',
  'manaLamp',
  'manaExtractor',
  'manaTurret',
];

function costLabel(strings: Strings, type: BuildingType): string {
  const costs = BUILDING_COSTS[type];
  if (costs.length === 0) return strings.costFree;
  return strings.costList(costs);
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
  const strings = useStrings();

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
        {BUILD_MENU.map((type) =>
          button(
            { kind: 'build', building: type },
            strings.buildingLabels[type],
            icons.build,
            strings.buildButtonTitle(strings.buildingLabels[type], costLabel(strings, type)),
          ),
        )}
        {button({ kind: 'storage' }, strings.toolStorage, icons.haul, strings.toolStorageHint)}
        {button({ kind: 'pasture' }, strings.toolPasture, icons.handle, strings.toolPastureHint)}
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
