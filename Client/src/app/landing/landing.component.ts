import { Component, OnInit, OnDestroy, AfterViewInit, HostListener, ChangeDetectorRef } from '@angular/core';
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

  constructor(private cdr: ChangeDetectorRef) {}

  /** Animated counter values */
  userCount = 0;
  langCount = 0;
  msgCount = 0;

  private counterDone = false;

  /** Current year for footer */
  currentYear = new Date().getFullYear();

  /** Navbar scroll state */
  navScrolled = false;
  
  @HostListener('scroll', ['$event.target'])
  onScroll(target: HTMLElement) {
    this.navScrolled = target.scrollTop > 0;
  }

  ngOnInit() {
    this.initLanguageShuffling();
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
    this.observer?.disconnect();

    if (this.shuffleInterval) {
      clearInterval(this.shuffleInterval);
    }
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

  // --- Dynamic Language Shuffling Logic ---
  ALL_LANGUAGES = [
    '🇪🇸 Hola', '🇫🇷 Bonjour', '🇯🇵 こんにちは', '🇩🇪 Hallo', '🇮🇳 नमस्ते',
    '🇸🇦 مرحبا', '🇳🇱 Hallo', '🇵🇱 Cześć', '🇬🇷 Γεια σας', '🇰🇷 안녕하세요',
    '🇮🇳 નમસ્તે', '🇮🇳 ਸਤ ਸ੍ਰੀ ਅਕਾਲ', '🇮🇳 নমস্কার', '🇮🇳 வணக்கம்', '🇮🇳 నమస్కారం',
    '🇮🇳 ನಮಸ್ಕಾರ', '🇮🇳 നമസ്കാരം', '🇮🇳 नमस्कार', '🇳🇵 नमस्ते', '🇧🇹 སྐུ་གཟུགས་བཟང་པོ།',
    '🇱🇰 ආයුබෝවන්', '🇨🇳 你好', '🇻🇳 Xin chào', '🇹🇭 สวัสดี', '🇮🇩 Halo',
    '🇵🇭 Kamusta', '🇰🇪 Jambo', '🇿🇦 Sawubona', '🇿🇦 Molo', '🇪🇹 ሰላም'
  ];

  visibleSlots: { lang: string, class: string, isFading: boolean }[] = [];
  hiddenPool: string[] = [];
  private shuffleInterval: any;

  private initLanguageShuffling() {
    const shuffled = [...this.ALL_LANGUAGES].sort(() => 0.5 - Math.random());
    
    // Initial 15 slots
    for (let i = 0; i < 15; i++) {
      this.visibleSlots.push({
        lang: shuffled[i],
        class: `lang-${i + 1}`,
        isFading: false
      });
    }
    
    // Remaining go to hidden pool
    this.hiddenPool = shuffled.slice(15);

    // Swap 5 every 1 second
    this.shuffleInterval = setInterval(() => {
      this.swapLanguages();
    }, 1000);
  }

  private swapLanguages() {
    // Pick 5 random indices from visible slots
    const indicesToSwap = this.getRandomIndices(15, 5);
    
    // Start fade out
    indicesToSwap.forEach(idx => {
      this.visibleSlots[idx].isFading = true;
    });
    this.cdr.detectChanges();

    // Wait for fade out animation (e.g. 400ms), then swap and fade back in
    setTimeout(() => {
      indicesToSwap.forEach(idx => {
        const oldLang = this.visibleSlots[idx].lang;
        const newLang = this.hiddenPool.pop()!;
        
        this.visibleSlots[idx].lang = newLang;
        this.hiddenPool.unshift(oldLang);
        this.visibleSlots[idx].isFading = false;
      });
      this.cdr.detectChanges();
    }, 400);
  }

  private getRandomIndices(max: number, count: number): number[] {
    const indices = Array.from({ length: max }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, count);
  }
}
