import { useState } from 'react';
import { DEFAULT_MAP_SIZE, MAP_SIZE_NAMES, TICKS_PER_DAY, TICKS_PER_HOUR } from '../core/constants';
import type { MapSizeName } from '../core/constants';
import { colonyMood, moodLabel } from '../core/mood';
import type { GameState } from '../core/types';
import { DEFAULT_SCENARIO, SCENARIO_NAMES } from '../core/scenario';
import type { ScenarioName } from '../core/scenario';
import { DAYS_PER_SEASON, dayOfSeason, seasonOf, yearOf } from '../core/season';
import { AUTOSAVE_SLOT } from '../persistence/indexeddb';
import { getNetworks, useGameStore } from '../store/gameStore';
import { useBgmStore } from './bgmPlayer';
import { useJobCounts, useSpeed, useTick } from './hooks';
import { useLanguageStore, useStrings } from './language';
import { useSoundStore } from './soundPlayer';
import { SPEED_STEPS } from './speedSteps';
import { STRINGS } from './strings';
import type { Language } from './strings';
import { WorldMapOverlay } from './WorldMapOverlay';

const LANGUAGES: Language[] = ['en', 'ja'];

/**
 * `select`: the "New map" flow, opened over a freshly rolled worldSeed so
 * every open shows a different globe to pick from (5章). `view`: the
 * read-only look at the running colony's own world, opened over its actual
 * `worldSeed`. `null`: closed.
 */
type MapOverlayState = { mode: 'select' | 'view'; worldSeed: number } | null;

/**
 * `collapseActions`: from `layoutFor` (layout.ts, issue #26) - below
 * `ACTIONS_COLLAPSE_WIDTH` the button group folds into a `<details>` menu
 * instead of sitting in the row, since `.topbar` no longer wraps.
 */
export function TopBar({ collapseActions }: { collapseActions: boolean }): React.JSX.Element {
  const [scenario, setScenario] = useState<ScenarioName>(DEFAULT_SCENARIO);
  // the board size for the *next* map (design-phase6-space.md 3.5 / A-4): a
  // property of generation like the scenario, so it sits in the same select row
  const [mapSize, setMapSize] = useState<MapSizeName>(DEFAULT_MAP_SIZE);
  const [mapOverlay, setMapOverlay] = useState<MapOverlayState>(null);
  const tick = useTick();
  const speed = useSpeed();
  const setSpeed = useGameStore((s) => s.setSpeed);
  const save = useGameStore((s) => s.save);
  const load = useGameStore((s) => s.load);
  const hasAutosave = useGameStore((s) => s.hasAutosave);
  const newGame = useGameStore((s) => s.newGame);
  const statusMessage = useGameStore((s) => s.statusMessage);
  const jobs = useJobCounts();
  const population = useGameStore((s) => Object.keys(s.state.colonists).length);
  // a number, not an object: the selector has to stay shallow-comparable
  const mood = useGameStore((s) => colonyMood(s.state, getNetworks(s.state)));
  const worldSeed = useGameStore((s) => s.state.worldSeed);
  const worldCell = useGameStore((s) => s.state.worldCell);
  const strings = useStrings();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const muted = useSoundStore((s) => s.muted);
  const toggleMuted = useSoundStore((s) => s.toggleMuted);
  const volume = useSoundStore((s) => s.volume);
  const setVolume = useSoundStore((s) => s.setVolume);
  // BGM's own fader, independent of the SFX one above (issue #22 acceptance
  // condition 1) - distinct local names so neither pair collides with the other
  const bgmMuted = useBgmStore((s) => s.muted);
  const toggleBgmMuted = useBgmStore((s) => s.toggleMuted);
  const bgmVolume = useBgmStore((s) => s.volume);
  const setBgmVolume = useBgmStore((s) => s.setVolume);

  // The status text lives in a slot that exists whether or not there is a
  // message (13章 段階A): the old `width: 100%` line wrapped the flex row and
  // pushed the whole board down a line every time a message appeared.
  const statusText = statusMessage
    ? strings.status[statusMessage.key](statusMessage.params ?? {})
    : '';

  const day = Math.floor(tick / TICKS_PER_DAY) + 1;
  const hour = Math.floor((tick % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const minute = Math.floor(((tick % TICKS_PER_DAY) % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR));

  // drawn from SPEED_STEPS (speedSteps.ts) rather than a local table, so the
  // buttons and the '1'/'2'/'3'/'4' keys (useKeyboardShortcuts.ts) can never
  // drift apart again (issue #27)
  const speeds: { value: GameState['speed']; label: string; hint: string }[] = SPEED_STEPS.map(
    (step) => ({ value: step.value, label: step.label(strings), hint: step.hint(strings) }),
  );

  // Save/load/scenario/map size/world map/language/sound/new-map - the same
  // buttons whether they sit in the row or inside the collapsed `<details>`
  // menu below (issue #26), so this is built once rather than duplicated.
  const actions = (
    <>
      <button type="button" onClick={() => void save()}>
        {strings.saveButton}
      </button>
      <button type="button" onClick={() => void load()}>
        {strings.loadButton}
      </button>
      {hasAutosave ? (
        <button type="button" title={strings.autosaveTitle} onClick={() => void load(AUTOSAVE_SLOT)}>
          {strings.loadAutosaveButton}
        </button>
      ) : null}
      {/* the scenario picks itself when the player just wants a new map, and
          is one click away when they want a different game */}
      <select
        className="topbar__scenario"
        value={scenario}
        onChange={(event) => setScenario(event.target.value as ScenarioName)}
        title={strings.scenarioDescriptions[scenario]}
      >
        {SCENARIO_NAMES.map((name) => (
          <option key={name} value={name}>
            {strings.scenarioLabels[name]}
          </option>
        ))}
      </select>
      {/* board size for the next map (フェーズ6 A-4): two sizes, measured -
          the proposed 180x180 costs 27.9ms/tick and is deliberately absent */}
      <select
        className="topbar__scenario"
        value={mapSize}
        onChange={(event) => setMapSize(event.target.value as MapSizeName)}
        title={strings.mapSizeTitle}
      >
        {MAP_SIZE_NAMES.map((name) => (
          <option key={name} value={name}>
            {strings.mapSizeLabels[name]}
          </option>
        ))}
      </select>
      {/* the world map, view-only during play (11章 段階B, 5章: "プレイ中は
          TopBar から閲覧だけできる"). Biome now comes from the cell the
          colony was started on, not a select here. */}
      <button type="button" onClick={() => setMapOverlay({ mode: 'view', worldSeed })}>
        {strings.worldMapButton}
      </button>
      {/* the language toggle lives beside the scenario select (phase 9). The
          option shows each language in its own name, so the menu is readable
          from either side of the switch. */}
      <select
        className="topbar__scenario"
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
        title={strings.languageToggleTitle}
      >
        {LANGUAGES.map((code) => (
          <option key={code} value={code}>
            {STRINGS[code].languageName}
          </option>
        ))}
      </select>
      {/* sound on/off beside the language toggle (13章 段階C). Off is the
          default; the click that turns it on is the user gesture the
          browser's autoplay policy wants the AudioContext born inside. */}
      <button type="button" title={strings.soundToggleTitle} aria-pressed={!muted} onClick={toggleMuted}>
        {muted ? '🔇' : '🔊'}
      </button>
      {/* the volume slider (段階 S-1, GitHub issue #17). Disabled while
          muted rather than auto-unmuting on drag: unmuting is a deliberate
          act (it is also the user gesture the autoplay policy wants), so
          dragging a disabled slider should not have the side effect of
          turning sound on - the mute button stays the one control for that. */}
      <input
        className="topbar__volume"
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(volume * 100)}
        disabled={muted}
        title={strings.soundVolumeTitle}
        aria-label={strings.soundVolumeTitle}
        onChange={(event) => setVolume(Number(event.target.value) / 100)}
      />
      <span className="topbar__volume-label muted" title={strings.soundVolumeTitle}>
        {strings.soundVolumeLabel(Math.round(volume * 100))}
      </span>
      {/* BGM on/off, right after the SFX controls (段階 S-3, GitHub issue
          #22). Its own store, its own mute default (off) and its own
          slider - turning music off while keeping SFX on is the common
          case (6章), so the two faders must not share state. A different
          icon pair (🔕/🎵) keeps this button visually distinct from the
          SFX one above. */}
      <button
        type="button"
        title={strings.bgmToggleTitle}
        aria-pressed={!bgmMuted}
        onClick={toggleBgmMuted}
      >
        {bgmMuted ? '🔕' : '🎵'}
      </button>
      {/* disabled while muted for the same reason the SFX slider is: unmuting
          is the deliberate act (and the user gesture the autoplay policy
          wants), so dragging a disabled slider must not silently unmute */}
      <input
        className="topbar__bgm-volume"
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(bgmVolume * 100)}
        disabled={bgmMuted}
        title={strings.bgmVolumeTitle}
        aria-label={strings.bgmVolumeTitle}
        onChange={(event) => setBgmVolume(Number(event.target.value) / 100)}
      />
      <span className="topbar__bgm-volume-label muted" title={strings.bgmVolumeTitle}>
        {strings.bgmVolumeLabel(Math.round(bgmVolume * 100))}
      </span>
      {/* "New map" opens the world-map overlay rather than generating on the
          spot (11章 段階B, 5章): the old one-click ease is kept by the
          overlay's own "start anywhere" button, not by skipping the overlay. */}
      <button
        type="button"
        onClick={() => setMapOverlay({ mode: 'select', worldSeed: Math.floor(Math.random() * 0x7fffffff) })}
        title={strings.scenarioDescriptions[scenario]}
      >
        {strings.newMapButton}
      </button>
    </>
  );

  return (
    <header className="topbar">
      <div className="topbar__clock">
        <strong>{strings.dayLabel(day)}</strong>
        <span title={strings.seasonDayTitle(dayOfSeason(tick), DAYS_PER_SEASON)}>
          {strings.seasonDay(seasonOf(tick), dayOfSeason(tick), DAYS_PER_SEASON)}
        </span>
        <span className="muted">{strings.yearLabel(yearOf(tick))}</span>
        <span>
          {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
        </span>
        <span className="muted">{strings.tickLabel(tick)}</span>
      </div>

      <div className="topbar__speed">
        {speeds.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            className={speed === option.value ? 'active' : ''}
            onClick={() => setSpeed(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="topbar__jobs muted">
        {strings.populationCount(population)} · {strings.jobsSummary(jobs.active, jobs.pending)}
        {jobs.failed > 0 ? ` / ${strings.jobsFailed(jobs.failed)}` : ''}
        {/* one number for how the colony is bearing it; the panel has the detail */}
        <span title={strings.moodTitle}> · {strings.moodSummary(mood, moodLabel(mood))}</span>
      </div>

      {/* always rendered, so a message changes pixels inside the slot and
          nothing else; the full text rides on `title` for the ones that get
          cut by the ellipsis */}
      <div className="topbar__status" title={statusText}>
        {statusText}
      </div>

      {collapseActions ? (
        // `.topbar` no longer wraps (issue #26); below `ACTIONS_COLLAPSE_WIDTH`
        // (layout.ts) this whole group folds into a native disclosure instead
        // of forcing the row to wrap. No new state to manage - the browser
        // owns `<details>`'s open/closed itself.
        <details className="topbar__actions topbar__actions--menu">
          <summary title={strings.actionsMenuButton} aria-label={strings.actionsMenuButton}>
            {strings.actionsMenuButton}
          </summary>
          <div className="topbar__actions-menu">{actions}</div>
        </details>
      ) : (
        <div className="topbar__actions">{actions}</div>
      )}

      {mapOverlay ? (
        <WorldMapOverlay
          mode={mapOverlay.mode}
          worldSeed={mapOverlay.worldSeed}
          currentCell={mapOverlay.mode === 'view' ? worldCell : null}
          onClose={() => setMapOverlay(null)}
          onStart={
            mapOverlay.mode === 'select'
              ? (cell) => {
                  newGame(scenario, mapOverlay.worldSeed, cell, mapSize);
                  setMapOverlay(null);
                }
              : undefined
          }
        />
      ) : null}
    </header>
  );
}
