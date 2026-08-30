import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * Thin intent-shaped wrapper over MatSnackBar so components never repeat
 * duration/position config, and so the toast implementation stays swappable.
 */
@Injectable({ providedIn: 'root' })
export class Notifications {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.open(message, 'md-snack-success');
  }

  info(message: string): void {
    this.open(message, 'md-snack-info');
  }

  error(message: string): void {
    this.open(message, 'md-snack-error', 6000);
  }

  private open(message: string, panelClass: string, duration = 4000): void {
    this.snackBar.open(message, 'Dismiss', {
      duration,
      panelClass,
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
    });
  }
}
