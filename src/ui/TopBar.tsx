import { useState } from 'react';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../core/constants';
import { colonyMood, moodLabel } from '../core/mood';
import type { GameState } from '../core/types';
import { DEFAULT_SCENARIO, SCENARIO_NAMES } from '../core/scenario';
import type { ScenarioName } from '../core/scenario';
import { DAYS_PER_SEASON, dayOfSeason, seasonOf, yearOf } from '../core/season';
import { AUTOSAVE_SLOT } from '../persistence/indexeddb';
import { getNetworks, useGameStore } from '../store/gameStore';
import { useJobCounts, useSpeed, useTick } from './hooks';
import { useLanguageStore, useStrings } from './language';
import { useSoundStore } from './soundPlayer';
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

export function TopBar(): React.JSX.Element {
  const [scenario, setScenario] = useState<ScenarioName>(DEFAULT_SCENARIO);
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

  // The status text lives in a slot that exists whether or not there is a
  // message (13章 段階A): the old `width: 100%` line wrapped the flex row and
  // pushed the whole board down a line every time a message appeared.
  const statusText = statusMessage
    ? strings.status[statusMessage.key](statusMessage.params ?? {})
    : '';

  const day = Math.floor(tick / TICKS_PER_DAY) + 1;
  const hour = Math.floor((tick % TICKS_PER_DAY) / TICKS_PER_HOUR);
  const minute = Math.floor(((tick % TICKS_PER_DAY) % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR));

  const speeds: { value: GameState['speed']; label: string; hint: string }[] = [
    { value: 0, label: '⏸', hint: strings.pauseHint },
    { value: 1, label: '▶', hint: strings.speedHint(1) },
    { value: 3, label: '▶▶▶', hint: strings.speedHint(3) },
    { value: 10, label: '▶▶▶▶', hint: strings.speedFastHint },
  ];

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

      <div className="topbar__actions">
        <button type="button" onClick={() => void save()}>
          {strings.saveButton}
        </button>
        <button type="button" onClick={() => void load()}>
          {strings.loadButton}
        </button>
        {hasAutosave ? (
          <button
            type="button"
            title={strings.autosaveTitle}
            onClick={() => void load(AUTOSAVE_SLOT)}
          >
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
        <button
          type="button"
          title={strings.soundToggleTitle}
          aria-pressed={!muted}
          onClick={toggleMuted}
        >
          {muted ? '🔇' : '🔊'}
        </button>
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
      </div>

      {mapOverlay ? (
        <WorldMapOverlay
          mode={mapOverlay.mode}
          worldSeed={mapOverlay.worldSeed}
          currentCell={mapOverlay.mode === 'view' ? worldCell : null}
          onClose={() => setMapOverlay(null)}
          onStart={
            mapOverlay.mode === 'select'
              ? (cell) => {
                  newGame(scenario, mapOverlay.worldSeed, cell);
                  setMapOverlay(null);
                }
              : undefined
          }
        />
      ) : null}
    </header>
  );
}
