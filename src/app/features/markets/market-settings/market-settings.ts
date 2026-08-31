import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Notifications } from '../../../core/notifications/notifications';
import {
  MarketDetailsForm,
  createDetailsForm,
  detailsFields,
  seedDetailsForm,
} from '../details-form/details-form';
import {
  MarketLocationForm,
  createLocationForm,
  locationFields,
  seedLocationForm,
} from '../location-form/location-form';
import { MarketDetailFacade } from '../market-detail-facade';
import { MarketSettingsFacade } from '../market-settings-facade';

/**
 * The Settings tab of a market: what it is, and where it trades. The same two
 * editors the add-market wizard uses for its Details and Location steps, so a
 * market reads and edits identically whether it is being set up or corrected.
 *
 * The two forms save as one payload rather than separately. They are one
 * record — a market that moved town has a new address *and* usually a new name
 * for its pitch — and a single Save is also the only way to keep the directory
 * card, which draws from both, from being half updated.
 */
@Component({
  selector: 'md-market-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MarketDetailsForm,
    MarketLocationForm,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './market-settings.html',
  styleUrl: './market-settings.css',
})
export class MarketSettings {
  /** Bound from the parent `:slug` route param by `withComponentInputBinding()`. */
  readonly slug = input.required<string>();

  protected readonly facade = inject(MarketSettingsFacade);
  private readonly detail = inject(MarketDetailFacade);
  private readonly notifications = inject(Notifications);

  /**
   * Both groups are built here, so this component owns the value and the two
   * editors stay the presentational halves. A field initialiser is an injection
   * context, which is what the factories' `inject()` needs.
   */
  protected readonly detailsForm = createDetailsForm();
  protected readonly locationForm = createLocationForm();

  /** Only to raise the pin's error — see `MarketLocationForm.flagMissingPin()`. */
  private readonly locationEditor = viewChild(MarketLocationForm);

  private readonly revision = signal(0);

  /**
   * Whether there is anything to save. Reactive forms are not signals, so a
   * template reading `pristine` directly would have nothing to re-render on.
   */
  protected readonly dirty = computed(
    () => (this.revision(), !this.detailsForm.pristine || !this.locationForm.pristine),
  );

  protected readonly busy = computed(() => this.facade.isLoading() || this.facade.isSaving());

  constructor() {
    merge(this.detailsForm.valueChanges, this.locationForm.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.revision.update((n) => n + 1));

    effect(() => this.facade.load(this.slug()));
    // A fresh load is the forms' new baseline, so they start pristine.
    effect(() => {
      if (this.facade.settings()) this.reset();
    });
  }

  protected save(): void {
    if (this.detailsForm.invalid || this.locationForm.invalid) {
      this.detailsForm.markAllAsTouched();
      this.locationForm.markAllAsTouched();
      // The pin has no `mat-form-field`, so its error has to be asked for.
      this.locationEditor()?.flagMissingPin();
      this.notifications.error('Some fields still need attention.');
      return;
    }
    if (!this.dirty()) return;

    const patch = {
      ...detailsFields(this.detailsForm.getRawValue()),
      ...locationFields(this.locationForm.getRawValue()),
    };
    this.facade.save(patch, (settings) => {
      this.detailsForm.markAsPristine();
      this.locationForm.markAsPristine();
      this.revision.update((n) => n + 1);
      this.notifications.success(`${settings.name} is saved.`);
      // The shell above renders the market's name and meta line from its own
      // load, which this save has just made stale.
      this.detail.load(this.slug());
    });
  }

  /** Drops every unsaved edit back to the loaded record. */
  protected reset(): void {
    const stored = this.facade.settings();
    if (!stored) return;
    seedDetailsForm(this.detailsForm, stored);
    seedLocationForm(this.locationForm, stored);
    this.revision.update((n) => n + 1);
  }
}
