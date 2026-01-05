
import React, { useEffect, useRef, useState, useCallback } from 'react';

interface VideoPlayerProps {
  src: string;
  logoUrl: string;
}

declare global {
  interface Window {
    Hls: any;
  }
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, logoUrl }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hlsReady, setHlsReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(err => console.error(err));
    } else {
      await document.exitFullscreen().catch(err => console.error(err));
    }
    handleActivity();
  };

  const safePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (playPromiseRef.current) await playPromiseRef.current;
      const promise = video.play();
      if (promise !== undefined) {
        playPromiseRef.current = promise;
        await promise;
        playPromiseRef.current = null;
      }
    } catch (error: any) {
      playPromiseRef.current = null;
      if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
        console.error("Playback failed:", error);
      }
      throw error;
    }
  }, []);

  const safePause = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (playPromiseRef.current) {
      try { await playPromiseRef.current; } catch (e) {}
    }
    video.pause();
  }, []);

  const hideControlsAfterDelay = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 5000);
  }, []);

  const handleActivity = () => {
    setShowControls(true);
    hideControlsAfterDelay();
  };

  useEffect(() => {
    const checkHls = () => {
      if (window.Hls) setHlsReady(true);
      else setTimeout(checkHls, 100);
    };
    checkHls();
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  const initPlayer = useCallback(() => {
    if (!hlsReady || !videoRef.current) return;
    const video = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const Hls = window.Hls;
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadingMaxRetry: Infinity,
        levelLoadingMaxRetry: Infinity,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => safePlay().catch(() => setShowControls(true)));
      hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
            case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
            default: initPlayer(); break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => safePlay().catch(() => setShowControls(true)));
    }
  }, [src, hlsReady, safePlay]);

  useEffect(() => {
    initPlayer();
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => { setIsPlaying(true); setIsBuffering(false); };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onVolumeChange = () => setIsMuted(video.muted || video.volume === 0);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('volumechange', onVolumeChange);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, [initPlayer]);

  const togglePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.paused ? await safePlay() : await safePause();
    handleActivity();
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
    handleActivity();
  };

  const refreshStream = (e: React.MouseEvent) => {
    e.stopPropagation();
    initPlayer();
    handleActivity();
  };

  return (
    <div 
      ref={containerRef}
      id="video-container"
      onClick={handleActivity}
      onMouseMove={handleActivity}
      className="absolute inset-0 bg-black flex items-center justify-center overflow-hidden select-none"
      style={{ cursor: showControls ? 'default' : 'none' }}
    >
      <video 
        ref={videoRef}
        className="w-full h-full object-contain pointer-events-none"
        playsInline
        autoPlay
        muted={isMuted}
      />

      {isBuffering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none bg-black/40 backdrop-blur-[4px]">
          <div className="flex items-end gap-2 h-10 mb-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-1.5 bg-red-600 rounded-full animate-wave" style={{ animationDelay: `${i * 0.1}s`, height: '100%' }} />
            ))}
          </div>
          <span className="text-white/90 text-[10px] font-black tracking-[0.5em] uppercase animate-pulse">Carregando Top TV</span>
        </div>
      )}

      {/* Logo fixo no Topo */}
      <div className="absolute top-6 left-6 md:top-8 md:left-8 z-10 pointer-events-none">
        <img src={logoUrl} alt="Top TV" className="h-10 md:h-14 drop-shadow-2xl opacity-90" />
      </div>

      {/* Controles */}
      <div className={`absolute inset-0 z-30 flex flex-col justify-end transition-opacity duration-700 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none"></div>

        <div className="relative p-6 md:p-12 space-y-6">
          <div className="flex items-center justify-between w-full max-w-6xl mx-auto">
            {/* Esquerda: Refresh e Mute */}
            <div className="flex flex-1 items-center gap-3">
              <button onClick={refreshStream} className="p-3 md:p-4 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 transition-all active:scale-90 group">
                <RefreshIcon size={20} />
              </button>
              <button onClick={toggleMute} className="p-3 md:p-4 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 transition-all active:scale-90">
                {isMuted ? <MuteIcon size={20} /> : <VolumeIcon size={20} />}
              </button>
            </div>

            {/* Centro: Play Principal */}
            <div className="flex flex-none items-center justify-center">
              <button onClick={togglePlay} className="p-7 md:p-9 rounded-full bg-red-600 hover:bg-red-500 shadow-[0_0_50px_rgba(220,38,38,0.4)] transition-all active:scale-90 flex items-center justify-center transform hover:scale-105">
                {isPlaying ? <PauseIcon size={40} /> : <PlayIcon size={40} />}
              </button>
            </div>

            {/* Direita: Fullscreen */}
            <div className="flex flex-1 items-center justify-end gap-3">
              <button onClick={toggleFullscreen} className="p-3 md:p-4 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 transition-all active:scale-90">
                {isFullscreen ? <MinimizeIcon size={20} /> : <MaximizeIcon size={20} />}
              </button>
            </div>
          </div>

          <div className="w-full max-w-6xl mx-auto space-y-2">
            <div className="flex items-center gap-2 text-white/60 text-[9px] font-black uppercase tracking-[0.3em]">
              <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
              Transmissão Ao Vivo • HD 1080P
            </div>
            <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-red-600 w-full opacity-50"></div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wave {
          0%, 100% { transform: scaleY(0.4); opacity: 0.5; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        .animate-wave {
          animation: wave 1s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>
    </div>
  );
};

// Ícones
const PlayIcon = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>;
const PauseIcon = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>;
const RefreshIcon = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>;
const VolumeIcon = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>;
const MuteIcon = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>;
const MaximizeIcon = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>;
const MinimizeIcon = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>;

export default VideoPlayer;
