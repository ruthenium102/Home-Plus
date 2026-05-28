import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

// Web Speech API isn't in lib.dom yet — declare just enough for our use.
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
  length: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const isNative = Capacitor.isNativePlatform();

export type VoiceCaptureStatus = 'idle' | 'listening' | 'error';

interface UseVoiceCaptureOptions {
  /** Called once the final transcript is ready and recognition has ended. */
  onFinal: (transcript: string) => void;
  /** Called on error (permission denied, network, etc). */
  onError?: (message: string) => void;
}

/**
 * Capture a short voice utterance. On Capacitor iOS we drive Apple's
 * on-device recogniser via @capacitor-community/speech-recognition; in the
 * browser we fall back to webkitSpeechRecognition. Both surfaces the same
 * idle/listening state, a live transcript, and an onFinal callback that
 * fires when the user stops or recognition ends.
 */
export function useVoiceCapture({ onFinal, onError }: UseVoiceCaptureOptions) {
  const WebCtor = getRecognitionCtor();
  const supported = isNative || WebCtor !== null;
  const webRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  // Native side keeps the two listener handles + the latest partial-result
  // text so the listeningState=stopped callback can deliver it as final.
  const nativeRef = useRef<{
    partial: PluginListenerHandle;
    state: PluginListenerHandle;
    latest: string;
  } | null>(null);
  const [status, setStatus] = useState<VoiceCaptureStatus>('idle');
  const [transcript, setTranscript] = useState('');
  // Keep latest callback refs so handler closures don't go stale.
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onFinalRef.current = onFinal;
    onErrorRef.current = onError;
  }, [onFinal, onError]);

  const cleanupNative = useCallback(async () => {
    const handles = nativeRef.current;
    if (!handles) return;
    nativeRef.current = null;
    try {
      await handles.partial.remove();
      await handles.state.remove();
    } catch {
      /* ignore */
    }
  }, []);

  const stop = useCallback(() => {
    if (isNative) {
      SpeechRecognition.stop().catch(() => {
        /* ignore — listeningState handler will tidy up */
      });
      return;
    }
    webRecognitionRef.current?.stop();
  }, []);

  const startNative = useCallback(async () => {
    try {
      const perm = await SpeechRecognition.checkPermissions();
      if (perm.speechRecognition !== 'granted') {
        const req = await SpeechRecognition.requestPermissions();
        if (req.speechRecognition !== 'granted') {
          setStatus('error');
          onErrorRef.current?.('Microphone permission denied');
          return;
        }
      }
      const avail = await SpeechRecognition.available();
      if (!avail.available) {
        setStatus('error');
        onErrorRef.current?.('Speech recognition unavailable on this device');
        return;
      }

      setStatus('listening');
      setTranscript('');

      const partial = await SpeechRecognition.addListener('partialResults', (data) => {
        const text = (data.matches?.[0] ?? '').trim();
        if (!text) return;
        if (nativeRef.current) nativeRef.current.latest = text;
        setTranscript(text);
      });
      const state = await SpeechRecognition.addListener('listeningState', (data) => {
        if (data.status !== 'stopped') return;
        const handles = nativeRef.current;
        const finalText = handles?.latest ?? '';
        void cleanupNative();
        setStatus('idle');
        if (finalText) onFinalRef.current(finalText);
      });
      nativeRef.current = { partial, state, latest: '' };

      await SpeechRecognition.start({
        language: navigator.language || 'en-US',
        partialResults: true,
        popup: false,
      });
    } catch (err) {
      void cleanupNative();
      setStatus('error');
      onErrorRef.current?.(err instanceof Error ? err.message : String(err));
    }
  }, [cleanupNative]);

  const startWeb = useCallback(() => {
    if (!WebCtor) {
      onErrorRef.current?.('Voice not supported on this device');
      return;
    }
    if (webRecognitionRef.current) return; // already running
    const rec = new WebCtor();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = '';

    rec.onstart = () => {
      setStatus('listening');
      setTranscript('');
    };
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finalText += text;
        else interim += text;
      }
      setTranscript((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      const msg =
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microphone permission denied'
          : e.error === 'no-speech'
            ? "Didn't catch that"
            : e.error === 'audio-capture'
              ? 'No microphone found'
              : e.error || 'Voice error';
      setStatus('error');
      webRecognitionRef.current = null;
      onErrorRef.current?.(msg);
    };
    rec.onend = () => {
      webRecognitionRef.current = null;
      setStatus('idle');
      const text = finalText.trim();
      if (text) onFinalRef.current(text);
    };

    webRecognitionRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      webRecognitionRef.current = null;
      setStatus('error');
      onErrorRef.current?.(err instanceof Error ? err.message : String(err));
    }
  }, [WebCtor]);

  const start = useCallback(() => {
    if (isNative) void startNative();
    else startWeb();
  }, [startNative, startWeb]);

  // Tidy up if the consumer unmounts mid-listen.
  useEffect(
    () => () => {
      webRecognitionRef.current?.abort();
      if (nativeRef.current) {
        SpeechRecognition.stop().catch(() => {});
        void cleanupNative();
      }
    },
    [cleanupNative],
  );

  return { supported, status, transcript, start, stop };
}
