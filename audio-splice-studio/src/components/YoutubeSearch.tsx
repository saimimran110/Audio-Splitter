import { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { Search, Music2, Loader2, Clock, ExternalLink } from 'lucide-react';
import { searchYoutube, splitYoutubeAudio, YouTubeResult } from '@/services/api';

interface YouTubeSearchProps {
    onJobStart?: (jobId: string, title?: string) => void;
    onSelectVideo?: (url: string, title: string) => Promise<void> | void;
    onStatusMessage: (msg: string) => void;
    disabled?: boolean;
}

function formatDuration(sec: number): string {
    if (!sec) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export const YouTubeSearch = ({ onJobStart, onSelectVideo, onStatusMessage, disabled }: YouTubeSearchProps) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<YouTubeResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [splitingId, setSplitingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const lastQueryRef = useRef('');

    const handleSearch = async (searchVal?: string) => {
        const q = (searchVal !== undefined ? searchVal : query).trim();
        if (!q || q === lastQueryRef.current) return;

        lastQueryRef.current = q;
        setSearching(true);
        setError(null);
        try {
            const res = await searchYoutube(q);
            setResults(res);
            if (res.length === 0) {
                setError('No results found. Try a different search term.');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
            setResults([]);
        } finally {
            setSearching(false);
        }
    };

    // Debounce the input query to search automatically after typing stops
    useEffect(() => {
        const q = query.trim();
        if (!q) {
            setResults([]);
            setError(null);
            lastQueryRef.current = '';
            return;
        }

        const timer = setTimeout(() => {
            handleSearch(q);
        }, 600);

        return () => clearTimeout(timer);
    }, [query]);

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSearch();
    };

    const handleSplit = async (video: YouTubeResult) => {
        setSplitingId(video.videoId);
        setError(null);
        try {
            if (onSelectVideo) {
                await onSelectVideo(video.url, video.title);
            } else if (onJobStart) {
                onStatusMessage(`Queueing "${video.title}" for processing...`);
                const jobId = await splitYoutubeAudio(video.url, video.title);
                onJobStart(jobId, video.title);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start processing');
            setSplitingId(null);
            onStatusMessage('');
        } finally {
            setSplitingId(null);
        }
    };


    return (
        <div style={{ width: '100%', maxWidth: '700px', margin: '0 auto' }}>
            {/* Search bar */}
            <div style={{ 
                display: 'flex', 
                marginBottom: '24px',
                position: 'relative',
                boxShadow: '0 0 20px rgba(168,85,247,0.2)',
                borderRadius: '9999px',
                border: '1px solid rgba(168,85,247,0.4)',
                background: 'rgba(255,255,255,0.03)'
            }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search
                        style={{
                            position: 'absolute',
                            left: '20px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#9ca3af',
                            width: '18px',
                            height: '18px',
                            pointerEvents: 'none',
                        }}
                    />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Search for a song, artist, or karaoke track..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={disabled || searching || !!splitingId}
                        style={{
                            width: '100%',
                            paddingLeft: '50px',
                            paddingRight: '140px',
                            paddingTop: '16px',
                            paddingBottom: '16px',
                            fontSize: '15px',
                            background: 'transparent',
                            border: 'none',
                            color: '#e5e7eb',
                            outline: 'none',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>
                <button
                    onClick={handleSearch}
                    disabled={!query.trim() || searching || !!splitingId || disabled}
                    style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: searching ? '#d1d5db' : '#fff',
                        background: searching ? 'rgba(255,255,255,0.1)' : 'rgba(139,92,246,0.6)',
                        border: 'none',
                        borderRadius: '9999px',
                        cursor: searching || !query.trim() || disabled ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    {searching ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
                    {searching ? 'Searching...' : 'Search'}
                </button>
            </div>

            {/* Error */}
            {error && (
                <p style={{ color: '#f87171', fontSize: '13px', textAlign: 'center', marginBottom: '16px' }}>
                    {error}
                </p>
            )}

            {/* Results list */}
            {results.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {results.map((video) => {
                        const isSpliting = splitingId === video.videoId;
                        return (
                            <div
                                key={video.videoId}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '14px',
                                    padding: '12px 14px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: '12px',
                                    transition: 'border-color 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(139,92,246,0.3)';
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)';
                                }}
                            >
                                {/* Thumbnail */}
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <img
                                        src={video.thumbnail}
                                        alt={video.title}
                                        style={{
                                            width: '90px',
                                            height: '60px',
                                            objectFit: 'cover',
                                            borderRadius: '8px',
                                            display: 'block',
                                        }}
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                        }}
                                    />
                                    {video.durationSec > 0 && (
                                        <span
                                            style={{
                                                position: 'absolute',
                                                bottom: '4px',
                                                right: '4px',
                                                background: 'rgba(0,0,0,0.8)',
                                                color: '#fff',
                                                fontSize: '10px',
                                                padding: '1px 4px',
                                                borderRadius: '3px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                            }}
                                        >
                                            <Clock size={9} />
                                            {formatDuration(video.durationSec)}
                                        </span>
                                    )}
                                </div>

                                {/* Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p
                                        style={{
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            color: '#e5e7eb',
                                            marginBottom: '4px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {video.title}
                                    </p>
                                    <p style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Music2 size={11} />
                                        {video.channelTitle}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, alignItems: 'center' }}>
                                    <a
                                        href={video.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Open on YouTube"
                                        style={{
                                            color: '#6b7280',
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '6px',
                                            borderRadius: '6px',
                                            transition: 'color 0.2s',
                                        }}
                                        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#c084fc'; }}
                                        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = '#6b7280'; }}
                                    >
                                        <ExternalLink size={15} />
                                    </a>

                                    <button
                                        onClick={() => handleSplit(video)}
                                        disabled={!!splitingId || disabled}
                                        style={{
                                            padding: '7px 16px',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            color: isSpliting ? '#9ca3af' : '#e5e7eb',
                                            background: isSpliting ? 'rgba(255,255,255,0.04)' : 'rgba(139,92,246,0.18)',
                                            border: `1px solid ${isSpliting ? 'rgba(255,255,255,0.1)' : 'rgba(139,92,246,0.4)'}`,
                                            borderRadius: '8px',
                                            cursor: splitingId ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            whiteSpace: 'nowrap',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        {isSpliting ? (
                                            <>
                                                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                                Starting...
                                            </>
                                        ) : (
                                            <>
                                                <Music2 size={13} />
                                                Split Stems
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Empty state before search */}
            {results.length === 0 && !searching && !error && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                    <Search size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ fontSize: '14px' }}>
                        Search any song name to find it on YouTube, then click <strong>Split Stems</strong>
                    </p>
                </div>
            )}

            {/* Disclaimer */}
            <div style={{ 
                marginTop: '24px', 
                padding: '12px', 
                borderRadius: '8px', 
                border: '1px solid rgba(255,255,255,0.05)', 
                background: 'rgba(255,255,255,0.01)',
                textAlign: 'center', 
                fontSize: '11px', 
                color: '#6b7280',
                lineHeight: '1.5'
            }}>
                For personal/educational use only. Please support artists by purchasing music.
            </div>

            <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
};
