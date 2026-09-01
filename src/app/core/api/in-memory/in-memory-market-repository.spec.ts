import { firstValueFrom } from 'rxjs';
import {
  InMemoryMarketRepository,
  buildMarketStallPlan,
  rowOf,
} from './in-memory-market-repository';
import { MARKETS_FIXTURE } from './market-fixture';
import { VENDORS_FIXTURE } from './in-memory-vendor-repository';
import { MarketStallPlan, MarketStatus } from '../../models/market.model';

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
    expect(settings.name).toBe(card.name);
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

    const [detail, rows] = await Promise.all([
      firstValueFrom(repo.detail('temple-bar')),
      firstValueFrom(repo.list()),
    ]);
    expect(detail.stalls.some((stall) => stall.id === 'Z9')).toBe(true);
    expect(rows.find((row) => row.slug === 'temple-bar')?.metrics?.stallsTotal).toBe(grown.length);
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

/**
 * `draft()` is what the wizard re-opens a market with, and re-saving one is how
 * a draft is finished. The fixture ships exactly one draft (`bantry-friday`),
 * which is the case that matters: it is already a row in `MARKETS_FIXTURE`, so
 * saving it again must update that row rather than stand a second one beside it.
 */
describe('InMemoryMarketRepository drafts', () => {
  const DRAFT = 'bantry-friday';

  it('hands the wizard every field of a stored market at once', async () => {
    const repo = new InMemoryMarketRepository();

    const draft = await firstValueFrom(repo.draft(DRAFT));

    // One payload spanning all three steps — details, location and schedule.
    expect(draft.name).toBe('Bantry Friday Market');
    expect(draft.slug).toBe(DRAFT);
    expect(draft.address).not.toBe('');
    expect(draft.tradingDays).toEqual([5]);
    expect(draft.stallFeePerDay).toBeGreaterThan(0);
  });

  it('rejects a slug no market has', async () => {
    const repo = new InMemoryMarketRepository();

    await expect(firstValueFrom(repo.draft('no-such-market'))).rejects.toThrow(/no-such-market/);
  });

  it('reads back what the wizard last saved', async () => {
    const repo = new InMemoryMarketRepository();
    const draft = await firstValueFrom(repo.draft(DRAFT));

    await firstValueFrom(repo.saveDraft({ ...draft, name: 'Bantry Harbour Market' }));

    expect((await firstValueFrom(repo.draft(DRAFT))).name).toBe('Bantry Harbour Market');
  });

  it('publishes the draft in place, without forking a second market', async () => {
    const repo = new InMemoryMarketRepository();
    const before = (await firstValueFrom(repo.list())).length;
    const draft = await firstValueFrom(repo.draft(DRAFT));

    await firstValueFrom(repo.publish(draft));
    const rows = await firstValueFrom(repo.list());

    expect(rows.length).toBe(before);
    expect(rows.filter((market) => market.slug === DRAFT)).toHaveLength(1);
    expect(rows.find((market) => market.slug === DRAFT)?.status).toBe(MarketStatus.Published);
  });
});
