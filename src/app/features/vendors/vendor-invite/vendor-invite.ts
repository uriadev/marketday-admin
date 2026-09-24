import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
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
} from '../../../core/models/vendor.model';
import { VendorInviteFacade } from '../vendor-invite-facade';

/**
 * Invite vendor (design 1n): one form, with the email it will send previewed
 * beside it.
 *
 * The preview is not decoration — an invitation is the first thing a vendor
 * ever sees of MarketDay, and it goes out under the admin's name, so it is
 * worth reading before sending.
 *
 * Most of that is live. `VendorRepository.invite` reaches the real
 * `createVendor`, which records the business, its market scope **and its
 * owner**: the contact name and email address are the person seated as the
 * vendor's `OWNER`, found by address if they already have a MarketDay account
 * and created — without a password — if they do not. There is no role to pick,
 * because there is only one seat to give.
 *
 * What is still missing is the message. No invitation endpoint exists
 * (`docs/backend-api-gaps.md` #9), and `CreateVendorInput` has no phone field,
 * so neither the note nor the phone number has anywhere to go; the new owner
 * gets in through Forgot password. Both are therefore **disabled** — they stay
 * on the screen, since this is the shape the form takes the day the endpoint
 * lands, but nothing is collected that would be silently dropped. The rail says
 * as much rather than letting the preview imply a message left the building.
 *
 * "Skip application review" is live: it is `CreateVendorInput.isActive`. On,
 * the vendor trades from the moment it exists; off, it is created inactive —
 * owned and joined to its markets but unable to take an order — until an admin
 * activates it from the directory's row menu.
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

  /**
   * `phone` and `note` are disabled: `createVendor` takes neither and nothing
   * emails the note (`docs/backend-api-gaps.md` #9). They are still sent —
   * {@link send} reads `getRawValue()` — so the day an endpoint takes them,
   * enabling the controls is the whole change.
   *
   * `skipApplicationReview` starts off: review is the default, so a vendor an
   * admin has not chosen to wave through is created inactive.
   */
  protected readonly form = this.fb.group({
    businessName: this.fb.control('', Validators.required),
    contactName: this.fb.control('', Validators.required),
    email: this.fb.control('', [Validators.required, Validators.email]),
    phone: this.fb.control({ value: '', disabled: true }),
    trade: this.fb.control(VENDOR_TRADES[0]!, Validators.required),
    skipApplicationReview: this.fb.control(false),
    note: this.fb.control({ value: '', disabled: true }, Validators.maxLength(400)),
  });

  /**
   * The market this invitation was started from, as a slug, from the query
   * param (§7) — `/vendors/invite?market=temple-bar`. It seeds the scope, and
   * sending returns there.
   */
  readonly market = input<string>();

  /**
   * Markets live outside the group: they are chosen as chips rather than typed,
   * and "none picked" means every market rather than an invalid form. Seeded
   * from `market()`, but still independently editable — it is a suggestion,
   * not a lock.
   */
  protected readonly selectedMarkets = linkedSignal<readonly string[]>(() => {
    const from = this.market();
    return from ? [from] : [];
  });

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

  /**
   * "Two markets selected · Dervla owns it" — the footer's running summary.
   * There is no access half any more: whoever is named as the contact is the
   * owner, so the second clause says who rather than what they may do.
   */
  protected readonly summary = computed(() => {
    const count = this.selectedMarkets().length;
    const scope =
      count === 0
        ? `All ${this.facade.marketCount()} markets`
        : `${count} ${count === 1 ? 'market' : 'markets'} selected`;
    const owner = this.value().contactName.trim();
    return `${scope} · ${owner ? `${owner} owns it` : 'owner not named yet'}`;
  });

  /** Read from the value signal, not the control, so the rail follows the toggle. */
  protected readonly reviewSkipped = computed(() => this.value().skipApplicationReview);

  /**
   * What the directory will show the moment this lands. The pill reads only
   * whether the vendor is active — whether a stall is taking orders right now is
   * per market and on the vendor's Markets tab — so the one thing on this form
   * that can change it is skipping the review.
   */
  protected readonly standing = computed(() =>
    this.reviewSkipped()
      ? ({ label: 'Trading', tone: 'positive' } as const)
      : ({ label: 'Paused', tone: 'muted' } as const),
  );

  /** What the review toggle does in its current position, said under its title. */
  protected readonly reviewHint = computed(() =>
    this.reviewSkipped()
      ? 'The vendor goes live at the markets picked above as soon as it is created.'
      : 'The vendor is created inactive — unable to take orders — until you activate it from the Vendors list.',
  );

  /**
   * How many vendors this session has added. Nothing server-side counts them
   * (`docs/backend-api-gaps.md` #9) — the repository counts its own creates —
   * so the line stays hidden at zero rather than opening with a number the
   * console cannot actually know.
   */
  protected readonly headerNote = computed(() => {
    const added = this.facade.summary()?.sentThisMonth ?? 0;
    if (added === 0) return '';
    return `${added} ${added === 1 ? 'vendor' : 'vendors'} added this session`;
  });

  constructor() {
    // The chips render from the loaded market list, so a slug it does not
    // know would count towards the scope while showing nothing. Drop it
    // instead. `update()` does not register a dependency, so this only
    // re-runs when the market list itself changes — it cannot re-add a chip
    // the admin removed.
    effect(() => {
      const known = new Set(this.facade.markets$().map((m) => m.slug));
      if (known.size === 0) return;
      this.selectedMarkets.update((current) =>
        current.every((slug) => known.has(slug))
          ? current
          : current.filter((slug) => known.has(slug)),
      );
    });
  }

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
      this.notifications.error('Fill in the business, and the owner’s name and email, first.');
      return;
    }

    const invite: VendorInviteModel = {
      ...this.form.getRawValue(),
      marketSlugs: [...this.selectedMarkets()],
    };

    this.facade.send(invite, (created) => {
      if (!created) {
        this.notifications.error(this.facade.error() ?? "That vendor couldn't be created.");
        return;
      }
      // Not "invitation sent": `createVendor` is the whole of what the backend
      // can do here — the vendor and its owner exist, no email has gone
      // anywhere, so the admin has to tell them themselves.
      this.notifications.success(
        `${created.name} created, owned by ${invite.contactName}. ${
          created.isActive
            ? 'No email sent yet.'
            : 'It stays inactive until you activate it. No email sent yet.'
        }`,
      );
      if (addAnother) {
        // Keep the access choices, clear who it is for.
        this.form.patchValue({ businessName: '', contactName: '', email: '', phone: '', note: '' });
        this.form.markAsUntouched();
      } else {
        void this.router.navigate(['/vendors', created.slug]);
      }
    });
  }
}
