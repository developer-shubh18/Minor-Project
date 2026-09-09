import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../environments/environments';
export interface SupportedLanguage {
  code: string;
  name: string;
}

export interface TranslationResult {
  translatedText: string;
  detectedLanguage: string;
  targetLanguage: string;
}

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/chat`;

  // Cache for translations: key = `${messageId}_${targetLang}`, value = translated text
  private translationCache = new Map<string, string>();

  // Supported languages list
  supportedLanguages = signal<SupportedLanguage[]>([]);

  // Track which messages are showing translated text: messageId -> boolean
  private showTranslatedMap = new Map<string, boolean>();

  // Global translate all toggle
  translateAll = signal<boolean>(false);

  toggleTranslateAll() {
    this.translateAll.update(v => !v);
  }

  // Track loading state per message
  private loadingMap = new Map<string, boolean>();

  /** Fetch supported languages from server */
  loadLanguages(): Observable<SupportedLanguage[]> {
    return this.http.get<any>(`${this.apiUrl}/languages`).pipe(
      map(res => res.languages || []),
      tap(languages => this.supportedLanguages.set(languages)),
      catchError(() => of([]))
    );
  }

  /** Translate text on-demand via backend */
  translate(text: string, targetLanguage: string, sourceLanguage?: string): Observable<TranslationResult> {
    return this.http.post<any>(`${this.apiUrl}/translate`, {
      text,
      targetLanguage,
      sourceLanguage
    }).pipe(
      map(res => res.translation),
      catchError(() => of({
        translatedText: text,
        detectedLanguage: sourceLanguage || 'unknown',
        targetLanguage
      }))
    );
  }

  /** Get cached translation for a message, or null if not cached */
  getCachedTranslation(messageId: string, targetLang: string): string | null {
    return this.translationCache.get(`${messageId}_${targetLang}`) || null;
  }

  /** Cache a translation */
  cacheTranslation(messageId: string, targetLang: string, translatedText: string): void {
    this.translationCache.set(`${messageId}_${targetLang}`, translatedText);
  }

  /** Check if a message is currently showing translated version */
  isShowingTranslated(messageId: string): boolean {
    return this.showTranslatedMap.get(messageId) || false;
  }

  /** Toggle between original and translated text for a message */
  toggleTranslation(messageId: string): void {
    const current = this.showTranslatedMap.get(messageId) || false;
    this.showTranslatedMap.set(messageId, !current);
  }

  /** Set showing translated state */
  setShowTranslated(messageId: string, show: boolean): void {
    this.showTranslatedMap.set(messageId, show);
  }

  /** Check if a message translation is loading */
  isLoading(messageId: string): boolean {
    return this.loadingMap.get(messageId) || false;
  }

  /** Set loading state */
  setLoading(messageId: string, loading: boolean): void {
    this.loadingMap.set(messageId, loading);
  }

  /** Get language name from code */
  getLanguageName(code: string): string {
    const lang = this.supportedLanguages().find(l => l.code === code);
    return lang?.name || code.toUpperCase();
  }
}
