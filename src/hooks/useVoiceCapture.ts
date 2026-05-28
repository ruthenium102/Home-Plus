import { useCallback, useEffect, useRef, useState } from 'react';

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

export type VoiceCaptureStatus = 'idle' | 'listening' | 'error';

interface UseVoiceCaptureOptions {
  /** Called once the final transcript is ready and recognition has ended. */
  onFinal: (transcript: string) => void;
  /** Called on error (permission denied, network, etc). */
  onError?: (message: string) => void;
}

/**
 * Wrap webkitSpeechRecognition with start/stop, a live `transcript`, and a
 * `status` state machine. The Web Speech API only fires `result` when it
 * detects speech and finalises on a silence gap, so the consumer doesn't need
 * to do their own voice activity detection.
 */
export function useVoiceCapture({ onFinal, onError }: UseVoiceCaptureOptions) {
  const Ctor = getRecognitionCtor();
  const supported = Ctor !== null;
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [status, setStatus] = useState<VoiceCaptureStatus>('idle');
  const [transcript, setTranscript] = useState('');
  // Keep latest callback refs so the handler closures don't go stale.
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onFinalRef.current = onFinal;
    onErrorRef.current = onError;
  }, [onFinal, onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!Ctor) {
      onErrorRef.current?.('Voice not supported on this device');
      return;
    }
    if (recognitionRef.current) return; // already running
    const rec = new Ctor();
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
      recognitionRef.current = null;
      onErrorRef.current?.(msg);
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setStatus('idle');
      const text = finalText.trim();
      if (text) onFinalRef.current(text);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      recognitionRef.current = null;
      setStatus('error');
      onErrorRef.current?.(err instanceof Error ? err.message : String(err));
    }
  }, [Ctor]);

  const reset = useCallback(() => {
    setStatus('idle');
    setTranscript('');
  }, []);

  // Tidy up if the consumer unmounts mid-listen.
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, status, transcript, start, stop, reset };
}
