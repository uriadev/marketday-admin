import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, switchMap } from 'rxjs/operators';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MediaRepository } from '../../../core/api/ports/media-repository';
import { PlaceSuggestion, ResolvedPlace } from '../../../core/maps/place.model';
import { Places } from '../../../core/maps/places';
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  EVENT_LOCATION_ACCURACY_M,
  EVENT_VENUE_KINDS,
  EVENT_VENUE_KIND_ICONS,
  EVENT_VENUE_KIND_LABELS,
  EventCategory,
  EventDraft,
  EventRecord,
  EventSession,
  EventStatus,
  EventVenueKind,
  MAX_EVENT_SESSIONS,
  MAX_EVENT_TITLE_LENGTH,
  sessionsOffMarketDays,
} from '../../../core/models/event.model';
import { PickerOption } from '../../../core/models/picker-option.model';
import { Notifications } from '../../../core/notifications/notifications';
import { fromPickers, marketDate, marketRange, toPickers } from '../../../core/time/market-time';
import {
  ConfirmDialog,
  ConfirmDialogData,
} from '../../../shared/components/confirm-dialog/confirm-dialog';
import { ImageUpload } from '../../../shared/components/image-upload/image-upload';
import {
  LocationPicker,
  PinPosition,
} from '../../../shared/components/location-picker/location-picker';
import { Crumb, PageHeader } from '../../../shared/components/page-header/page-header';
import { SearchSelect } from '../../../shared/components/search-select/search-select';
import { StatusPill } from '../../../shared/components/status-pill/status-pill';
import { httpsUrl } from '../../../shared/validators/https-url';
import { EventFormFacade } from '../event-form-facade';

type SessionGroup = FormGroup<{
  date: FormControl<Date | null>;
  start: FormControl<Date | null>;
  end: FormControl<Date | null>;
  label: FormControl<string>;
}>;

/** A session ends after it starts — the CHECK is the real guard, this the readable one. */
function endsAfterStart(group: AbstractControl): ValidationErrors | null {
  const { start, end } = (group as SessionGroup).getRawValue();
  if (!start || !end) return null;
  const minutes = (time: Date) => time.getHours() * 60 + time.getMinutes();
  return minutes(end) > minutes(start) ? null : { endsBeforeStart: true };
}

/** "Ballincollig, Co. Cork" — the area a picked place reads as. */
function areaOf(place: ResolvedPlace): string {
  return [place.city, place.county ? `Co. ${place.county}` : null].filter(Boolean).join(', ');
}

/**
 * Add an event, and change one later. One screen for both: `/events/new` and
 * `/events/:id` differ in what is filled in, whether the venue can still be
 * chosen, and whether there is a delete action.
 *
 * Three venue kinds shape the form. A **market** event takes its point from
 * the market, so it has no map. A **vendor** event is often at someone's home,
 * so its street address is empty by default and the form says why. A
 * **place** is anywhere else. For the last two, the point the picker produces
 * is sent once and snapped server-side to a ~1 km grid; the console never
 * gets it back, and the app draws an area, not a pin.
 *
 * Sessions are typed in Irish time, whatever zone this browser is in, and
 * sent as instants — the whole list on every save.
 */
@Component({
  selector: 'md-event-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EventFormFacade],
  imports: [
    RouterLink,
    ReactiveFormsModule,
    ImageUpload,
    LocationPicker,
    PageHeader,
    SearchSelect,
    StatusPill,
    MatAutocompleteModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatNativeDateModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTimepickerModule,
    MatTooltipModule,
  ],
  templateUrl: './event-form.html',
  styleUrl: './event-form.css',
})
export class EventForm {
  /** Bound from the route by `withComponentInputBinding()`; absent on `/events/new`. */
  readonly id = input<string>();

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly media = inject(MediaRepository);
  private readonly places = inject(Places);
  private readonly notifications = inject(Notifications);

  protected readonly facade = inject(EventFormFacade);

  protected readonly categories = EVENT_CATEGORIES;
  protected readonly categoryLabels = EVENT_CATEGORY_LABELS;
  protected readonly venueKinds = EVENT_VENUE_KINDS;
  protected readonly venueKindLabels = EVENT_VENUE_KIND_LABELS;
  protected readonly venueKindIcons = EVENT_VENUE_KIND_ICONS;
  protected readonly maxSessions = MAX_EVENT_SESSIONS;
  protected readonly maxTitle = MAX_EVENT_TITLE_LENGTH;
  protected readonly accuracyKm = EVENT_LOCATION_ACCURACY_M / 1000;

  protected readonly form = this.fb.group({
    title: this.fb.control('', [Validators.required, Validators.maxLength(MAX_EVENT_TITLE_LENGTH)]),
    category: this.fb.control<EventCategory>('other', Validators.required),
    description: this.fb.control(''),
    imageUrl: this.fb.control<string | null>(null),
    externalUrl: this.fb.control('', httpsUrl),
    venueKind: this.fb.control<EventVenueKind>('market'),
    marketId: this.fb.control<string | null>(null),
    vendorId: this.fb.control<string | null>(null),
    areaName: this.fb.control(''),
    address: this.fb.control(''),
    latitude: this.fb.control<number | null>(null),
    longitude: this.fb.control<number | null>(null),
    status: this.fb.control<EventStatus>('draft'),
    isFeatured: this.fb.control(false),
    sessions: this.fb.array<SessionGroup>([]),
  });

  protected readonly sessions = this.form.controls.sessions as FormArray<SessionGroup>;

  /** The vendor picked as the venue, shown in the picker. */
  protected readonly vendor = signal<PickerOption | null>(null);
  protected readonly uploading = signal(false);
  /** The missing-pin message; coordinates have no form field of their own. */
  protected readonly pinError = signal<string | null>(null);
  protected readonly resolvingPlace = signal(false);
  protected readonly placeQuery = new FormControl('', { nonNullable: true });
  protected readonly placeSuggestions = toSignal(
    this.placeQuery.valueChanges.pipe(
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((query) =>
        query.trim().length < 3
          ? of<PlaceSuggestion[]>([])
          : this.places.suggest(query).pipe(catchError(() => of<PlaceSuggestion[]>([]))),
      ),
    ),
    { initialValue: [] as PlaceSuggestion[] },
  );

  /** The area the last geocode wrote, so a pin drag never overwrites one typed by hand. */
  private lastGeocodedArea: string | null = null;

  /** Re-read on every change, so the preview, warnings and checklist track the form. */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly isEdit = computed(() => this.id() !== undefined);
  protected readonly venueKind = computed(() => this.value().venueKind);

  protected readonly crumbs = computed<Crumb[]>(() => [{ label: 'Events', link: '/events' }]);
  protected readonly heading = computed(() =>
    this.isEdit() ? (this.facade.event()?.title ?? 'Event') : 'New event',
  );

  /** "At Douglas Market" — the venue, fixed once the event exists. */
  protected readonly fixedVenue = computed(() => {
    const event = this.facade.event();
    if (!event) return null;
    const kind = event.venue.kind;
    return {
      icon: EVENT_VENUE_KIND_ICONS[kind],
      label: event.venue.name ? `${EVENT_VENUE_KIND_LABELS[kind]} — ${event.venue.name}` : EVENT_VENUE_KIND_LABELS[kind],
      link: event.venue.link,
    };
  });

  protected readonly selectedMarket = computed(() => {
    const id = this.value().marketId;
    return this.facade.markets().find((market) => market.id === id) ?? null;
  });

  /** The sessions as instants, skipping rows not yet filled in. */
  private readonly sessionValues = computed<EventSession[]>(() =>
    this.value().sessions.flatMap(({ date, start, end, label }) =>
      date && start && end
        ? [{ startsAt: fromPickers(date, start), endsAt: fromPickers(date, end), label: label.trim() || null }]
        : [],
    ),
  );

  /** "Sat 19 Sept 2026" for each session of a market event on a day that market doesn't trade. */
  protected readonly offMarketDays = computed(() => {
    const market = this.selectedMarket();
    if (this.venueKind() !== 'market' || !market) return [];
    return sessionsOffMarketDays(this.sessionValues(), market.days).map((session) =>
      marketDate(session.startsAt),
    );
  });

  protected readonly allEnded = computed(() => {
    const sessions = this.sessionValues();
    return sessions.length > 0 && sessions.every((session) => session.endsAt.getTime() <= Date.now());
  });

  /* ── App preview ───────────────────────────────────────────────────────── */

  protected readonly preview = computed(() => {
    const { title, category, imageUrl, areaName, address } = this.value();
    const sessions = [...this.sessionValues()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const first = sessions[0];
    const last = sessions.reduce<EventSession | undefined>(
      (latest, session) => (!latest || session.endsAt > latest.endsAt ? session : latest),
      undefined,
    );
    const area =
      areaName.trim() ||
      (this.venueKind() === 'market' ? (this.selectedMarket()?.town ?? '') : '');
    return {
      title: title.trim() || 'Event title',
      untitled: title.trim() === '',
      category: EVENT_CATEGORY_LABELS[category],
      imageUrl,
      when: first && last ? marketRange(first.startsAt, last.endsAt) : 'Add a session',
      sessions: sessions.length,
      where: address.trim() || (area ? `Near ${area}` : 'Somewhere — pick a venue'),
    };
  });

  protected readonly checklist = computed(() => {
    const { title, venueKind, marketId, vendorId, latitude, areaName, imageUrl, description } =
      this.value();
    const placed =
      venueKind === 'market'
        ? marketId !== null
        : latitude !== null && areaName.trim() !== '' && (venueKind === 'place' || vendorId !== null);
    return [
      { label: 'Title', done: title.trim() !== '' },
      { label: 'Where it happens', done: placed },
      { label: 'At least one session', done: this.sessionValues().length > 0 },
      { label: 'Image', done: !!imageUrl },
      { label: 'Description', done: description.trim() !== '' },
    ];
  });

  constructor() {
    effect(() => this.facade.load(this.id() ?? null));
    effect(() => {
      const form = this.facade.form();
      if (form) this.seed(form.event);
    });
    this.form.controls.venueKind.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((kind) => this.syncVenueValidators(kind));
    this.syncVenueValidators(this.form.controls.venueKind.value);
  }

  /* ── Venue ─────────────────────────────────────────────────────────────── */

  /**
   * A market event's area defaults server-side to the market's town, and its
   * point is the market's; the other two must say where they are.
   */
  private syncVenueValidators(kind: EventVenueKind): void {
    const { marketId, areaName } = this.form.controls;
    marketId.setValidators(kind === 'market' ? Validators.required : null);
    areaName.setValidators(kind === 'market' ? null : Validators.required);
    marketId.updateValueAndValidity({ emitEvent: false });
    areaName.updateValueAndValidity({ emitEvent: false });
    this.pinError.set(null);
  }

  protected onVendorPicked(option: PickerOption): void {
    this.vendor.set(option);
    this.form.controls.vendorId.setValue(option.id);
    this.form.markAsDirty();
  }

  protected onVendorCleared(): void {
    this.vendor.set(null);
    this.form.controls.vendorId.setValue(null);
  }

  /**
   * A place pick gives the point and the area. Its street address is copied
   * only for a `place` event: a vendor event is usually at someone's home, and
   * publishing that is the organiser's choice, made by typing it.
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
          this.applyArea(place, false);
          if (this.venueKind() === 'place' && place.address) {
            this.form.controls.address.setValue(place.address);
          }
        },
        error: () =>
          this.notifications.error("Couldn't look that place up. Drop the pin on the map instead."),
      });
  }

  protected onPinMoved({ lat, lng }: PinPosition): void {
    this.setPin(lat, lng);
    this.places.reverseGeocode(lat, lng).subscribe({
      next: (place) => {
        if (place) this.applyArea(place, true);
      },
      // A pin without an area name is still a pin; the field says what's missing.
      error: () => {},
    });
  }

  private setPin(lat: number, lng: number): void {
    const { latitude, longitude } = this.form.controls;
    latitude.setValue(lat);
    longitude.setValue(lng);
    this.form.markAsDirty();
    this.pinError.set(null);
  }

  /** With `preserveEdits`, an area the admin typed by hand is left as written. */
  private applyArea(place: ResolvedPlace, preserveEdits: boolean): void {
    const area = areaOf(place);
    if (!area) return;
    const control = this.form.controls.areaName;
    if (preserveEdits && control.value && control.value !== this.lastGeocodedArea) return;
    control.setValue(area);
    this.lastGeocodedArea = area;
  }

  /* ── Sessions ──────────────────────────────────────────────────────────── */

  private sessionGroup(session?: EventSession): SessionGroup {
    const start = session ? toPickers(session.startsAt) : null;
    const end = session ? toPickers(session.endsAt) : null;
    return this.fb.group(
      {
        date: this.fb.control<Date | null>(start?.date ?? null, Validators.required),
        start: this.fb.control<Date | null>(start?.time ?? null, Validators.required),
        end: this.fb.control<Date | null>(end?.time ?? null, Validators.required),
        label: this.fb.control(session?.label ?? ''),
      },
      { validators: endsAfterStart },
    );
  }

  /** A new row starts on the day of the last one — the band's second set. */
  protected addSession(): void {
    if (this.sessions.length >= MAX_EVENT_SESSIONS) return;
    const last = this.sessions.at(this.sessions.length - 1)?.getRawValue();
    const row = this.sessionGroup();
    if (last?.date) row.controls.date.setValue(last.date);
    this.sessions.push(row);
    this.form.markAsDirty();
  }

  protected removeSession(index: number): void {
    if (this.sessions.length <= 1) return;
    this.sessions.removeAt(index);
    this.form.markAsDirty();
  }

  /* ── Image ─────────────────────────────────────────────────────────────── */

  protected onImagePicked(file: File): void {
    this.uploading.set(true);
    this.media.upload(file, 'event-image').subscribe({
      next: (uploaded) => {
        this.uploading.set(false);
        this.form.controls.imageUrl.setValue(uploaded.url);
        this.form.markAsDirty();
      },
      error: () => {
        this.uploading.set(false);
        this.notifications.error("That image didn't upload. Try again.");
      },
    });
  }

  protected onImageCleared(): void {
    this.form.controls.imageUrl.setValue(null);
    this.form.markAsDirty();
  }

  protected onImageRejected(reason: string): void {
    this.notifications.error(reason);
  }

  /* ── Saving ────────────────────────────────────────────────────────────── */

  protected save(): void {
    const { venueKind, vendorId, latitude, status } = this.form.getRawValue();
    const needsPin = venueKind !== 'market' && latitude === null;
    if (needsPin) this.pinError.set('Pick a place or drop the pin where it happens.');
    if (this.form.invalid || needsPin || (venueKind === 'vendor' && !vendorId)) {
      this.form.markAllAsTouched();
      this.notifications.error('Fill in the title, the venue and every session before saving.');
      return;
    }
    if (status === 'published' && this.allEnded()) {
      this.notifications.error(
        'Every session has already ended, so a published event would never be seen. Save it as a draft.',
      );
      return;
    }

    this.facade.save(this.draft(), (saved) => {
      if (!saved) {
        this.notifications.error(this.facade.error() ?? "Those changes didn't save.");
        return;
      }
      if (this.isEdit()) {
        this.notifications.success(`${saved.title} is saved.`);
        this.form.markAsPristine();
      } else {
        this.notifications.success(
          saved.status === 'published' ? `${saved.title} is published.` : `${saved.title} is saved as a draft.`,
        );
        void this.router.navigate(['/events', saved.id], { replaceUrl: true });
      }
    });
  }

  protected confirmDelete(): void {
    const event = this.facade.event();
    if (!event) return;
    const data: ConfirmDialogData = {
      title: `Delete ${event.title}?`,
      body:
        'The event and its sessions are removed for good, and any promotion of it is deleted ' +
        'with it. To take it out of the app for now, move it back to draft instead.',
      confirmLabel: 'Delete event',
    };
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.facade.remove((removed) => {
          if (!removed) {
            this.notifications.error(this.facade.error() ?? "That event wasn't deleted.");
            return;
          }
          this.notifications.success(`${event.title} is deleted.`);
          void this.router.navigate(['/events']);
        });
      });
  }

  /* ── Helpers ───────────────────────────────────────────────────────────── */

  private draft(): EventDraft {
    const v = this.form.getRawValue();
    return {
      title: v.title.trim(),
      description: v.description,
      category: v.category,
      imageUrl: v.imageUrl,
      externalUrl: v.externalUrl.trim(),
      status: v.status,
      isFeatured: v.isFeatured,
      venueKind: v.venueKind,
      marketId: v.marketId,
      vendorId: v.vendorId,
      areaName: v.areaName,
      address: v.address,
      latitude: v.latitude,
      longitude: v.longitude,
      sessions: this.sessionValues(),
    };
  }

  private seed(event: EventRecord | null): void {
    this.sessions.clear({ emitEvent: false });
    for (const session of event?.sessions ?? [undefined]) {
      this.sessions.push(this.sessionGroup(session), { emitEvent: false });
    }
    this.form.reset({
      title: event?.title ?? '',
      category: event?.category ?? 'other',
      description: event?.description ?? '',
      imageUrl: event?.imageUrl ?? null,
      externalUrl: event?.externalUrl ?? '',
      venueKind: event?.venue.kind ?? 'market',
      marketId: event?.venue.marketId ?? null,
      vendorId: event?.venue.vendorId ?? null,
      areaName: event?.areaName ?? '',
      address: event?.address ?? '',
      latitude: event?.latitude ?? null,
      longitude: event?.longitude ?? null,
      status: event?.status ?? 'draft',
      isFeatured: event?.isFeatured ?? false,
    });
    this.vendor.set(
      event?.venue.vendorId ? { id: event.venue.vendorId, label: event.venue.name ?? '', detail: '' } : null,
    );
    this.lastGeocodedArea = event?.areaName ?? null;
    // The venue is fixed once the event exists — another venue is another event.
    if (event) {
      this.form.controls.venueKind.disable({ emitEvent: false });
      this.form.controls.marketId.disable({ emitEvent: false });
    }
  }
}
