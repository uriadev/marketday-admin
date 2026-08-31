import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  switchMap,
} from 'rxjs/operators';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { PlaceSuggestion, ResolvedPlace } from '../../core/maps/place.model';
import { Places } from '../../core/maps/places';
import { MarketLocationPatch } from '../../core/models/market.model';
import { Notifications } from '../../core/notifications/notifications';
import {
  LocationPicker,
  PinPosition,
} from '../../shared/components/location-picker/location-picker';

export type LocationFormGroup = FormGroup<{
  address: FormControl<string>;
  city: FormControl<string>;
  county: FormControl<string | null>;
  eircode: FormControl<string>;
  latitude: FormControl<number | null>;
  longitude: FormControl<number | null>;
  accessNotes: FormControl<string>;
  organiserName: FormControl<string>;
  organiserPhone: FormControl<string>;
}>;
export type LocationFormValue = ReturnType<LocationFormGroup['getRawValue']>;

/**
 * The group both the wizard's Location step and the settings tab bind to.
 * Called from a field initialiser (the default `fb` argument), so `inject()`
 * resolves against the calling component.
 */
export function createLocationForm(fb: FormBuilder = inject(FormBuilder)): LocationFormGroup {
  return fb.nonNullable.group({
    address: fb.nonNullable.control('', Validators.required),
    city: fb.nonNullable.control('', Validators.required),
    county: fb.nonNullable.control<string | null>(null, Validators.required),
    eircode: fb.nonNullable.control(''),
    latitude: fb.nonNullable.control<number | null>(null, Validators.required),
    longitude: fb.nonNullable.control<number | null>(null, Validators.required),
    accessNotes: fb.nonNullable.control(''),
    organiserName: fb.nonNullable.control(''),
    organiserPhone: fb.nonNullable.control(''),
  });
}

/** The fields a caller persists — the group's raw value, named for the repository call. */
export function locationFields(value: LocationFormValue): MarketLocationPatch {
  return { ...value };
}

/**
 * The inverse of {@link locationFields}: seeds the group from a stored record.
 *
 * `emitEvent: false` matters here. The address control drives a Places
 * autocomplete, and seeding is not somebody typing — without it every load of a
 * saved market would bill a lookup for the address the console just read, and
 * drop an autocomplete panel over the form while doing it.
 */
export function seedLocationForm(form: LocationFormGroup, stored: MarketLocationPatch): void {
  form.reset({ ...stored }, { emitEvent: false });
}

/**
 * The wizard's Location step and the settings tab's own location editor,
 * extracted so both bind the same `FormGroup` and the same address/pin
 * plumbing. It owns the `Places` autocomplete-and-geocode round trip and the
 * county list, the way `MarketScheduleForm` owns composing the RRULE.
 *
 * `flagMissingPin()` is public rather than `protected`: coordinates have no
 * `mat-form-field` of their own, so their error lives on the map, and only
 * the host knows the moment — "Continue", "Publish", "Save" — that should
 * raise it. `markAllAsTouched()` emits no value change, so there is no
 * reactive way for this component to notice on its own; the host reaches in
 * via `viewChild` and calls this at that moment instead.
 */
@Component({
  selector: 'md-market-location-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    LocationPicker,
  ],
  templateUrl: './location-form.html',
  styleUrl: './location-form.css',
})
export class MarketLocationForm {
  private readonly repository = inject(MarketRepository);
  private readonly places = inject(Places);
  private readonly notifications = inject(Notifications);

  readonly form = input.required<LocationFormGroup>();

  protected readonly counties = toSignal(this.repository.counties(), { initialValue: [] });

  /** True while a picked suggestion is being turned into a full address. */
  protected readonly resolvingPlace = signal(false);

  /**
   * The missing-pin message. It is a signal rather than a `computed` over
   * `touched` because `markAllAsTouched()` emits no value change — the host
   * raises it via `flagMissingPin()`, dropping a pin clears it.
   */
  protected readonly pinError = signal<string | null>(null);

  /**
   * The last geocode written to the form. Comparing against it is how a pin
   * drag can refresh the address without overwriting words typed by hand.
   */
  private lastGeocoded: ResolvedPlace | null = null;

  private readonly addressSuggestionsState = signal<readonly PlaceSuggestion[]>([]);
  /**
   * Irish address predictions for what has been typed so far. Three characters
   * is where Places starts returning anything useful, and the debounce is what
   * keeps a session billed as one autocomplete request rather than one per
   * keystroke.
   */
  protected readonly addressSuggestions = this.addressSuggestionsState.asReadonly();

  constructor() {
    // Set up once the input is bound — reading `form()` at construction time,
    // before Angular applies the binding, would read the unset placeholder.
    effect((onCleanup) => {
      const sub = this.form()
        .controls.address.valueChanges.pipe(
          debounceTime(250),
          distinctUntilChanged(),
          switchMap((query) =>
            query.trim().length < 3
              ? of<PlaceSuggestion[]>([])
              : this.places.suggest(query).pipe(catchError(() => of<PlaceSuggestion[]>([]))),
          ),
        )
        .subscribe((suggestions) => this.addressSuggestionsState.set(suggestions));
      onCleanup(() => sub.unsubscribe());
    });
  }

  /**
   * A picked suggestion is the one moment the console gets the whole address
   * at once — street, town, eircode, county and the point — so it overwrites
   * the form wholesale rather than merging.
   */
  protected onPlacePicked(suggestion: PlaceSuggestion): void {
    this.resolvingPlace.set(true);
    this.places
      .resolve(suggestion.id)
      .pipe(finalize(() => this.resolvingPlace.set(false)))
      .subscribe({
        next: (place) => {
          if (!place) return;
          this.setPin(place.latitude, place.longitude);
          this.applyPlace(place, false);
        },
        error: () =>
          this.notifications.error(
            "Couldn't look that address up. Drop the pin on the map instead.",
          ),
      });
  }

  /**
   * The pin is the market's exact spot, so a drag always wins on coordinates.
   * The address fields only follow along where they still hold what the last
   * geocode put there.
   */
  protected onPinMoved({ lat, lng }: PinPosition): void {
    this.setPin(lat, lng);
    this.places.reverseGeocode(lat, lng).subscribe({
      next: (place) => {
        if (place) this.applyPlace(place, true);
      },
      // A pin without an address is still a usable pin; nothing to report.
      error: () => {},
    });
  }

  private setPin(lat: number, lng: number): void {
    const { latitude, longitude } = this.form().controls;
    latitude.setValue(lat);
    longitude.setValue(lng);
    latitude.markAsDirty();
    longitude.markAsDirty();
    this.pinError.set(null);
  }

  /**
   * Copy a geocoded place onto the form. With `preserveEdits`, a field whose
   * value no longer matches the last geocode was typed by hand and is left
   * exactly as written — which is what makes nudging the pin safe.
   */
  private applyPlace(place: ResolvedPlace, preserveEdits: boolean): void {
    const { address, city, county, eircode } = this.form().controls;
    const previous = this.lastGeocoded;
    const mayWrite = (current: string | null, was: string | null) =>
      !preserveEdits || !current || current === (was ?? '');

    if (place.address && mayWrite(address.value, previous?.address ?? null)) {
      address.setValue(place.address, { emitEvent: false });
    }
    if (place.city && mayWrite(city.value, previous?.city ?? null)) city.setValue(place.city);
    if (place.eircode && mayWrite(eircode.value, previous?.eircode ?? null)) {
      eircode.setValue(place.eircode);
    }
    if (place.county && mayWrite(county.value, previous?.county ?? null)) {
      county.setValue(place.county);
    }

    this.form().markAsDirty();
    this.lastGeocoded = place;
  }

  /** Coordinates have no `mat-form-field`, so their error lives on the map. */
  flagMissingPin(): void {
    this.pinError.set(
      this.form().controls.latitude.invalid ? 'Drop the pin on the market entrance.' : null,
    );
  }
}
