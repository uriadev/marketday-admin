import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthStore } from '../../../core/auth/auth-store';
import { Notifications } from '../../../core/notifications/notifications';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { BrandMark } from '../../../shared/components/brand-mark/brand-mark';
import {
  VENDOR_TRADES,
  VendorInvite as VendorInviteModel,
  VendorMemberRole,
} from '../../../core/models/vendor.model';
import { VendorInviteFacade } from '../vendor-invite-facade';

const ROLE_LABELS: Record<VendorMemberRole, string> = {
  [VendorMemberRole.Owner]: 'Vendor owner · can add staff and book stalls',
  [VendorMemberRole.Staff]: 'Stallholder · can work a stall, not change the business',
};

/**
 * Invite vendor (design 1n): one form, with the email it will send previewed
 * beside it.
 *
 * The preview is not decoration — an invitation is the first thing a vendor
 * ever sees of MarketDay, and it goes out under the admin's name, so it is
 * worth reading before sending.
 */
@Component({
  selector: 'md-vendor-invite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [VendorInviteFacade],
  imports: [
    RouterLink,
    ReactiveFormsModule,
    PageHeader,
    StatusPill,
    BrandMark,
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './vendor-invite.html',
  styleUrl: './vendor-invite.css',
})
export class VendorInvite implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly notifications = inject(Notifications);
  private readonly auth = inject(AuthStore);

  protected readonly facade = inject(VendorInviteFacade);
  protected readonly trades = VENDOR_TRADES;
  protected readonly roles = Object.entries(ROLE_LABELS) as [VendorMemberRole, string][];

  protected readonly form = this.fb.group({
    businessName: this.fb.control('', Validators.required),
    contactName: this.fb.control('', Validators.required),
    email: this.fb.control('', [Validators.required, Validators.email]),
    phone: this.fb.control(''),
    trade: this.fb.control(VENDOR_TRADES[0]!, Validators.required),
    role: this.fb.control(VendorMemberRole.Owner, Validators.required),
    skipApplicationReview: this.fb.control(false),
    note: this.fb.control('', Validators.maxLength(400)),
  });

  /**
   * Markets live outside the group: they are chosen as chips rather than typed,
   * and "none picked" means every market rather than an invalid form.
   */
  protected readonly selectedMarkets = signal<readonly string[]>([]);

  /** What has been typed into the chip input, narrowing the autocomplete. */
  protected readonly marketQuery = signal('');

  /** The chosen markets as chips, kept in the order the market list gives. */
  protected readonly selectedMarketRows = computed(() => {
    const chosen = new Set(this.selectedMarkets());
    return this.facade.markets$().filter((market) => chosen.has(market.slug));
  });

  /** What is left to pick — a market already chipped is off the list. */
  protected readonly marketOptions = computed(() => {
    const chosen = new Set(this.selectedMarkets());
    const query = this.marketQuery().trim().toLowerCase();
    return this.facade
      .markets$()
      .filter(
        (market) =>
          !chosen.has(market.slug) &&
          (query === '' ||
            market.name.toLowerCase().includes(query) ||
            market.county.toLowerCase().includes(query)),
      );
  });

  protected readonly marketsHint = computed(() =>
    this.selectedMarkets().length === 0
      ? `Leave this empty and they can apply to all ${this.facade.marketCount()} markets.`
      : 'They can only apply to the markets listed here.',
  );

  /** Re-read on every keystroke, so the email preview tracks the form. */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly invitedBy = computed(() => this.auth.user()?.name ?? 'MarketDay');

  protected readonly preview = computed(() => {
    const { businessName, email, note } = this.value();
    return {
      to: email || 'their email address',
      subject: `${this.invitedBy()} invited ${businessName || 'a vendor'} to MarketDay`,
      note,
    };
  });

  /** "Two markets selected · owner access" — the footer's running summary. */
  protected readonly summary = computed(() => {
    const count = this.selectedMarkets().length;
    const scope =
      count === 0
        ? `All ${this.facade.marketCount()} markets`
        : `${count} ${count === 1 ? 'market' : 'markets'} selected`;
    const access = this.value().role === VendorMemberRole.Owner ? 'owner access' : 'stall access';
    return `${scope} · ${access}`;
  });

  protected readonly headerNote = computed(() => {
    const sent = this.facade.summary()?.sentThisMonth;
    return sent === undefined ? '' : `${sent} invitations sent this month`;
  });

  ngOnInit(): void {
    this.facade.load();
  }

  /** Picking from the panel adds a chip and empties the search text. */
  protected pickMarket(event: MatAutocompleteSelectedEvent, input: HTMLInputElement): void {
    this.addMarket(event.option.value as string);
    input.value = '';
    this.marketQuery.set('');
  }

  protected addMarket(slug: string): void {
    this.selectedMarkets.update((current) =>
      current.includes(slug) ? current : [...current, slug],
    );
  }

  protected removeMarket(slug: string): void {
    this.selectedMarkets.update((current) => current.filter((s) => s !== slug));
  }

  /** Clearing the selection *is* "every market", so this empties rather than fills. */
  protected selectAllMarkets(): void {
    this.selectedMarkets.set([]);
  }

  protected send(addAnother = false): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Fill in the business, contact and email before sending.');
      return;
    }

    const invite: VendorInviteModel = {
      ...this.form.getRawValue(),
      marketSlugs: [...this.selectedMarkets()],
    };

    this.facade.send(invite, (created) => {
      if (!created) {
        this.notifications.error(this.facade.error() ?? "That invitation didn't send.");
        return;
      }
      this.notifications.success(`Invitation sent to ${created.name}.`);
      if (addAnother) {
        // Keep the access choices, clear who it is for.
        this.form.patchValue({ businessName: '', contactName: '', email: '', phone: '', note: '' });
        this.form.markAsUntouched();
      } else {
        void this.router.navigate(['/vendors']);
      }
    });
  }
}
