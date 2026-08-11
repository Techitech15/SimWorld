// The world-map overlay (11章 フェーズ11 段階B, docs/design-phase11-worldmap.md 5章).
//
// A modal, not a second screen: it opens over the viewport and closes back
// into the one map the colony actually plays on (1章 - "ワールドマップは盤面で
// はなく、生成の文脈"). Two modes share one component because they share
// everything but the actions at the bottom: `select` is the "New map" flow
// (pick a cell, or let the map pick one), `view` is the read-only look TopBar
// offers during play, with no way to change what has already been chosen.
import { useMemo, useState } from 'react';
import { TRIBE_NAMES, tribalInfluence } from '../core/tribes';
import { WORLD_MAP_SIZE, randomWorldCell, worldMapGrid } from '../core/worldmap';
import type { BiomeName } from '../core/types';
import { useStrings } from './language';

type Rgb = [number, number, number];

// The same four colours the minimap already uses for these terrains
// (src/ui/Minimap.tsx TERRAIN), so a biome reads as one colour everywhere.
const BIOME_COLORS: Record<BiomeName, Rgb> = {
  meadow: [74, 124, 63],
  deepwood: [40, 84, 45],
  crag: [125, 125, 134],
  manaheath: [138, 95, 214],
};

const BIOME_ORDER: BiomeName[] = ['meadow', 'deepwood', 'crag', 'manaheath'];

function rgb([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

export interface WorldMapOverlayProps {
  mode: 'select' | 'view';
  worldSeed: number;
  /** The colony's actual cell (view mode's marker); null pre-dates the world map. */
  currentCell: { x: number; y: number } | null;
  onClose: () => void;
  /** select mode only: what to do with the cell the player settled on. */
  onStart?: (cell: { x: number; y: number }) => void;
}

export function WorldMapOverlay({
  mode,
  worldSeed,
  currentCell,
  onClose,
  onStart,
}: WorldMapOverlayProps): React.JSX.Element {
  const strings = useStrings();
  // Only ever recomputed when the overlay is handed a different worldSeed
  // (a fresh "New map" roll) - never on every render, and never in the tick
  // loop (8章 "性能"): this component does not exist while the game is ticking.
  const grid = useMemo(() => worldMapGrid(worldSeed), [worldSeed]);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(
    mode === 'view' ? currentCell : null,
  );

  const influence = selected ? tribalInfluence({ worldSeed, worldCell: selected }) : null;
  const nearbyTribes = influence ? TRIBE_NAMES.filter((tribe) => influence[tribe].near) : [];
  // distance 0 means the cell itself sits in the tribe's territory - worth
  // saying differently from merely being close to someone else's
  const nearbyTribeLines = nearbyTribes.map((tribe) =>
    influence![tribe].distance === 0
      ? strings.worldMapTribeHere(strings.tribeLabels[tribe])
      : strings.worldMapTribeNear(strings.tribeLabels[tribe]),
  );
  const selectedBiome = selected ? grid[selected.y][selected.x].biome : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal worldmap"
        role="dialog"
        aria-modal="true"
        aria-label={strings.worldMapTitle}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__head">
          <h2>{strings.worldMapTitle}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            title={strings.worldMapCloseButton}
          >
            ×
          </button>
        </div>
        <p className="muted small">
          {mode === 'select' ? strings.worldMapSelectIntro : strings.worldMapViewIntro}
        </p>
        {mode === 'view' && !currentCell ? (
          <p className="worldmap__note muted small">{strings.worldMapPreWorldMapNote}</p>
        ) : null}

        <div
          className="worldmap__grid"
          role="grid"
          aria-label={strings.worldMapTitle}
          style={{ gridTemplateColumns: `repeat(${WORLD_MAP_SIZE}, 1fr)` }}
        >
          {grid.map((row) =>
            row.map((cell) => {
              const isSelected = selected?.x === cell.x && selected?.y === cell.y;
              const isCurrent = currentCell?.x === cell.x && currentCell?.y === cell.y;
              return (
                <button
                  type="button"
                  key={`${cell.x},${cell.y}`}
                  className={
                    'worldmap__cell' +
                    (isSelected ? ' worldmap__cell--selected' : '') +
                    (isCurrent ? ' worldmap__cell--current' : '')
                  }
                  style={{ background: rgb(BIOME_COLORS[cell.biome]) }}
                  title={strings.biomeLabels[cell.biome]}
                  onClick={() => setSelected({ x: cell.x, y: cell.y })}
                >
                  {isCurrent ? '●' : ''}
                </button>
              );
            }),
          )}
        </div>

        <div className="worldmap__legend">
          <strong>{strings.worldMapLegendTitle}</strong>
          {BIOME_ORDER.map((biome) => (
            <span key={biome} className="worldmap__legendItem">
              <span className="worldmap__swatch" style={{ background: rgb(BIOME_COLORS[biome]) }} />
              {strings.biomeLabels[biome]}
            </span>
          ))}
        </div>

        <div className="worldmap__summary">
          {selected && selectedBiome ? (
            <>
              <p>
                <strong>{strings.biomeLabels[selectedBiome]}</strong>
                {' — '}
                {strings.biomeDescriptions[selectedBiome]}
              </p>
              <p className="muted small">
                {strings.worldMapNearbyLabel}:{' '}
                {nearbyTribeLines.length > 0
                  ? strings.tribeList(nearbyTribeLines)
                  : strings.worldMapNoTribesNearby}
              </p>
              {currentCell && selected.x === currentCell.x && selected.y === currentCell.y ? (
                <p className="muted small">{strings.worldMapCurrentCellLabel}</p>
              ) : null}
            </>
          ) : (
            <p className="muted small">{strings.worldMapPickPrompt}</p>
          )}
        </div>

        <div className="worldmap__actions">
          {mode === 'select' ? (
            <>
              <button type="button" onClick={() => onStart?.(randomWorldCell())}>
                {strings.worldMapRandomButton}
              </button>
              <button
                type="button"
                className="active"
                disabled={!selected}
                onClick={() => selected && onStart?.(selected)}
              >
                {strings.worldMapStartButton}
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose}>
              {strings.worldMapCloseButton}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
