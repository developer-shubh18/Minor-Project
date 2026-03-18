import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css'
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  private observer!: IntersectionObserver;

  /** Animated counter values */
  userCount = 0;
  langCount = 0;
  msgCount = 0;

  private counterDone = false;

  /** Current year for footer */
  currentYear = new Date().getFullYear();

  /** Navbar scroll state */
  navScrolled = false;
  private scrollHandler = () => {
    this.navScrolled = window.scrollY > 60;
  };

  ngOnInit() {
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  ngAfterViewInit() {
    // Intersection Observer for scroll-reveal
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');

            // Trigger counters once
            if (entry.target.classList.contains('stats-section') && !this.counterDone) {
              this.counterDone = true;
              this.animateCounters();
            }
          }
        });
      },
      { threshold: 0.15 }
    );

    document.querySelectorAll('.reveal').forEach((el) => this.observer.observe(el));
  }

  ngOnDestroy() {
    window.removeEventListener('scroll', this.scrollHandler);
    this.observer?.disconnect();
  }

  /** Smooth scroll to an anchor */
  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }

  private animateCounters() {
    this.countUp('userCount', 10000, 2000);
    this.countUp('langCount', 100, 2000);
    this.countUp('msgCount', 1, 2000); // 1 M
  }

  private countUp(prop: 'userCount' | 'langCount' | 'msgCount', target: number, duration: number) {
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      (this as any)[prop] = Math.round(ease * target);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
