import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { VendorRepository } from '../../core/api/ports/vendor-repository';
import { MarketSummary } from '../../core/models/market.model';
import { VendorInvite, VendorInviteSummary, VendorSummary } from '../../core/models/vendor.model';

/**
 * Invite vendor (design 1n). Provided at the route, so it dies with the screen.
 *
 * It needs both aggregates — the markets an invitee may apply to come from
 * `MarketRepository`, the invitation itself goes through `VendorRepository` —
 * which is exactly the composing a facade is for. Neither port learns about the
 * other.
 */
@Injectable()
export class VendorInviteFacade {
  private readonly vendors = inject(VendorRepository);
  private readonly markets = inject(MarketRepository);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _markets = signal<readonly MarketSummary[]>([]);
  private readonly _summary = signal<VendorInviteSummary | null>(null);
  private readonly _sending = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _sent = signal<VendorSummary | null>(null);

  readonly markets$ = this._markets.asReadonly();
  readonly summary = this._summary.asReadonly();
  readonly sending = this._sending.asReadonly();
  readonly error = this._error.asReadonly();
  /** The row the last invitation created, for the confirmation message. */
  readonly sent = this._sent.asReadonly();

  readonly marketCount = computed(() => this._markets().length);
  readonly linkValidDays = computed(() => this._summary()?.linkValidDays ?? 14);
  readonly reminderAfterDays = computed(() => this._summary()?.reminderAfterDays ?? 5);

  /** "Link expires 13 September 2026" — today plus the policy window. */
  readonly linkExpiry = computed(() => {
    const expires = new Date();
    expires.setDate(expires.getDate() + this.linkValidDays());
    return expires.toLocaleDateString('en-IE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  });

  load(): void {
    this.markets
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (markets) => this._markets.set(markets),
        // The form still works without the market list; it just cannot scope.
        error: () => this._markets.set([]),
      });

    this.vendors
      .inviteSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => this._summary.set(summary),
        error: () => this._summary.set(null),
      });
  }

  /** Resolves to the created row, or `null` when the invitation was refused. */
  send(invite: VendorInvite, onDone: (created: VendorSummary | null) => void): void {
    if (this._sending()) return;
    this._sending.set(true);
    this._error.set(null);

    this.vendors
      .invite(invite)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this._sending.set(false);
          this._sent.set(created);
          this._summary.update((current) =>
            current ? { ...current, sentThisMonth: current.sentThisMonth + 1 } : current,
          );
          onDone(created);
        },
        error: (cause: unknown) => {
          this._sending.set(false);
          this._error.set(
            cause instanceof Error ? cause.message : "That invitation didn't send. Try again.",
          );
          onDone(null);
        },
      });
  }
}
