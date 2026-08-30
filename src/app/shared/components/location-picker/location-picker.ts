import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { GoogleMap, MapAdvancedMarker } from '@angular/google-maps';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { GOOGLE_MAPS_CONFIG } from '../../../core/maps/google-maps-config';
import { GoogleMapsLoader } from '../../../core/maps/google-maps-loader';

export interface PinPosition {
  lat: number;
  lng: number;
}

/**
 * A map with one draggable pin, for fixing exactly where a market trades.
 *
 * Presentation only: it renders whatever coordinates it is given and emits the
 * ones the organiser picks. Whoever owns the form decides what a moved pin
 * means — this component never geocodes and never writes to a control.
 *
 * It has three states because the map genuinely may not be there: the server
 * renders it without a map (there is no `window` to load one into), and a build
 * with no API key has none either. Both land on a panel that says so and leaves
 * the rest of the step usable, which is why the API key is not a hard
 * dependency of the wizard.
 */
@Component({
  selector: 'md-location-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GoogleMap, MapAdvancedMarker, MatIconModule, MatProgressBarModule],
  template: `
    @if (loader.ready() && !authFailed()) {
      <google-map
        class="md-picker__map"
        height="100%"
        width="100%"
        [center]="center()"
        [zoom]="zoom()"
        [mapId]="config.mapId"
        [options]="mapOptions"
        (mapClick)="onMapClick($event)"
        (authFailure)="authFailed.set(true)"
      >
        @if (hasPin()) {
          <map-advanced-marker
            [position]="center()"
            [gmpDraggable]="!disabled()"
            title="Market entrance"
            (mapDragend)="onMarkerDragend($event)"
          />
        }
      </google-map>
    } @else if (loader.failed() || authFailed() || !loader.available) {
      <div class="md-picker__fallback">
        <mat-icon>location_off</mat-icon>
        <span>Map unavailable — the address and pin can still be entered by hand.</span>
      </div>
    } @else {
      <div class="md-picker__fallback" aria-live="polite">
        <mat-progress-bar class="md-picker__progress" mode="indeterminate" />
        <span>Loading the map…</span>
      </div>
    }

    <p class="md-picker__footer" [class.md-picker__footer--error]="!!error()">
      @if (error()) {
        <mat-icon class="md-picker__error-icon">error_outline</mat-icon>
        {{ error() }}
      } @else if (hasPin()) {
        <span class="md-picker__coords">{{ coordinates() }}</span>
        · {{ hint() }}
      } @else {
        {{ emptyHint() }}
      }
    </p>
  `,
  host: { class: 'md-picker' },
  styles: `
    .md-picker {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .md-picker__map,
    .md-picker__fallback {
      height: 260px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--mat-sys-outline-variant);
    }
    .md-picker__map {
      display: block;
    }
    .md-picker__fallback {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px;
      text-align: center;
      border-style: dashed;
      background: var(--mat-sys-surface-container-low);
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .md-picker__progress {
      position: absolute;
      inset: auto 0 0 0;
    }
    .md-picker__footer {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 0;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .md-picker__footer--error {
      color: var(--mat-sys-error);
    }
    .md-picker__error-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .md-picker__coords {
      font-family: 'JetBrains Mono', monospace;
      color: var(--mat-sys-on-surface);
    }
  `,
})
export class LocationPicker {
  protected readonly config = inject(GOOGLE_MAPS_CONFIG);
  protected readonly loader = inject(GoogleMapsLoader);

  readonly latitude = input<number | null>(null);
  readonly longitude = input<number | null>(null);
  readonly hint = input('drag the pin to the stall entrance');
  readonly emptyHint = input('Click the map, or pick an address above, to drop the pin.');
  /** Validation message from the owning form; replaces the hint when set. */
  readonly error = input<string | null>(null);
  readonly disabled = input(false);

  readonly pinMoved = output<PinPosition>();

  /**
   * Google rejected the key at runtime — wrong referrer, an API not enabled, or
   * no billing on the project. Without this the map paints its own error over
   * the step; with it the step falls back to the panel that says what to do.
   */
  protected readonly authFailed = signal(false);

  protected readonly mapOptions: google.maps.MapOptions = {
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  };

  protected readonly hasPin = computed(() => this.latitude() !== null && this.longitude() !== null);

  /** The pin, or the country-wide default while there isn't one. */
  protected readonly center = computed<google.maps.LatLngLiteral>(() => {
    const lat = this.latitude();
    const lng = this.longitude();
    return lat !== null && lng !== null ? { lat, lng } : { ...this.config.defaultCenter };
  });

  protected readonly zoom = computed(() => (this.hasPin() ? 17 : this.config.defaultZoom));

  /** Five decimals is roughly a metre — enough to point at a stall entrance. */
  protected readonly coordinates = computed(() => {
    const lat = this.latitude();
    const lng = this.longitude();
    return lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '';
  });

  constructor() {
    this.loader.load();
  }

  protected onMapClick(event: google.maps.MapMouseEvent | google.maps.IconMouseEvent): void {
    this.emit(event.latLng);
  }

  protected onMarkerDragend(event: google.maps.MapMouseEvent): void {
    this.emit(event.latLng);
  }

  private emit(latLng: google.maps.LatLng | null): void {
    if (!latLng || this.disabled()) return;
    this.pinMoved.emit({ lat: latLng.lat(), lng: latLng.lng() });
  }
}
