import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of } from 'rxjs';
import { DashboardRepository } from '../../core/api/ports/dashboard-repository';
import { OVERVIEW_FIXTURE } from '../../core/api/in-memory/in-memory-dashboard-repository';
import { OverviewSnapshot } from '../../core/models/overview.model';
import { ConsoleChrome } from '../../layouts/console-layout/console-chrome';
import { Dashboard } from './dashboard';

/** The fixture snapshot, delivered synchronously. */
class StubDashboardRepository extends DashboardRepository {
  override overview(): Observable<OverviewSnapshot> {
    return of(OVERVIEW_FIXTURE);
  }
}

describe('Dashboard', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        ConsoleChrome,
        { provide: DashboardRepository, useClass: StubDashboardRepository },
      ],
    }).compileComponents();
  });

  it('renders the overview once the snapshot loads', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Saturday 14 June');
    expect(text).toContain('Active markets');
    expect(text).toContain('Open enquiries');
    expect(text).toContain('Temple Bar Food Market');
    expect(text).toContain('Coolea Cheese Co.');
  });

  it('toggles the drawer through the shared chrome', () => {
    TestBed.createComponent(Dashboard);
    const chrome = TestBed.inject(ConsoleChrome);
    expect(chrome.drawerOpen()).toBe(true);
    chrome.toggleDrawer();
    expect(chrome.drawerOpen()).toBe(false);
  });
});
