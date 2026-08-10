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
import { STRINGS } from './strings';
import type { Language } from './strings';

const LANGUAGES: Language[] = ['en', 'ja'];

export function TopBar(): React.JSX.Element {
  const [scenario, setScenario] = useState<ScenarioName>(DEFAULT_SCENARIO);
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
  const strings = useStrings();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

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
        <button
          type="button"
          onClick={() => newGame(scenario)}
          title={strings.scenarioDescriptions[scenario]}
        >
          {strings.newMapButton}
        </button>
      </div>

      {statusMessage ? (
        <div className="topbar__status">
          {strings.status[statusMessage.key](statusMessage.params ?? {})}
        </div>
      ) : null}
    </header>
  );
}
