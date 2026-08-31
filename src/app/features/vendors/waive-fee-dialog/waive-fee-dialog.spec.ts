import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { buildLedger } from '../../../core/api/in-memory/in-memory-payment-repository';
import { WaiveFeeDialog, WaiveFeeDialogData } from './waive-fee-dialog';

const OPEN_INVOICE = buildLedger('mcnally-family-farm')!.payments.find(
  (payment) => payment.status === 'due',
)!;

const closed: string[] = [];
const ref = { close: (reason?: string) => closed.push(reason ?? '') };

function open() {
  const fixture = TestBed.createComponent(WaiveFeeDialog);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: { nativeElement: unknown }): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function confirm(fixture: { nativeElement: unknown; detectChanges(): void }) {
  const button = Array.from(host(fixture).querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes('Waive the fee'),
  ) as HTMLButtonElement;
  button.click();
  fixture.detectChanges();
}

describe('WaiveFeeDialog', () => {
  beforeEach(async () => {
    closed.length = 0;
    const data: WaiveFeeDialogData = {
      payment: OPEN_INVOICE,
      vendorName: 'McNally Family Farm',
    };
    await TestBed.configureTestingModule({
      imports: [WaiveFeeDialog],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: ref },
      ],
    }).compileComponents();
  });

  it('names the money, the vendor and the market day being cancelled', () => {
    const fixture = open();
    const text = host(fixture).textContent ?? '';

    expect(text).toContain('€35');
    expect(text).toContain('McNally Family Farm');
    expect(text).toContain('Marlay Park Market');
    expect(text).toContain('Sat 22 Aug · stall 12');
    expect(text).toContain('Organisers see the waiver on their sheet.');
  });

  it('will not waive without a reason — it is the only record of the fee', () => {
    const fixture = open();

    confirm(fixture);

    expect(closed).toEqual([]);
    expect(host(fixture).textContent).toContain('Say why the fee is being waived');
  });

  it('hands the reason back once one is given', () => {
    const fixture = open();

    const reason = host(fixture).querySelector('textarea') as HTMLTextAreaElement;
    reason.value = '  Market cancelled for weather, agreed with the organiser.  ';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    confirm(fixture);

    expect(closed).toEqual(['Market cancelled for weather, agreed with the organiser.']);
  });
});
