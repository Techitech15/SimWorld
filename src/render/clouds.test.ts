// Cloud shadows' inputs (issue #15). The drawing cannot run headless; the
// values it draws from can - the same split daylight.test.ts uses for the
// day/night overlay.
import { describe, expect, it } from 'vitest';
import { MAP_SIZES } from '../core/constants';
import { CLOUD_ALPHA_MAX, WRAP_MARGIN_TILES, cloudsAt } from './clouds';
import { type CoverageDisc, screenCoverage } from './screenCoverage';

const WIDTH = 60;
const HEIGHT = 60;

describe('cloudsAt is a pure function of elapsed time', () => {
  it('returns the same shadows for the same elapsedMs', () => {
    const a = cloudsAt(12345, WIDTH, HEIGHT);
    const b = cloudsAt(12345, WIDTH, HEIGHT);
    expect(a).toEqual(b);
  });

  it('moves the shadows as time advances', () => {
    const early = cloudsAt(0, WIDTH, HEIGHT);
    const later = cloudsAt(60_000, WIDTH, HEIGHT);
    // at least one cloud has actually gone somewhere else in a full minute
    const moved = early.some((cloud, i) => cloud.x !== later[i].x || cloud.y !== later[i].y);
    expect(moved).toBe(true);
  });
});

describe('120x120 output is unchanged by area-derived cloud counts (issue #30 invariant)', () => {
  // The task's hardest constraint: main tunes CLOUDS' color/size/silhouette
  // by eye against the shipped 120x120 map, so cloudsAt(t, 120, 120) must
  // come out bit-for-bit identical before and after this module started
  // scaling cloud count with area. This snapshot was captured from the
  // pre-this-change implementation (cloudsAt always mapping over the full,
  // unfiltered CLOUDS table) and compared byte-for-byte against the
  // post-change output before being committed here - see the values below.
  it('matches the pre-area-scaling output at several points in time', () => {
    expect(cloudsAt(0, 120, 120)).toMatchInlineSnapshot(`
      [
        {
          "alpha": 0.28,
          "radius": 7,
          "x": 5,
          "y": 8,
        },
        {
          "alpha": 0.196,
          "radius": 10,
          "x": 40,
          "y": 20,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 5,
          "x": 70,
          "y": 5,
        },
        {
          "alpha": 0.168,
          "radius": 8,
          "x": 20,
          "y": 45,
        },
        {
          "alpha": 0.28,
          "radius": 6,
          "x": 90,
          "y": 35,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 9,
          "x": 85,
          "y": 52,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 9,
          "x": 55,
          "y": 60,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 5,
          "x": 110,
          "y": 62,
        },
        {
          "alpha": 0.25200000000000006,
          "radius": 6,
          "x": 15,
          "y": 78,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 8,
          "x": 100,
          "y": 88,
        },
        {
          "alpha": 0.168,
          "radius": 6,
          "x": 48,
          "y": 92,
        },
        {
          "alpha": 0.266,
          "radius": 7,
          "x": 75,
          "y": 105,
        },
        {
          "alpha": 0.196,
          "radius": 10,
          "x": 28,
          "y": 112,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 16,
          "x": 60,
          "y": 15,
        },
        {
          "alpha": 0.196,
          "radius": 14,
          "x": 10,
          "y": 60,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 13,
          "x": 95,
          "y": 8,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 15,
          "x": 40,
          "y": 75,
        },
        {
          "alpha": 0.168,
          "radius": 12,
          "x": 115,
          "y": 30,
        },
        {
          "alpha": 0.196,
          "radius": 26,
          "x": 30,
          "y": 28,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 24,
          "x": 100,
          "y": 105,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 22,
          "x": 68,
          "y": 70,
        },
        {
          "alpha": 0.168,
          "radius": 20,
          "x": 8,
          "y": 98,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 21,
          "x": 112,
          "y": 12,
        },
        {
          "alpha": 0.196,
          "radius": 25,
          "x": 52,
          "y": 118,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 19,
          "x": 88,
          "y": 42,
        },
        {
          "alpha": 0.168,
          "radius": 23,
          "x": 20,
          "y": 8,
        },
        {
          "alpha": 0.196,
          "radius": 11,
          "x": 46,
          "y": 48,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 8,
          "x": 78,
          "y": 88,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 9,
          "x": 5,
          "y": 34,
        },
        {
          "alpha": 0.196,
          "radius": 17,
          "x": 62,
          "y": 32,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 18,
          "x": 104,
          "y": 70,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 12,
          "x": 34,
          "y": 90,
        },
        {
          "alpha": 0.168,
          "radius": 15,
          "x": 92,
          "y": 118,
        },
        {
          "alpha": 0.196,
          "radius": 13,
          "x": 14,
          "y": 118,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 10,
          "x": 118,
          "y": 92,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 21,
          "x": 70,
          "y": 58,
        },
      ]
    `);
    expect(cloudsAt(1234, 120, 120)).toMatchInlineSnapshot(`
      [
        {
          "alpha": 0.28,
          "radius": 7,
          "x": 6.3976654541068,
          "y": 8.48918290893738,
        },
        {
          "alpha": 0.196,
          "radius": 10,
          "x": 40.931776969404524,
          "y": 20.326121939291568,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 5,
          "x": 71.7470818176335,
          "y": 5.611478636171739,
        },
        {
          "alpha": 0.168,
          "radius": 8,
          "x": 21.164721211755648,
          "y": 45.407652424114474,
        },
        {
          "alpha": 0.28,
          "radius": 6,
          "x": 91.0482490905801,
          "y": 35.36688718170302,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 9,
          "x": 85.93177696940455,
          "y": 52.326121939291625,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 9,
          "x": 56.28119333293125,
          "y": 60.44841766652593,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 5,
          "x": 111.63060969645795,
          "y": 62.570713393760286,
        },
        {
          "alpha": 0.25200000000000006,
          "radius": 6,
          "x": 16.514137575282348,
          "y": 78.52994815134883,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 8,
          "x": 101.0482490905801,
          "y": 88.36688718170302,
        },
        {
          "alpha": 0.168,
          "radius": 6,
          "x": 49.51413757528235,
          "y": 92.52994815134883,
        },
        {
          "alpha": 0.266,
          "radius": 7,
          "x": 76.3976654541068,
          "y": 105.48918290893738,
        },
        {
          "alpha": 0.196,
          "radius": 10,
          "x": 29.164721211755648,
          "y": 112.40765242411447,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 16,
          "x": 60.81530484822895,
          "y": 15.285356696880143,
        },
        {
          "alpha": 0.196,
          "radius": 14,
          "x": 10.931776969404524,
          "y": 60.326121939291625,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 13,
          "x": 96.0482490905801,
          "y": 8.36688718170302,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 15,
          "x": 40.815304848228976,
          "y": 75.28535669688017,
        },
        {
          "alpha": 0.168,
          "radius": 12,
          "x": 116.16472121175565,
          "y": 30.407652424114474,
        },
        {
          "alpha": 0.196,
          "radius": 26,
          "x": 30.582360605877824,
          "y": 28.203826212057237,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 24,
          "x": 100.6988327270534,
          "y": 105.24459145446872,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 22,
          "x": 68.58236060587785,
          "y": 70.20382621205727,
        },
        {
          "alpha": 0.168,
          "radius": 20,
          "x": 8.6988327270534,
          "y": 98.24459145446872,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 21,
          "x": 112.81530484822895,
          "y": 12.285356696880143,
        },
        {
          "alpha": 0.196,
          "radius": 25,
          "x": 52.58236060587785,
          "y": 118.20382621205727,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 19,
          "x": 88.6988327270534,
          "y": 42.24459145446869,
        },
        {
          "alpha": 0.168,
          "radius": 23,
          "x": 20.815304848228948,
          "y": 8.285356696880143,
        },
        {
          "alpha": 0.196,
          "radius": 11,
          "x": 47.0482490905801,
          "y": 48.36688718170302,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 8,
          "x": 79.28119333293125,
          "y": 88.44841766652593,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 9,
          "x": 6.3976654541068,
          "y": 34.48918290893738,
        },
        {
          "alpha": 0.196,
          "radius": 17,
          "x": 62.931776969404496,
          "y": 32.326121939291596,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 18,
          "x": 104.81530484822895,
          "y": 70.28535669688017,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 12,
          "x": 35.16472121175565,
          "y": 90.40765242411447,
        },
        {
          "alpha": 0.168,
          "radius": 15,
          "x": 92.93177696940455,
          "y": 118.32612193929157,
        },
        {
          "alpha": 0.196,
          "radius": 13,
          "x": 15.0482490905801,
          "y": 118.36688718170302,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 10,
          "x": 119.28119333293125,
          "y": 92.44841766652593,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 21,
          "x": 70.6988327270534,
          "y": 58.24459145446872,
        },
      ]
    `);
    expect(cloudsAt(60_000, 120, 120)).toMatchInlineSnapshot(`
      [
        {
          "alpha": 0.28,
          "radius": 7,
          "x": 72.95780165835328,
          "y": 31.785230580423615,
        },
        {
          "alpha": 0.196,
          "radius": 10,
          "x": 85.30520110556881,
          "y": 35.856820386949096,
        },
        {
          "alpha": 0.05905164262000343,
          "radius": 5,
          "x": -21.05274792705842,
          "y": 34.73153822552956,
        },
        {
          "alpha": 0.168,
          "radius": 8,
          "x": 76.63150138196102,
          "y": 64.82102548368636,
        },
        {
          "alpha": 0.07031648756235086,
          "radius": 6,
          "x": 140.96835124376491,
          "y": 52.838922935317726,
        },
        {
          "alpha": 0.13271099170823392,
          "radius": 9,
          "x": 130.3052011055688,
          "y": 67.8568203869491,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 9,
          "x": 117.29465152015717,
          "y": 81.80312803205499,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 5,
          "x": 13.284101934745479,
          "y": 89.74943567716093,
        },
        {
          "alpha": 0.25200000000000006,
          "radius": 6,
          "x": 88.62095179654938,
          "y": 103.7673331287923,
        },
        {
          "alpha": 0.019294283084472123,
          "radius": 8,
          "x": -25.031648756235057,
          "y": 105.83892293531773,
        },
        {
          "alpha": 0.15827428922070375,
          "radius": 6,
          "x": 121.62095179654938,
          "y": 117.7673331287923,
        },
        {
          "alpha": 0.032871587349066554,
          "radius": 7,
          "x": 142.95780165835328,
          "y": 128.78523058042367,
        },
        {
          "alpha": 0.11325282161419552,
          "radius": 10,
          "x": 84.63150138196102,
          "y": 131.82102548368636,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 16,
          "x": 99.64205096737271,
          "y": 28.874717838580466,
        },
        {
          "alpha": 0.196,
          "radius": 14,
          "x": 55.30520110556881,
          "y": 75.8568203869491,
        },
        {
          "alpha": 0.01726901442799824,
          "radius": 13,
          "x": 145.96835124376491,
          "y": 25.838922935317726,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 15,
          "x": 79.64205096737271,
          "y": 88.87471783858047,
        },
        {
          "alpha": 0.14178900829176627,
          "radius": 12,
          "x": -4.368498618038956,
          "y": 49.821025483686356,
        },
        {
          "alpha": 0.196,
          "radius": 26,
          "x": 58.31575069098051,
          "y": 37.91051274184318,
        },
        {
          "alpha": 0.09113714461035205,
          "radius": 24,
          "x": 133.9789008291766,
          "y": 116.89261529021184,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 22,
          "x": 96.31575069098051,
          "y": 79.91051274184315,
        },
        {
          "alpha": 0.168,
          "radius": 20,
          "x": 41.97890082917664,
          "y": 109.89261529021184,
        },
        {
          "alpha": 0.027315382255295548,
          "radius": 21,
          "x": -24.35794903262726,
          "y": 25.874717838580466,
        },
        {
          "alpha": 0.14062641080709798,
          "radius": 25,
          "x": 80.31575069098051,
          "y": 127.91051274184315,
        },
        {
          "alpha": 0.22117934295199884,
          "radius": 19,
          "x": 121.97890082917661,
          "y": 53.89261529021178,
        },
        {
          "alpha": 0.168,
          "radius": 23,
          "x": 59.64205096737271,
          "y": 21.874717838580466,
        },
        {
          "alpha": 0.196,
          "radius": 11,
          "x": 96.96835124376491,
          "y": 65.83892293531773,
        },
        {
          "alpha": 0.06164278783874262,
          "radius": 8,
          "x": 140.29465152015717,
          "y": 109.80312803205499,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 9,
          "x": 72.95780165835328,
          "y": 57.785230580423615,
        },
        {
          "alpha": 0.196,
          "radius": 17,
          "x": 107.30520110556881,
          "y": 47.856820386949096,
        },
        {
          "alpha": 0.032684617744704665,
          "radius": 18,
          "x": 143.6420509673727,
          "y": 83.87471783858047,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 12,
          "x": 90.63150138196102,
          "y": 109.82102548368636,
        },
        {
          "alpha": 0.032412527504871114,
          "radius": 15,
          "x": 137.3052011055688,
          "y": 133.8568203869491,
        },
        {
          "alpha": 0.08512753945277593,
          "radius": 13,
          "x": 64.96835124376491,
          "y": 135.83892293531773,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 10,
          "x": 4.294651520157174,
          "y": 113.80312803205499,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 21,
          "x": 103.97890082917661,
          "y": 69.89261529021184,
        },
      ]
    `);
    expect(cloudsAt(999_999, 120, 120)).toMatchInlineSnapshot(`
      [
        {
          "alpha": 0.28,
          "radius": 7,
          "x": 81.62889500919323,
          "y": 52.42011325321755,
        },
        {
          "alpha": 0.196,
          "radius": 10,
          "x": 91.08593000612882,
          "y": 108.28007550214505,
        },
        {
          "alpha": 0.004463703315437446,
          "radius": 5,
          "x": 77.78611876149171,
          "y": -27.474858433477948,
        },
        {
          "alpha": 0.168,
          "radius": 8,
          "x": 83.85741250766102,
          "y": 23.35009437768133,
        },
        {
          "alpha": 0.08315084939913164,
          "radius": 6,
          "x": 59.471671256894865,
          "y": -19.684915060086837,
        },
        {
          "alpha": 0.02463635378969053,
          "radius": 9,
          "x": 136.08593000612882,
          "y": 140.28007550214505,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 9,
          "x": 37.2431537584273,
          "y": 71.38510381544944,
        },
        {
          "alpha": 0.20816612309440805,
          "radius": 5,
          "x": 23.400377510725548,
          "y": -3.509867871246115,
        },
        {
          "alpha": 0.0670961042188715,
          "radius": 6,
          "x": 10.014636259959389,
          "y": -20.544877309014282,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 8,
          "x": 69.47167125689487,
          "y": 33.31508493991316,
        },
        {
          "alpha": 0.1287307361459143,
          "radius": 6,
          "x": 43.01463625995939,
          "y": -6.544877309014282,
        },
        {
          "alpha": 0.0017484892150842204,
          "radius": 7,
          "x": -24.37110499080677,
          "y": -26.57988674678245,
        },
        {
          "alpha": 0.196,
          "radius": 10,
          "x": 91.85741250766102,
          "y": 90.35009437768133,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 16,
          "x": 16.700188755362774,
          "y": 70.24506606437694,
        },
        {
          "alpha": 0.0019605285150153754,
          "radius": 14,
          "x": 61.08593000612882,
          "y": -27.719924497854947,
        },
        {
          "alpha": 0.15882177801073813,
          "radius": 13,
          "x": 64.47167125689487,
          "y": 129.31508493991316,
        },
        {
          "alpha": 0.11746880880773722,
          "radius": 15,
          "x": -3.299811244637226,
          "y": 130.24506606437694,
        },
        {
          "alpha": 0.168,
          "radius": 12,
          "x": 2.857412507661138,
          "y": 8.35009437768133,
        },
        {
          "alpha": 0.013500943776813988,
          "radius": 26,
          "x": -26.07129374616943,
          "y": 17.175047188840665,
        },
        {
          "alpha": 0.04674477040987104,
          "radius": 24,
          "x": 138.31444750459661,
          "y": 127.21005662660878,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 22,
          "x": 11.928706253830569,
          "y": 59.175047188840665,
        },
        {
          "alpha": 0.16673966024034736,
          "radius": 20,
          "x": 46.314447504596615,
          "y": 120.21005662660878,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 21,
          "x": 68.70018875536277,
          "y": 67.24506606437694,
        },
        {
          "alpha": 0.167500943776814,
          "radius": 25,
          "x": -4.071293746169431,
          "y": 107.17504718884067,
        },
        {
          "alpha": 0.18432719621092877,
          "radius": 19,
          "x": 126.31444750459661,
          "y": 64.21005662660878,
        },
        {
          "alpha": 0.028201132532176654,
          "radius": 23,
          "x": -23.299811244637226,
          "y": 63.24506606437694,
        },
        {
          "alpha": 0.14920559457939214,
          "radius": 11,
          "x": 15.471671256894865,
          "y": -6.684915060086837,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 8,
          "x": 60.2431537584273,
          "y": 99.38510381544944,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 9,
          "x": 81.62889500919323,
          "y": 78.42011325321755,
        },
        {
          "alpha": 0.19403947148498463,
          "radius": 17,
          "x": 113.08593000612882,
          "y": 120.28007550214505,
        },
        {
          "alpha": 0.17066200451717295,
          "radius": 18,
          "x": 60.700188755362774,
          "y": 125.24506606437694,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 12,
          "x": 97.85741250766102,
          "y": 68.35009437768133,
        },
        {
          "alpha": 0.029484419963227076,
          "radius": 15,
          "x": 143.08593000612882,
          "y": 30.280075502145053,
        },
        {
          "alpha": 0.08030169879826406,
          "radius": 13,
          "x": -16.528328743105135,
          "y": 63.31508493991316,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 10,
          "x": 100.2431537584273,
          "y": 103.38510381544944,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 21,
          "x": 108.31444750459661,
          "y": 80.21005662660878,
        },
      ]
    `);
    expect(cloudsAt(5_000_000, 120, 120)).toMatchInlineSnapshot(`
      [
        {
          "alpha": 0.28,
          "radius": 7,
          "x": 36.15013819610431,
          "y": 54.102548368636235,
        },
        {
          "alpha": 0.196,
          "radius": 10,
          "x": 119.43342546406984,
          "y": 109.40169891242431,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 5,
          "x": 108.93767274513175,
          "y": 18.62818546079552,
        },
        {
          "alpha": 0.09175069098052518,
          "radius": 8,
          "x": -12.70821816991247,
          "y": 112.75212364053027,
        },
        {
          "alpha": 0.28,
          "radius": 6,
          "x": 113.36260364707778,
          "y": 113.57691127647718,
        },
        {
          "alpha": 0.029044470297901637,
          "radius": 9,
          "x": -11.566574535930158,
          "y": 141.4016989124243,
        },
        {
          "alpha": 0.046232319895229024,
          "radius": 9,
          "x": 142.22096001309637,
          "y": 116.92733600458337,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 5,
          "x": 29.008494562122905,
          "y": 86.45297309674243,
        },
        {
          "alpha": 0.16271384741201841,
          "radius": 6,
          "x": -9.920683620886848,
          "y": 113.27776073268933,
        },
        {
          "alpha": 0.10624870428055895,
          "radius": 8,
          "x": 123.36260364707778,
          "y": -9.423088723522824,
        },
        {
          "alpha": 0.12433343560386402,
          "radius": 6,
          "x": 23.079316379113152,
          "y": 127.27776073268933,
        },
        {
          "alpha": 0.02947420950204424,
          "radius": 7,
          "x": 106.15013819610431,
          "y": -24.897451631363765,
        },
        {
          "alpha": 0.1630424728106127,
          "radius": 10,
          "x": -4.70821816991247,
          "y": 3.7521236405302716,
        },
        {
          "alpha": 0.22400000000000003,
          "radius": 16,
          "x": 19.504247281061453,
          "y": 115.22648654837121,
        },
        {
          "alpha": 0.009811892386970155,
          "radius": 14,
          "x": 89.43342546406984,
          "y": -26.598301087575692,
        },
        {
          "alpha": 0.23800000000000002,
          "radius": 13,
          "x": 118.36260364707778,
          "y": 86.57691127647718,
        },
        {
          "alpha": 0.20058321927345407,
          "radius": 15,
          "x": -0.49575271893854733,
          "y": -0.7735134516287872,
        },
        {
          "alpha": 0.168,
          "radius": 12,
          "x": 82.29178183008753,
          "y": 97.75212364053027,
        },
        {
          "alpha": 0.01313243274185596,
          "radius": 26,
          "x": 101.64589091504376,
          "y": -26.123938179734864,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 24,
          "x": 115.57506909805215,
          "y": 40.05127418431812,
        },
        {
          "alpha": 0.0668328726796499,
          "radius": 22,
          "x": 139.64589091504376,
          "y": 15.876061820265136,
        },
        {
          "alpha": 0.168,
          "radius": 20,
          "x": 23.575069098052154,
          "y": 33.05127418431812,
        },
        {
          "alpha": 0.21000000000000002,
          "radius": 21,
          "x": 71.50424728106145,
          "y": 112.22648654837121,
        },
        {
          "alpha": 0.17047876359469366,
          "radius": 25,
          "x": 123.64589091504376,
          "y": 63.876061820265136,
        },
        {
          "alpha": 0.042935830566704004,
          "radius": 19,
          "x": 103.57506909805215,
          "y": -22.948725815681883,
        },
        {
          "alpha": 0.045025483686368724,
          "radius": 23,
          "x": -20.495752718938547,
          "y": 108.22648654837121,
        },
        {
          "alpha": 0.14996162106465977,
          "radius": 11,
          "x": 69.36260364707778,
          "y": 126.57691127647718,
        },
        {
          "alpha": 0.015118349656785931,
          "radius": 8,
          "x": -10.779039986903626,
          "y": 144.92733600458337,
        },
        {
          "alpha": 0.18200000000000002,
          "radius": 9,
          "x": 36.15013819610431,
          "y": 80.10254836863623,
        },
        {
          "alpha": 0.04366493165516949,
          "radius": 17,
          "x": 141.43342546406984,
          "y": 121.40169891242431,
        },
        {
          "alpha": 0.16669864911278412,
          "radius": 18,
          "x": 63.50424728106145,
          "y": -5.773513451628787,
        },
        {
          "alpha": 0.08289305094450732,
          "radius": 12,
          "x": 1.2917818300875297,
          "y": -18.24787635946973,
        },
        {
          "alpha": 0.14060055278441905,
          "radius": 15,
          "x": -4.566574535930158,
          "y": 31.401698912424308,
        },
        {
          "alpha": 0.196,
          "radius": 13,
          "x": 37.362603647077776,
          "y": 20.576911276477176,
        },
        {
          "alpha": 0.007418688036666933,
          "radius": 10,
          "x": 29.220960013096374,
          "y": -27.072663995416633,
        },
        {
          "alpha": 0.13683328219806778,
          "radius": 21,
          "x": 85.57506909805215,
          "y": -6.9487258156818825,
        },
      ]
    `);
  });
});

describe('cloud count follows map area (issue #30)', () => {
  it('uses the full 36-entry table, unchanged, at the reference 120x120 area', () => {
    // This is the invariant the rest of the fix leans on: 120x120 is the
    // area CLOUDS was tuned against, so scaling by area must round-trip to
    // exactly CLOUDS.length here, or every 120x120 measurement docs/design.md
    // and design-notes.md record (and the renderer's look) would shift too.
    expect(cloudsAt(0, 120, 120)).toHaveLength(36);
  });

  it('draws fewer clouds on the smaller 60x60 map instead of the same 36', () => {
    // 60x60 is a quarter of the reference area, so area-derived count is
    // round(36 * 0.25) = 9 - a quarter of the reference count, not the full
    // table main was drawing here before this fix (see the "does not read as
    // permanent overcast" ceiling test below for what that did to coverage).
    expect(cloudsAt(0, 60, 60)).toHaveLength(9);
  });

  it('never drops below the floor even on a tiny hypothetical map', () => {
    expect(cloudsAt(0, 10, 10).length).toBeGreaterThanOrEqual(3);
  });
});

describe('alpha stays inside the published ceiling', () => {
  it('never exceeds CLOUD_ALPHA_MAX and never goes negative, across a long stretch of time', () => {
    for (let elapsedMs = 0; elapsedMs <= 600_000; elapsedMs += 5_000) {
      for (const cloud of cloudsAt(elapsedMs, WIDTH, HEIGHT)) {
        expect(cloud.alpha).toBeGreaterThanOrEqual(0);
        expect(cloud.alpha).toBeLessThanOrEqual(CLOUD_ALPHA_MAX);
      }
    }
  });

  it('is a shadow, not a second night: the ceiling is clearly lighter than a night overlay', () => {
    // NIGHT_ALPHA (daylight.ts) is 0.45; this only pins the intent that a
    // cloud shadow reads as weather, not as darkness stacked on darkness.
    expect(CLOUD_ALPHA_MAX).toBeLessThan(0.3);
  });
});

describe('wraparound does not run away', () => {
  it('keeps every shadow within the map plus its wrap margin, no matter how far time runs', () => {
    // A year of real playtime at typical frame deltas, sampled coarsely -
    // long enough that every cloud in the table has wrapped around many times.
    for (let elapsedMs = 0; elapsedMs <= 50_000_000; elapsedMs += 250_000) {
      for (const cloud of cloudsAt(elapsedMs, WIDTH, HEIGHT)) {
        expect(cloud.x).toBeGreaterThanOrEqual(-WRAP_MARGIN_TILES);
        expect(cloud.x).toBeLessThan(WIDTH + WRAP_MARGIN_TILES);
        expect(cloud.y).toBeGreaterThanOrEqual(-WRAP_MARGIN_TILES);
        expect(cloud.y).toBeLessThan(HEIGHT + WRAP_MARGIN_TILES);
      }
    }
  });
});

describe('continuity: no teleporting shadow (mirrors the day/night boundary test)', () => {
  it('never jumps a visible shadow more than a tiny step for a tiny step in time', () => {
    const stepMs = 50;
    // The wrap seam is a real discontinuity in the raw x/y, but it always
    // lands where fadeFactor has driven alpha to (near) 0 on both sides, so
    // a shadow that is actually visible (alpha above a small threshold on
    // both samples) never appears to jump - which is the acceptance
    // condition, not "the raw coordinate is monotonic".
    const visibleAlpha = 0.01;
    let previous = cloudsAt(0, WIDTH, HEIGHT);
    for (let elapsedMs = stepMs; elapsedMs <= 300_000; elapsedMs += stepMs) {
      const current = cloudsAt(elapsedMs, WIDTH, HEIGHT);
      for (let i = 0; i < current.length; i++) {
        if (previous[i].alpha < visibleAlpha || current[i].alpha < visibleAlpha) continue;
        expect(Math.abs(current[i].x - previous[i].x)).toBeLessThan(0.1);
        expect(Math.abs(current[i].y - previous[i].y)).toBeLessThan(0.1);
        expect(Math.abs(current[i].alpha - previous[i].alpha)).toBeLessThan(0.05);
      }
      previous = current;
    }
  });
});

// --- issue #30: screen coverage tracks map size -----------------------------
//
// The bug: cloudsAt used to return a fixed 5-cloud table no matter how big
// the map was. That table was tuned by eye on whatever map its author had
// open, and nothing measured what fraction of a player's actual screen it
// covered over time - so nobody noticed it stopped scaling once shipped
// maps grew to 120x120 (docs/design.md 11, phase 6) while tests kept
// running on 60x60 (CLAUDE.md). screenCoverage.ts (also added for #30) is
// that missing measurement; this section is both "prove the metric catches
// the bug" (mirrors tileVariant.test.ts's naive-hash sanity check) and the
// regression guard for the fix.
function toDiscs(shadows: { x: number; y: number; radius: number; alpha: number }[]): CoverageDisc[] {
  return shadows.map((s) => ({ x: s.x, y: s.y, radius: s.radius, strength: s.alpha }));
}

/** 20 minutes of elapsed time - long enough to see every cloud in the
 *  (small, fixed-size) table sweep across the map multiple times. */
const COVERAGE_DURATION_MS = 20 * 60 * 1000;

/**
 * The exact fixed 5-cloud table `clouds.ts` used before the #30 fix, at the
 * `WRAP_MARGIN_TILES` (14) that was in effect back then - copied literally
 * from this repository's history (commit range around the #30 investigation),
 * not re-derived and not importing today's `WRAP_MARGIN_TILES` (28, widened
 * afterwards by the #15 follow-up that shipped 36 clouds with a bigger
 * biggest-radius). CLAUDE.md 10 asks for measurements to keep their
 * conditions attached: "here is the table, at the margin it ran with, that
 * measured 18.1% on the shipped map size" has to stay true regardless of
 * what clouds.ts's constants do later, which is why this whole function is
 * self-contained instead of importing from clouds.ts.
 */
const OLD_WRAP_MARGIN_TILES = 14;

function oldFixedCloudsAt(elapsedMs: number, width: number, height: number): CoverageDisc[] {
  const OLD_CLOUDS = [
    { x0: 5, y0: 8, speed: 0.0012, radius: 7, alphaScale: 1.0 },
    { x0: 40, y0: 20, speed: 0.0008, radius: 10, alphaScale: 0.7 },
    { x0: 70, y0: 5, speed: 0.0015, radius: 5, alphaScale: 0.85 },
    { x0: 20, y0: 45, speed: 0.001, radius: 8, alphaScale: 0.6 },
    { x0: 90, y0: 35, speed: 0.0009, radius: 6, alphaScale: 1.0 },
  ];
  const windDir = { x: 1, y: 0.35 };
  const windLen = Math.hypot(windDir.x, windDir.y);
  const windX = windDir.x / windLen;
  const windY = windDir.y / windLen;
  const wrap = (value: number, span: number): number => {
    const period = span + 2 * OLD_WRAP_MARGIN_TILES;
    const shifted = (((value + OLD_WRAP_MARGIN_TILES) % period) + period) % period;
    return shifted - OLD_WRAP_MARGIN_TILES;
  };
  const fade = (position: number, span: number): number => {
    if (position < 0) return Math.max(0, 1 + position / OLD_WRAP_MARGIN_TILES);
    if (position > span) return Math.max(0, 1 - (position - span) / OLD_WRAP_MARGIN_TILES);
    return 1;
  };
  return OLD_CLOUDS.map((cloud) => {
    const x = wrap(cloud.x0 + windX * cloud.speed * elapsedMs, width);
    const y = wrap(cloud.y0 + windY * cloud.speed * elapsedMs, height);
    const alpha = CLOUD_ALPHA_MAX * cloud.alphaScale * fade(x, width) * fade(y, height);
    return { x, y, radius: cloud.radius, strength: alpha };
  });
}

/**
 * Lower and upper bounds for `screenCoverage` on today's area-derived
 * `cloudsAt`, driven by `MAP_SIZES` (src/core/constants.ts) rather than a
 * hardcoded list of sizes - the point of this shape (issue #30's acceptance
 * "将来また地図サイズが変わったとき、この回帰が気づかせる") is that adding a
 * third MAP_SIZES entry automatically gets measured here with no test change.
 * Measured under the conditions screenCoverage.ts exports as constants
 * (16x14 tile window, 0.02 visible-strength threshold, 20 simulated minutes
 * sampled every 5s, window scanned across the map every 8 tiles):
 *
 *   vale (60x60):      66.4%  (9 clouds - round(36 * 60*60 / 120*120))
 *   frontier (120x120): 88.0%  (36 clouds - the untouched reference table)
 *
 * COVERAGE_FLOOR (55%) sits comfortably below the lower of those (vale,
 * ~66%) and above the old fixed-table's best case at either shipped size
 * (60x60, 44.0% - see the "does not catch" test below), so it only trips on
 * a real regression, not measurement noise.
 *
 * COVERAGE_CEILING (95%) is what turns clouds.ts's own comment - "90% is
 * deliberately not 100%: what is being bought is a sky that is usually doing
 * something, not permanent overcast" - into an assertion instead of prose.
 * Before this fix, vale (60x60) measured 99.6% here (the same fixed 36-cloud
 * table `frontier` uses, on a quarter of the area, with no scaling) - clearly
 * over this ceiling and clearly reading as permanent overcast. 95% leaves
 * headroom above both real measurements (66%, 88%) while still catching that
 * regression pattern if map-size scaling ever silently breaks again.
 */
const COVERAGE_FLOOR = 0.55;
const COVERAGE_CEILING = 0.95;

describe('screen coverage tracks map size (issue #30)', () => {
  it.each(Object.entries(MAP_SIZES).map(([name, size]) => [name, size, size] as const))(
    'cloudsAt stays between the coverage floor and ceiling on %s (%ix%i)',
    (_name, size) => {
      const coverage = screenCoverage((t) => toDiscs(cloudsAt(t, size, size)), size, size, {
        durationMs: COVERAGE_DURATION_MS,
      });
      expect(coverage).toBeGreaterThan(COVERAGE_FLOOR);
      expect(coverage).toBeLessThan(COVERAGE_CEILING);
    },
  );

  // 180x180 ships nowhere today (MAP_SIZES has only vale/frontier), but is
  // kept as an explicit guard for "a future map size much bigger than either
  // shipped one still reads as weather, not wallpaper" - the MAP_SIZES-driven
  // test above cannot exercise a size that is not in MAP_SIZES yet.
  it('also stays inside the band on a hypothetical 180x180 map', () => {
    const coverage = screenCoverage((t) => toDiscs(cloudsAt(t, 180, 180)), 180, 180, {
      durationMs: COVERAGE_DURATION_MS,
    });
    expect(coverage).toBeGreaterThan(COVERAGE_FLOOR);
    expect(coverage).toBeLessThan(COVERAGE_CEILING);
  });
});

describe('screenCoverage actually catches the #30 bug (sanity check, mirrors tileVariant.test.ts)', () => {
  it('the pre-fix fixed 5-cloud table falls below the coverage floor on the shipped 120x120 map', () => {
    // If this assertion ever failed, "screen coverage tracks map size"
    // above would not be testing anything - the metric has to be able to
    // fail on the known-bad input before it means anything that it passes
    // on the fixed one.
    const coverage = screenCoverage((t) => oldFixedCloudsAt(t, 120, 120), 120, 120, {
      durationMs: COVERAGE_DURATION_MS,
    });
    expect(coverage).toBeLessThan(COVERAGE_FLOOR);
    expect(coverage).toBeCloseTo(0.181, 2); // measured figure from the #30 investigation
  });

  it('the pre-fix table even falls below the floor on the 60x60 map it was tuned to look fine on', () => {
    const coverage = screenCoverage((t) => oldFixedCloudsAt(t, 60, 60), 60, 60, {
      durationMs: COVERAGE_DURATION_MS,
    });
    expect(coverage).toBeLessThan(COVERAGE_FLOOR);
    expect(coverage).toBeCloseTo(0.44, 2);
  });
});

// --- issue #30 follow-on: many clouds must still not read as a second night --
//
// The per-cloud ceiling above (CLOUD_ALPHA_MAX) was a sufficient guard while
// there were five clouds, because five clouds spread over a map essentially
// never stacked. Deriving the count from map area (36 on the shipped
// 120x120, more still on a larger hypothetical map) makes overlap ordinary,
// so the ceiling that actually matters now is the *composited* one, and
// nothing was measuring it.
//
// The composite model below used to assume normal (alpha) blending -
// "transmitted *= 1 - alpha_i" - which is wrong for how renderer.ts actually
// draws these: `ensureCloudTextures`/`syncClouds` use `blendMode: 'multiply'`
// with a fixed shadow color, not alpha-over-black. Multiply blending
// transmits each color channel independently: one layer at alpha `a`
// multiplies a channel's light by `1 - (1 - channel/255) * a`, not by
// `1 - a`. What the *player* perceives as darkening is the Rec. 709
// luminance-weighted combination of the three channels' transmittance, not
// the transmittance of any one channel.
describe('overlapping shadows still read as weather, not as darkness (multiply blend)', () => {
  /** The shadow color renderer.ts's `ensureCloudTextures` multiplies onto the
   *  ground (`rgba(36, 84, 196)`). Kept here as data, not copied into a
   *  formula, so a future color change in renderer.ts is a one-line update
   *  here too rather than a silent mismatch. */
  const SHADOW_COLOR = { r: 36, g: 84, b: 196 };
  /** Rec. 709 luma weights - same standard `perceivedBrightness`-style code
   *  elsewhere in this codebase would use for "how bright does this color
   *  read", applied here to how much a multiply layer perceptually darkens
   *  the ground rather than to the color itself. */
  const LUMA_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 };

  /**
   * How much one full-alpha (`a` = 1) multiply layer of `SHADOW_COLOR`
   * reduces perceived luminance, derived from the color and the weights
   * above rather than hardcoded - see the module comment for the per-channel
   * transmittance formula. This computes to ~0.679: a single cloud shadow at
   * `alpha` darkens perceived luminance by `LAYER_DARKEN_PER_ALPHA * alpha`.
   */
  const LAYER_DARKEN_PER_ALPHA =
    LUMA_WEIGHTS.r * (1 - SHADOW_COLOR.r / 255) +
    LUMA_WEIGHTS.g * (1 - SHADOW_COLOR.g / 255) +
    LUMA_WEIGHTS.b * (1 - SHADOW_COLOR.b / 255);

  /** Composite perceived darkening at one point from every overlapping
   *  shadow there. Each shadow's local alpha already carries the shadow
   *  texture's radial falloff (renderer.ts's gradient - see `distance /
   *  shadow.radius` below), and multiply layers compose by multiplying
   *  their transmittances, so the combined darkening is
   *  `1 - product(1 - LAYER_DARKEN_PER_ALPHA * alpha_i)`, not
   *  `1 - product(1 - alpha_i)` (that older formula was for alpha-over-black,
   *  which is not the blend mode renderer.ts uses). */
  function compositeDarkeningAt(
    shadows: { x: number; y: number; radius: number; alpha: number }[],
    x: number,
    y: number,
  ): number {
    let transmitted = 1;
    for (const shadow of shadows) {
      const distance = Math.hypot(x - shadow.x, y - shadow.y);
      if (distance > shadow.radius) continue;
      const localAlpha = shadow.alpha * (1 - distance / shadow.radius);
      transmitted *= 1 - LAYER_DARKEN_PER_ALPHA * localAlpha;
    }
    return 1 - transmitted;
  }

  // NIGHT_ALPHA (daylight.ts) is 0.45; staying under it is the line between
  // "weather passing overhead" and "a second night stacked on the first".
  // Measured worst case over 10 simulated minutes under this (correct,
  // multiply-blend) model, with today's area-derived cloud counts: 0.210 at
  // 60x60 (9 clouds), 0.319 at 120x120 (36 clouds), 0.389 at 180x180 (81
  // clouds, hypothetical). 0.42 leaves a decisive margin under NIGHT_ALPHA
  // while still failing if density were pushed noticeably higher.
  const COMPOSITE_CEILING = 0.42;

  it.each(Object.entries(MAP_SIZES).map(([name, size]) => [name, size, size] as const))(
    'never stacks past the ceiling anywhere on %s (%ix%i)',
    (_name, size) => {
      let worst = 0;
      for (let elapsedMs = 0; elapsedMs <= 10 * 60 * 1000; elapsedMs += 10_000) {
        const shadows = cloudsAt(elapsedMs, size, size);
        for (let x = 0; x < size; x += 4) {
          for (let y = 0; y < size; y += 4) {
            worst = Math.max(worst, compositeDarkeningAt(shadows, x, y));
          }
        }
      }
      expect(worst).toBeGreaterThan(CLOUD_ALPHA_MAX * 0.5); // the scan finds real shadows
      expect(worst).toBeLessThan(COMPOSITE_CEILING);
    },
  );

  // Same hypothetical-future-size guard as the coverage band above: 180x180
  // ships nowhere today, but is denser (81 clouds) than either shipped size,
  // so it is the sternest test of the ceiling actually holding as area grows.
  it('also stays under the ceiling on a hypothetical 180x180 map', () => {
    let worst = 0;
    for (let elapsedMs = 0; elapsedMs <= 10 * 60 * 1000; elapsedMs += 10_000) {
      const shadows = cloudsAt(elapsedMs, 180, 180);
      for (let x = 0; x < 180; x += 4) {
        for (let y = 0; y < 180; y += 4) {
          worst = Math.max(worst, compositeDarkeningAt(shadows, x, y));
        }
      }
    }
    expect(worst).toBeGreaterThan(CLOUD_ALPHA_MAX * 0.5);
    expect(worst).toBeLessThan(COMPOSITE_CEILING);
  });
});
