import { useState, useEffect, useRef } from 'react';
import { 
  Volume2, VolumeX, FastForward, Sparkles, Check, 
  Film, Eye, ArrowRight
} from 'lucide-react';
import { PreloaderSettings } from '../lib/db';

interface AppPreloaderProps {
  settings: PreloaderSettings;
  onFinished: () => void;
  isPreviewMode?: boolean; // Used in Admin Panel to preview the primary video/gif
}

export function AppPreloader({ settings, onFinished, isPreviewMode = false }: AppPreloaderProps) {
  // If disabled and not in preview mode, finish immediately
  if (!settings.isEnabled && !isPreviewMode) {
    onFinished();
    return null;
  }

  // Auto-detect effective media type from URL if settings.mediaType was unset or 'none'
  const rawUrl = settings.mediaUrl?.trim() || '';
  const isVideoUrl = rawUrl.includes('.mp4') || rawUrl.includes('.webm') || rawUrl.includes('pinimg.com') || settings.mediaType === 'video';
  const effectiveMediaType: 'video' | 'gif' | 'image' | 'none' = rawUrl
    ? (isVideoUrl ? 'video' : (settings.mediaType !== 'none' ? settings.mediaType : 'image'))
    : 'none';

  const hasPrimaryMedia = effectiveMediaType !== 'none' && Boolean(rawUrl);

  const hasSeenVersion = !isPreviewMode && typeof window !== 'undefined' && settings.versionId
    ? localStorage.getItem(`seen_preloader_version_${settings.versionId}`) === 'true'
    : false;

  // If user hasn't seen this version yet AND primary media exists -> show primary video/gif!
  // Otherwise -> show quick secondary preloader with stylish harmonic wave!
  const initialMode: 'primary' | 'secondary' = (hasPrimaryMedia && (!hasSeenVersion || isPreviewMode))
    ? 'primary'
    : 'secondary';

  const [mode, setMode] = useState<'primary' | 'secondary'>(initialMode);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  // Sync mode if settings change dynamically
  useEffect(() => {
    if (hasPrimaryMedia && (!hasSeenVersion || isPreviewMode)) {
      setMode('primary');
    }
  }, [settings.versionId, settings.mediaUrl, isPreviewMode]);

  // Force video element playback on mount / mode switch
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (mode === 'primary' && effectiveMediaType === 'video' && videoRef.current) {
      videoRef.current.muted = isMuted;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('Autoplay with sound prevented, switching to muted play:', err);
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().catch((e) => console.warn('Muted autoplay also prevented:', e));
          }
        });
      }
    }
  }, [mode, isMuted, settings.mediaUrl, effectiveMediaType]);
  
  // Progress & Timers
  const totalDuration = mode === 'primary' 
    ? Math.max(3, settings.durationSeconds || 15) 
    : Math.max(1.5, settings.secondaryDurationSeconds || 3);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Mark as seen and exit
  const handleComplete = () => {
    if (mode === 'primary' && !isPreviewMode && settings.versionId) {
      localStorage.setItem(`seen_preloader_version_${settings.versionId}`, 'true');
    }
    setIsFadingOut(true);
    setTimeout(() => {
      onFinished();
    }, 450);
  };

  const handleSkip = () => {
    handleComplete();
  };

  // Timer effect
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 0.1;
        if (next >= totalDuration) {
          clearInterval(interval);
          handleComplete();
          return totalDuration;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [mode, totalDuration]);

  // Wave bar delay patterns for 9 harmonic bars
  const waveDelays = [0, 0.15, 0.3, 0.45, 0.6, 0.45, 0.3, 0.15, 0];
  const waveHeights = [28, 48, 72, 92, 100, 88, 64, 42, 24]; // Base max height percentages

  const progressPercent = Math.min(100, (elapsedSeconds / totalDuration) * 100);
  const remainingSeconds = Math.max(0, Math.ceil(totalDuration - elapsedSeconds));

  return (
    <div 
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0F0E0D] text-[#EDE9DF] transition-opacity duration-500 overflow-hidden select-none ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      {/* ------------------------------------------------------------- */}
      {/* MODE 1: PRIMARY THEMATIC PRELOADER (Video / GIF / Poster) */}
      {/* ------------------------------------------------------------- */}
      {mode === 'primary' && (
        <div className="relative w-full h-full flex flex-col items-center justify-center">
          
          {/* Background Ambient Glow */}
          <div className="absolute inset-0 bg-radial from-[#CC785C]/15 via-transparent to-black pointer-events-none z-10" />

          {/* Media Viewport with Pinterest-friendly Ambient Blurred Backdrop */}
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
            {/* Ambient Blurred Background (fills side bars with smooth dynamic colors of the video) */}
            {effectiveMediaType === 'video' ? (
              <video
                src={settings.mediaUrl}
                autoPlay
                playsInline
                muted
                loop
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-45 brightness-75 pointer-events-none"
              />
            ) : (
              <img
                src={settings.mediaUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-45 brightness-75 pointer-events-none"
              />
            )}

            {/* Crisp Uncropped Foreground Media (Perfect 100% full view for Pinterest vertical videos) */}
            {effectiveMediaType === 'video' ? (
              <video
                ref={videoRef}
                src={settings.mediaUrl}
                poster={settings.mediaPosterUrl || undefined}
                autoPlay
                playsInline
                muted={isMuted}
                loop={false}
                onEnded={handleComplete}
                onError={(err) => {
                  console.warn('Preloader video failed to load, switching to secondary preloader', err);
                  setMode('secondary');
                }}
                className="relative z-10 w-full h-full object-contain max-w-full max-h-full drop-shadow-2xl"
              />
            ) : (
              <img
                src={settings.mediaUrl}
                alt={settings.title || 'Preloader animation'}
                onError={() => {
                  console.warn('Preloader image failed to load, switching to secondary preloader');
                  setMode('secondary');
                }}
                className="relative z-10 w-full h-full object-contain max-w-full max-h-full drop-shadow-2xl animate-in zoom-in-95 duration-700"
              />
            )}

            {/* Subtle Gradient Overlays for top/bottom text contrast */}
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/85 via-black/40 to-transparent pointer-events-none z-20" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none z-20" />
          </div>

          {/* Top Header Bar: Title / Greeting & Controls */}
          <div 
            className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 sm:p-6"
            style={{ paddingTop: 'calc(1rem + var(--safe-top, 0px))' }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#CC785C]/25 border border-[#CC785C]/40 text-[#CC785C] flex items-center justify-center shadow-lg">
                <Sparkles size={16} />
              </div>
              <div className="drop-shadow-md">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  {settings.title || 'AI Studio'}
                </h2>
                {settings.subtext && (
                  <p className="text-[11px] text-[#C4BFB5] line-clamp-1">
                    {settings.subtext}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Unmute button for video */}
              {settings.mediaType === 'video' && (
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white/90 hover:text-white border border-white/15 backdrop-blur-md transition-all active:scale-95 shadow-md"
                  title={isMuted ? 'Увімкнути звук' : 'Вимкнути звук'}
                >
                  {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
              )}

              {/* Skip Button */}
              {settings.allowSkip && (
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white text-xs font-semibold border border-white/20 backdrop-blur-md transition-all active:scale-95 shadow-md group"
                >
                  <span>Пропустити</span>
                  <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </div>
          </div>

          {/* Bottom Progress & Countdown Bar */}
          <div className="absolute bottom-6 inset-x-4 sm:inset-x-8 z-30 space-y-2 max-w-xl mx-auto">
            <div className="flex items-center justify-between text-[11px] font-medium text-white/90 drop-shadow-md px-1">
              <span className="flex items-center gap-1.5">
                <Film size={13} className="text-[#CC785C]" />
                <span>Завантаження застосунку...</span>
              </span>
              <span className="font-mono bg-black/50 px-2 py-0.5 rounded-full border border-white/10">
                0:{remainingSeconds.toString().padStart(2, '0')}
              </span>
            </div>

            {/* Glowing Progress Track */}
            <div className="w-full h-1.5 rounded-full bg-white/20 backdrop-blur-md overflow-hidden relative shadow-sm">
              <div 
                className="h-full bg-gradient-to-r from-amber-400 via-[#CC785C] to-red-500 rounded-full transition-all duration-100 ease-linear shadow-[0_0_12px_rgba(204,120,92,0.8)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODE 2: SECONDARY PRELOADER WITH STYLIZED HARMONIC WAVE */}
      {/* ------------------------------------------------------------- */}
      {mode === 'secondary' && (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
          
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute w-80 h-80 rounded-full bg-[#CC785C]/12 blur-3xl pointer-events-none -top-12" />
          <div className="absolute w-72 h-72 rounded-full bg-amber-500/10 blur-3xl pointer-events-none -bottom-12" />

          <div className="relative z-10 flex flex-col items-center space-y-7 max-w-sm">
            
            {/* Thematic Brand Image or Stylized Star Emblem */}
            <div className="relative animate-glow-breathe">
              {settings.secondaryImageUrl ? (
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden border-2 border-[#5A382A] shadow-2xl bg-[#1C1A17] p-1 flex items-center justify-center">
                  <img
                    src={settings.secondaryImageUrl}
                    alt="Logo"
                    className="w-full h-full object-contain rounded-2xl"
                  />
                </div>
              ) : (
                <div className="w-22 h-22 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br from-[#3D261B] to-[#1C1814] border-2 border-[#683C2A] text-[#CC785C] flex items-center justify-center shadow-2xl">
                  {/* Claude signature 4-point star SVG */}
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" className="drop-shadow-[0_0_12px_rgba(204,120,92,0.6)]">
                    <path
                      d="M12 2C12 7.52285 7.52285 12 2 12C7.52285 12 12 16.4772 12 22C12 16.4772 16.4772 12 22 12C16.4772 12 12 7.52285 12 2Z"
                      fill="#CC785C"
                    />
                  </svg>
                </div>
              )}

              {/* Pulsing Aura Ring */}
              <div className="absolute -inset-2.5 rounded-[28px] border border-[#CC785C]/30 animate-ping pointer-events-none opacity-40" />
            </div>

            {/* Typography */}
            <div className="space-y-1.5">
              <h1 className="font-claude-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#FAF8F5]">
                {settings.title || 'AI Studio'}
              </h1>
              <p className="text-xs sm:text-sm text-[#9E9A92] font-medium">
                {settings.secondaryText || 'Завантаження застосунку...'}
              </p>
            </div>

            {/* STYLIZED HARMONIC LIQUID WAVE (Not a boring circular spinner!) */}
            <div className="py-2 flex flex-col items-center gap-3">
              <div className="flex items-center justify-center gap-1.5 sm:gap-2 h-14 px-4 py-2 rounded-2xl bg-[#1B1A17]/80 border border-[#343029] backdrop-blur-xs shadow-inner">
                {waveDelays.map((delay, idx) => (
                  <div
                    key={idx}
                    className="w-1.5 sm:w-2 rounded-full bg-gradient-to-t from-[#CC785C] via-amber-400 to-[#FAF8F5] animate-wave-bar shadow-sm"
                    style={{
                      height: `${waveHeights[idx]}%`,
                      animationDelay: `${delay}s`,
                    }}
                  />
                ))}
              </div>

              {/* Micro Status */}
              <div className="flex items-center gap-1.5 text-[11px] text-[#7A766F] font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Ініціалізація сесії</span>
              </div>
            </div>

            {/* Quick Progress Bar */}
            <div className="w-48 h-1 rounded-full bg-[#272521] overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-400 to-[#CC785C] rounded-full transition-all duration-100 ease-linear shadow-[0_0_8px_rgba(204,120,92,0.6)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
