// Trade (design document 11章 フェーズ5, docs/design-phase5-trade.md).
//
// The colony has had exactly one way to get a resource: go and take it off the
// map. Trade is the second door, and it is the only one that turns a surplus
// into something the map does not have - which matters most for mana crystal,
// where a world can simply be short of veins.
//
// Three decisions from the design note shape everything here.
//
// **Barter, no currency.** A coin would let the player sell now and buy later,
// which turns every decision into a deferred one. "What can I part with today"
// is the same kind of question the storage and hauling puzzle already asks.
//
// **The trader does not walk.** They appear beside the post, stand there, and
// go. No pathfinding at all, so the A* budget the animal layer set out is
// untouched by however many visits happen.
//
// **The deal rides on the existing haul job.** Handing goods over is the same
// job that carries materials to a blueprint, with a finished building as the
// destination - exactly what the furnace refuel already does. No new job type,
// and the work-priority table stays at seven columns. A colony that has hauling
// on its lowest priority will watch deals expire, which is the same intended
// consequence as a furnace going cold.
import {
  ARRIVAL_FOOD_PER_COLONIST,
  RESOURCE_TYPES,
  TRADE_BASE_VALUE,
  TRADE_BUY_RATE,
  TRADE_INTERVAL_TICKS,
  TRADE_SELL_RATE,
  TRADE_STAY_TICKS,
} from './constants';
import { isPowered } from './mana';
import type { ManaNetworks } from './mana';
import { mulberry32 } from './rng';
import { addLog, nextId, tileIdOf } from './state';
import type {
  GameState,
  ResourceType,
  TradeOffer,
  Trader,
  TraderId,
  TraderKind,
  Vector2,
} from './types';

const PEDLAR_NAMES = ['Halden', 'Mirrow', 'Tolly', 'Brisk', 'Perrin', 'Odile'];
const FACTOR_NAMES = ['Quill', 'Vantry', 'Ossian', 'Marek', 'Selene'];

/** What a trader will hand over, per kind. */
const STOCK: Record<TraderKind, ResourceType[]> = {
  pedlar: ['wood', 'stone', 'food'],
  // the second reward for a lit grid: the only route to mana that does not
  // require the map to have given you a vein
  crystalFactor: ['wood', 'stone', 'food', 'manaCrystal'],
};

export function traderCount(state: GameState): number {
  return Object.keys(state.traders ?? {}).length;
}

/** The post a trader stands beside, or null if the colony has not built one. */
export function findTradingPost(state: GameState): string | null {
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.type === 'tradingPost' && !building.isBlueprint) return id;
  }
  return null;
}

/**
 * Is there a lamp that is actually lit?
 *
 * This is what upgrades a pedlar into a crystal factor. Deliberately *not* a
 * condition for trade itself: the design note records nearly walking into a
 * closed loop where a world with no veins needs mana to light a lamp to buy the
 * mana. The basic pedlar comes for food alone, so the loop stays open.
 */
export function hasLitLamp(state: GameState, networks: ManaNetworks): boolean {
  for (const id in state.buildings) {
    const building = state.buildings[id];
    if (building.type !== 'manaLamp' || building.isBlueprint) continue;
    if (isPowered(networks, id)) return true;
  }
  return false;
}

function foodInStore(state: GameState): number {
  let food = 0;
  for (const id in state.items) {
    if (state.items[id].type === 'food') food += state.items[id].quantity;
  }
  return food;
}

/** A free tile next to the post for the trader to stand on. */
function stallSpot(state: GameState, postId: string): Vector2 | null {
  const tile = state.tiles[state.buildings[postId].tileId];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const next = state.tiles[tileIdOf(tile.x + dx, tile.y + dy)];
    if (next && next.walkable) return { x: next.x, y: next.y };
  }
  return null;
}

/**
 * Prices come from the tick *and* the world seed, the same discipline the
 * incidents follow: the tick alone would give every colony ever started the
 * same market, and the seed alone would freeze it. Reloading a save brings the
 * same trader with the same goods at the same price.
 */
export function marketSeed(state: GameState): () => number {
  return mulberry32(Math.abs(Math.floor(state.worldSeed)) * 41 + state.tick + 130001);
}

function buildOffers(kind: TraderKind, rnd: () => number): TradeOffer[] {
  const offers: TradeOffer[] = [];
  for (const resource of STOCK[kind]) {
    // Not everything every time - a stall the player has to read - except the
    // one thing the visit is named for. A crystal factor who turns up without
    // crystal makes the lamp a coin flip rather than an upgrade, and reopens
    // the closed loop the design note went out of its way to avoid.
    const staple = resource === 'manaCrystal';
    if (!staple && rnd() < 0.35) continue;
    const bulk = resource === 'manaCrystal' ? 4 : resource === 'food' ? 60 : 80;
    offers.push({
      resource,
      quantity: Math.max(1, Math.round(bulk * (0.6 + rnd() * 0.8))),
      // a spread around the base value, never below it: this is the sell side
      rate: TRADE_SELL_RATE * (0.9 + rnd() * 0.3),
    });
  }
  return offers;
}

function buildWants(rnd: () => number): TradeOffer[] {
  const wants: TradeOffer[] = [];
  for (const resource of RESOURCE_TYPES) {
    wants.push({
      resource,
      quantity: Number.MAX_SAFE_INTEGER, // they take as much as is carried to them
      rate: TRADE_BUY_RATE * (0.9 + rnd() * 0.2),
    });
  }
  return wants;
}

/** The trader standing at the post right now, if any. */
export function traderAtPost(state: GameState): Trader | null {
  for (const id in state.traders ?? {}) return state.traders[id];
  return null;
}

/** Player action: agree what to hand over and what to take for it. */
export function setTradeDeal(
  state: GameState,
  traderId: TraderId,
  give: ResourceType,
  take: ResourceType,
): GameState {
  const trader = state.traders?.[traderId];
  if (!trader || give === take) return state;
  if (!trader.offers.some((o) => o.resource === take)) return state;
  return {
    ...state,
    traders: { ...state.traders, [traderId]: { ...trader, deal: { give, take } } },
  };
}

/** Player action: call the deal off. */
export function clearTradeDeal(state: GameState, traderId: TraderId): GameState {
  const trader = state.traders?.[traderId];
  if (!trader || !trader.deal) return state;
  return {
    ...state,
    traders: { ...state.traders, [traderId]: { ...trader, deal: null } },
  };
}

/**
 * Hand over a delivered stack and put the payment on the ground at the post.
 *
 * Returns what was paid, so the caller can say so. Anything the credit does not
 * cover a whole unit of is lost - the trader is not running a tab, which is the
 * whole point of not having a currency.
 */
export function settleDelivery(
  state: GameState,
  traderId: TraderId,
  resource: ResourceType,
  quantity: number,
): { resource: ResourceType; quantity: number } | null {
  const trader = state.traders?.[traderId];
  if (!trader || !trader.deal) return null;
  const credit = creditFor(trader, resource, quantity);
  const take = trader.deal.take;
  const paid = goodsFor(trader, take, credit);
  if (paid <= 0) return null;

  state.traders = {
    ...state.traders,
    [traderId]: {
      ...trader,
      offers: trader.offers.map((o) =>
        o.resource === take ? { ...o, quantity: o.quantity - paid } : o,
      ),
    },
  };
  return { resource: take, quantity: paid };
}

/** What the colony gets for handing over `quantity` of `resource`. */
export function creditFor(
  trader: Trader,
  resource: ResourceType,
  quantity: number,
): number {
  const want = trader.wants.find((w) => w.resource === resource);
  if (!want) return 0;
  return TRADE_BASE_VALUE[resource] * want.rate * quantity;
}

/** How much of `resource` that credit buys from this trader. */
export function goodsFor(trader: Trader, resource: ResourceType, credit: number): number {
  const offer = trader.offers.find((o) => o.resource === resource);
  if (!offer) return 0;
  const unit = TRADE_BASE_VALUE[resource] * offer.rate;
  return Math.min(offer.quantity, Math.floor(credit / unit));
}

/**
 * Roll for a visit. Same shape as the arrivals check - schedule from the tick,
 * conditions from the state - but with the seasons the other way round: nobody
 * crosses a frozen map to settle, and a trader crosses it precisely because
 * winter is when the colony has least else to do.
 */
export function runTrade(state: GameState, networks: ManaNetworks): void {
  // see the visitors off first, so a post is never blocked by yesterday's stall
  for (const id in state.traders) {
    const trader = state.traders[id];
    if (state.tick < trader.departsAtTick) continue;
    const { [id]: _gone, ...rest } = state.traders;
    state.traders = rest;
    addLog(state, `${trader.name} packs up and leaves`, 'incident');
  }

  if (state.tick === 0 || state.tick % TRADE_INTERVAL_TICKS !== 0) return;
  if (traderCount(state) > 0) return;

  const postId = findTradingPost(state);
  if (!postId) return;

  const population = Object.keys(state.colonists).length;
  if (population === 0) return;
  // the same threshold the arrivals use: a colony with two of them would be a
  // colony where "enough food" meant two different things
  if (foodInStore(state) < population * ARRIVAL_FOOD_PER_COLONIST) return;

  const spot = stallSpot(state, postId);
  if (!spot) return;

  const rnd = marketSeed(state);
  const kind: TraderKind = hasLitLamp(state, networks) ? 'crystalFactor' : 'pedlar';
  const names = kind === 'crystalFactor' ? FACTOR_NAMES : PEDLAR_NAMES;
  const id = nextId(state, 't');
  const trader: Trader = {
    id,
    kind,
    name: names[Math.floor(rnd() * names.length)],
    position: spot,
    departsAtTick: state.tick + TRADE_STAY_TICKS,
    offers: buildOffers(kind, rnd),
    wants: buildWants(rnd),
    deal: null,
  };
  state.traders = { ...state.traders, [id]: trader };
  addLog(
    state,
    kind === 'crystalFactor'
      ? `${trader.name}, a crystal factor, has set up at the post`
      : `${trader.name} the pedlar has set up at the post`,
    'incident',
  );
}
