// The stall, while somebody is standing at it.
//
// Silent when there is no trader, which is almost always: a panel that is
// present and empty teaches the player to stop reading it.
import { RESOURCE_LABELS, TRADE_BASE_VALUE } from '../core/constants';
import { creditFor, goodsFor } from '../core/trade';
import type { ResourceType, Trader } from '../core/types';
import { useGameStore } from '../store/gameStore';

/** Flat strings only: the selector has to stay shallow-comparable. */
export function describeTrader(trader: Trader | null, tick: number): string[] {
  if (!trader) return [];
  const rows = [
    `Who: ${trader.name}`,
    `Trade: ${trader.kind === 'crystalFactor' ? 'crystal factor' : 'pedlar'}`,
    `Leaves: in ${Math.max(0, Math.round((trader.departsAtTick - tick) / 125))} hours`,
  ];
  for (const offer of trader.offers) {
    rows.push(
      `Sells: ${offer.quantity} ${RESOURCE_LABELS[offer.resource]} at ${(
        TRADE_BASE_VALUE[offer.resource] * offer.rate
      ).toFixed(1)} each`,
    );
  }
  if (trader.deal) {
    rows.push(`Deal: ${RESOURCE_LABELS[trader.deal.give]} for ${RESOURCE_LABELS[trader.deal.take]}`);
  }
  return rows;
}

/** What one stack of `give` would fetch, so the player is not guessing. */
export function previewTrade(
  trader: Trader,
  give: ResourceType,
  take: ResourceType,
  quantity: number,
): number {
  return goodsFor(trader, take, creditFor({ ...trader, deal: { give, take } }, give, quantity));
}

export function TradePanel(): React.JSX.Element | null {
  const trader = useGameStore((s) => {
    const ids = Object.keys(s.state.traders ?? {});
    return ids.length > 0 ? s.state.traders[ids[0]] : null;
  });
  const tick = useGameStore((s) => s.state.tick);
  const setDeal = useGameStore((s) => s.setTradeDeal);
  const clearDeal = useGameStore((s) => s.clearTradeDeal);
  if (!trader) return null;

  const rows = describeTrader(trader, tick);
  const sellable: ResourceType[] = ['wood', 'stone', 'food', 'manaCrystal'];

  return (
    <section className="panel">
      <h2>Trader</h2>
      {rows.map((row) => (
        <div className="inspect__row" key={row}>
          {row}
        </div>
      ))}
      <p className="muted small">
        Pick what to hand over and what to take. Hauling it there is ordinary
        haul work, so it competes with everything else on that column.
      </p>
      <div className="trade">
        {trader.offers.map((offer) => (
          <div className="trade__row" key={offer.resource}>
            <span className="trade__take">{RESOURCE_LABELS[offer.resource]}</span>
            {sellable
              .filter((give) => give !== offer.resource)
              .map((give) => (
                <button
                  key={give}
                  type="button"
                  className="trade__give"
                  title={`hand over ${RESOURCE_LABELS[give]} for ${RESOURCE_LABELS[offer.resource]}`}
                  onClick={() => setDeal(trader.id, give, offer.resource)}
                >
                  ← {RESOURCE_LABELS[give]}
                </button>
              ))}
          </div>
        ))}
      </div>
      {trader.deal ? (
        <button type="button" className="work__auto" onClick={() => clearDeal(trader.id)}>
          Call the deal off
        </button>
      ) : null}
    </section>
  );
}
