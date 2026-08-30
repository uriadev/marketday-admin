import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { PaymentRepository } from '../../core/api/ports/payment-repository';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import { buildLedger } from '../../core/api/in-memory/in-memory-payment-repository';
import {
  MCNALLY_DETAIL,
  MCNALLY_PROFILE,
  VENDORS_FIXTURE,
} from '../../core/api/in-memory/in-memory-vendor-repository';
import { StallPayment, VendorLedger } from '../../core/models/payment.model';
import {
  VendorDetail,
  VendorInvite as VendorInviteModel,
  VendorInviteSummary,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../core/models/vendor.model';
import { VendorDetailFacade } from './vendor-detail-facade';
import { VendorPayments } from './vendor-payments';
import { VendorPaymentsStore } from './vendor-payments-store';

/**
 * The shipped fixture, answered synchronously — the specs assert on McNally's
 * real ledger, and nothing here waits on a timer (there is no zone.js to fake).
 */
class StubPaymentRepository extends PaymentRepository {
  private ledger_ = buildLedger('mcnally-family-farm')!;

  override ledger(vendorSlug: string): Observable<VendorLedger> {
    if (vendorSlug !== 'mcnally-family-farm') {
      return throwError(() => new Error(`No vendor matches “${vendorSlug}”.`));
    }
    return of(this.ledger_);
  }

  override markPaid(_slug: string, paymentId: string): Observable<StallPayment> {
    return this.settle(paymentId, (payment) => ({
      ...payment,
      status: 'paid',
      reference: 'recorded in the console',
    }));
  }

  override waive(_slug: string, paymentId: string, reason: string): Observable<StallPayment> {
    return this.settle(paymentId, (payment) => ({
      ...payment,
      status: 'waived',
      amount: 0,
      reference: reason,
      lateDays: 0,
    }));
  }

  override sendReminder(_slug: string, paymentId: string): Observable<StallPayment> {
    return this.settle(paymentId, (payment) => ({
      ...payment,
      reference: 'reminder sent just now',
    }));
  }

  private settle(
    paymentId: string,
    map: (payment: StallPayment) => StallPayment,
  ): Observable<StallPayment> {
    const current = this.ledger_.payments.find((payment) => payment.id === paymentId);
    if (!current || current.status !== 'due') {
      return throwError(() => new Error('That invoice is already settled.'));
    }
    const updated = map(current);
    this.ledger_ = {
      ...this.ledger_,
      payments: this.ledger_.payments.map((payment) =>
        payment.id === paymentId ? updated : payment,
      ),
    };
    return of(updated);
  }
}

class StubVendorRepository extends VendorRepository {
  override list(): Observable<readonly VendorSummary[]> {
    return of(VENDORS_FIXTURE);
  }
  override detail(): Observable<VendorDetail> {
    return of(MCNALLY_DETAIL);
  }
  override profile(): Observable<VendorProfile> {
    return of(MCNALLY_PROFILE);
  }
  override saveProfile(_slug: string, patch: VendorProfilePatch): Observable<VendorProfile> {
    return of({ ...MCNALLY_PROFILE, ...patch });
  }
  override inviteSummary(): Observable<VendorInviteSummary> {
    return of({ sentThisMonth: 14, linkValidDays: 14, reminderAfterDays: 5 });
  }
  override invite(invite: VendorInviteModel): Observable<VendorSummary> {
    return of({
      ...VENDORS_FIXTURE[0]!,
      slug: 'invited-vendor',
      name: invite.businessName,
      standing: 'invited',
      standingLabel: 'Invitation pending',
    });
  }
}

function open(slug = 'mcnally-family-farm') {
  TestBed.inject(VendorDetailFacade).load(slug);
  const fixture = TestBed.createComponent(VendorPayments);
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: { nativeElement: unknown }): string {
  return host(fixture).textContent ?? '';
}

function rows(fixture: { nativeElement: unknown }): HTMLElement[] {
  return Array.from(host(fixture).querySelectorAll('tbody tr'));
}

/** The stat tile whose label reads `label`. */
function tile(fixture: { nativeElement: unknown }, label: string): HTMLElement {
  const match = Array.from(host(fixture).querySelectorAll('md-stat-tile')).find((element) =>
    element.textContent?.includes(label),
  );
  expect(match).toBeDefined();
  return match as HTMLElement;
}

function banner(fixture: { nativeElement: unknown }): HTMLElement | null {
  return host(fixture).querySelector('.alert');
}

function button(scope: HTMLElement, label: string): HTMLButtonElement {
  const match = Array.from(scope.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  );
  expect(match).toBeDefined();
  return match as HTMLButtonElement;
}

describe('VendorPayments', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorPayments],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorDetailFacade,
        VendorPaymentsStore,
        { provide: PaymentRepository, useClass: StubPaymentRepository },
        { provide: VendorRepository, useClass: StubVendorRepository },
      ],
    }).compileComponents();
  });

  it('leads with what is owed, and says trading is not blocked', () => {
    const fixture = open();
    const alert = banner(fixture);

    expect(alert?.textContent).toContain('€35 outstanding · Marlay Park Market');
    expect(alert?.textContent).toContain('2 days late');
    expect(alert?.textContent).toContain(
      'Their other memberships are paid up, so trading is not blocked yet.',
    );
  });

  it('tallies the year from the ledger itself', () => {
    const fixture = open();

    expect(tile(fixture, 'Outstanding').textContent).toContain('€35');
    expect(tile(fixture, 'Outstanding').textContent).toContain('1 invoice, 2 days late');
    // Two markets still billed at €35; the paused one is charged nothing.
    expect(tile(fixture, 'Next charge').textContent).toContain('€70');
    expect(tile(fixture, 'Next charge').textContent).toContain('Mon 25 Aug · 2 markets');
    // Two of the settled charges landed late, so this is never a bare total.
    expect(tile(fixture, 'Paid on time').textContent).toContain('/');
    expect(tile(fixture, 'Paid this year').textContent).toContain('market days');
  });

  it('renders a line per charge, with its reference and what it was for', () => {
    const fixture = open();

    const due = rows(fixture)[0]!;
    expect(due.textContent).toContain('20 Aug 2026');
    expect(due.textContent).toContain('Marlay Park Market');
    expect(due.textContent).toContain('Sat 22 Aug · stall 12');
    expect(due.textContent).toContain('attempt failed');
    expect(due.textContent).toContain('Due · 2 days late');

    // A refund is money going back out, and reads that way.
    const refund = rows(fixture).find((row) => row.textContent?.includes('re_7H88DR'));
    expect(refund?.textContent).toContain('−€35');
    expect(refund?.textContent).toContain('Refunded');

    const waived = rows(fixture).find((row) => row.textContent?.includes('waived by Gráinne'));
    expect(waived?.textContent).toContain('Waived');
    expect(waived?.textContent).toContain('€0');
  });

  it('settles the open invoice, and every figure that restated it follows', () => {
    const fixture = open();

    button(banner(fixture)!, 'Mark paid').click();
    fixture.detectChanges();

    expect(banner(fixture)).toBeNull();
    expect(tile(fixture, 'Outstanding').textContent).toContain('€0');
    expect(tile(fixture, 'Outstanding').textContent).toContain('Nothing owed');
    // The rail's fee line for that market catches up too.
    const rail = host(fixture).querySelector('aside') as HTMLElement;
    expect(rail.textContent).not.toContain('€35 due since 20 Aug');
    expect(rows(fixture)[0]?.textContent).toContain('recorded in the console');
  });

  it('records that a reminder went out without settling anything', () => {
    const fixture = open();

    button(banner(fixture)!, 'Send reminder').click();
    fixture.detectChanges();

    expect(rows(fixture)[0]?.textContent).toContain('reminder sent just now');
    // Still owed — chasing is not paying.
    expect(banner(fixture)).not.toBeNull();
    expect(tile(fixture, 'Outstanding').textContent).toContain('€35');
  });

  it('offers to waive only while something is outstanding', () => {
    const fixture = open();
    const rail = host(fixture).querySelector('aside') as HTMLElement;

    expect(button(rail, 'Waive the Marlay Park Market fee').disabled).toBe(false);

    button(banner(fixture)!, 'Mark paid').click();
    fixture.detectChanges();

    const settled = host(fixture).querySelector('aside') as HTMLElement;
    expect(button(settled, 'Waive').disabled).toBe(true);
  });

  it('narrows the ledger to one market', () => {
    const fixture = open();
    const store = TestBed.inject(VendorPaymentsStore);
    const templeBar = MCNALLY_DETAIL.memberships[0]!.marketSlug;

    store.setFilters({ market: templeBar });
    fixture.detectChanges();

    const markets = rows(fixture).map((row) => row.textContent);
    expect(markets.length).toBeGreaterThan(0);
    expect(markets.every((row) => row?.includes('Temple Bar'))).toBe(true);
    expect(markets.some((row) => row?.includes('Marlay Park'))).toBe(false);
  });

  it('reaches further back when the period widens', () => {
    const fixture = open();
    const store = TestBed.inject(VendorPaymentsStore);

    const sixMonths = store.visible().length;
    store.setFilters({ period: 'all' });
    fixture.detectChanges();

    expect(store.visible().length).toBeGreaterThan(sixMonths);
    // The table still pages ten at a time, whatever the period covers.
    expect(rows(fixture).length).toBe(10);
  });

  it('shows the fee terms per market and the card they come off', () => {
    const fixture = open();
    const rail = host(fixture).querySelector('aside') as HTMLElement;

    expect(rail.textContent).toContain('€35 per day · weekly, card');
    expect(rail.textContent).toContain('€35 due since 20 Aug');
    // The paused membership is charged nothing rather than shown as €0 due.
    expect(rail.textContent).toContain('Nothing due while paused');
    expect(rail.textContent).toContain('Visa ···· 4417');
    expect(rail.textContent).toContain('expires 09/28');
    expect(rail.textContent).toContain('Howth Harbour Market invoices by bank transfer instead.');
  });
});

/** A vendor slug nothing matches — the tab has to say so, not sit blank. */
class MissingLedgerRepository extends StubPaymentRepository {
  override ledger(): Observable<VendorLedger> {
    return throwError(() => new Error('No vendor matches “nobody”.'));
  }
}

describe('VendorPayments for a vendor that is not there', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VendorPayments],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        VendorDetailFacade,
        VendorPaymentsStore,
        { provide: PaymentRepository, useClass: MissingLedgerRepository },
        { provide: VendorRepository, useClass: StubVendorRepository },
      ],
    }).compileComponents();
  });

  it('reports the error and offers a retry', () => {
    const fixture = open('nobody');

    expect(text(fixture)).toContain('No vendor matches “nobody”.');
    expect(text(fixture)).toContain('Retry');
    expect(host(fixture).querySelector('table')).toBeNull();
  });
});
