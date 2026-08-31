import { firstValueFrom } from 'rxjs';
import {
  InMemoryMarketRepository,
  buildMarketStallPlan,
  rowOf,
} from './in-memory-market-repository';
import { MARKETS_FIXTURE } from './market-fixture';
import { VENDORS_FIXTURE } from './in-memory-vendor-repository';
import { MarketStallPlan } from '../../models/market.model';

/**
 * The stall plan is the source of truth for three things an organiser can see
 * at once — the map on the Overview, the "Stalls filled" tile beside it, and
 * the stall count on the Settings tab. These are what stops them disagreeing.
 */
describe('InMemoryMarketRepository stall plans', () => {
  const slugs = MARKETS_FIXTURE.map((market) => market.slug);
  const vendorSlugs = new Set(VENDORS_FIXTURE.map((vendor) => vendor.slug));

  it.each(slugs)('ships a well-formed layout for %s', (slug) => {
    const plan = buildMarketStallPlan(slug)!;
    expect(plan.length).toBeGreaterThan(0);

    const ids = plan.map((pitch) => pitch.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pitch of plan) {
      // The reference is its row and its number, which is how a market is walked.
      expect(pitch.row).toBe(rowOf(pitch.id));
      expect(pitch.id).toMatch(/^[A-Z]+\d+$/);
    }
  });

  it.each(slugs)('stands every vendor on %s exactly once, and only real ones', (slug) => {
    const placed = buildMarketStallPlan(slug)!
      .map((pitch) => pitch.vendorSlug)
      .filter((vendor): vendor is string => vendor !== null);

    expect(new Set(placed).size).toBe(placed.length);
    for (const vendor of placed) expect(vendorSlugs.has(vendor)).toBe(true);
  });

  it.each(slugs)('counts %s the same way on every screen it appears', async (slug) => {
    const repo = new InMemoryMarketRepository();
    const [plan, detail, settings, rows] = await Promise.all([
      firstValueFrom(repo.stallPlan(slug)),
      firstValueFrom(repo.detail(slug)),
      firstValueFrom(repo.settings(slug)),
      firstValueFrom(repo.list()),
    ]);
    const filled = plan.filter((pitch) => pitch.vendorSlug).length;
    const card = rows.find((row) => row.slug === slug)!;

    expect(detail.stalls.length).toBe(plan.length);
    expect(settings.stallCount).toBe(plan.length);
    if (card.metrics) {
      expect(card.metrics.stallsTotal).toBe(plan.length);
      expect(card.metrics.stallsFilled).toBe(filled);
    }
    // A pitch is free on the map exactly when it is empty in the plan.
    expect(detail.stalls.filter((stall) => stall.state === 'free').length).toBe(
      plan.length - filled,
    );
  });

  it('draws a saved layout back on the map and in the counts', async () => {
    const repo = new InMemoryMarketRepository();
    const plan = await firstValueFrom(repo.stallPlan('temple-bar'));

    const grown: MarketStallPlan = [...plan, { id: 'Z9', row: 'Z', vendorSlug: null }];
    await firstValueFrom(repo.saveStallPlan('temple-bar', grown));

    const [detail, settings] = await Promise.all([
      firstValueFrom(repo.detail('temple-bar')),
      firstValueFrom(repo.settings('temple-bar')),
    ]);
    expect(detail.stalls.some((stall) => stall.id === 'Z9')).toBe(true);
    expect(settings.stallCount).toBe(grown.length);
  });

  it('leaves the fee with the vendor when they move pitch', async () => {
    const repo = new InMemoryMarketRepository();
    const before = await firstValueFrom(repo.detail('temple-bar'));
    const owing = before.stalls.find((stall) => stall.state === 'unpaid')!;
    expect(owing).toBeDefined();

    // Move whoever owes onto a pitch that was free.
    const plan = await firstValueFrom(repo.stallPlan('temple-bar'));
    const vendor = plan.find((pitch) => pitch.id === owing.id)!.vendorSlug;
    const free = plan.find((pitch) => !pitch.vendorSlug)!;
    await firstValueFrom(
      repo.saveStallPlan(
        'temple-bar',
        plan.map((pitch) => {
          if (pitch.id === owing.id) return { ...pitch, vendorSlug: null };
          if (pitch.id === free.id) return { ...pitch, vendorSlug: vendor };
          return pitch;
        }),
      ),
    );

    const after = await firstValueFrom(repo.detail('temple-bar'));
    // The debt followed them; it did not stay behind on the pitch.
    expect(after.stalls.find((stall) => stall.id === owing.id)?.state).toBe('free');
    expect(after.stalls.find((stall) => stall.id === free.id)?.state).toBe('unpaid');
  });
});
