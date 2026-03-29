const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'TikTok Downloader API',
        version: '2.0.0',
        description: 'Download TikTok videos without watermark - HD, Non-HD & MP3',
        endpoints: {
            download: {
                method: 'POST',
                url: '/api/download',
                body: { url: 'tiktok_video_url' }
            },
            info: {
                method: 'GET',
                url: '/api/info?url=tiktok_video_url'
            },
            health: {
                method: 'GET',
                url: '/health'
            }
        },
        example: {
            curl: 'curl -X POST https://your-domain.com/api/download -H "Content-Type: application/json" -d \'{"url":"https://www.tiktok.com/@user/video/123456789"}\''
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Get video info only
app.get('/api/info', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'URL is required',
            usage: '/api/info?url=https://www.tiktok.com/@user/video/123456789'
        });
    }
    
    try {
        const videoData = await fetchTikTokData(url);
        res.json({
            success: true,
            ...videoData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch video information'
        });
    }
});

// Main download endpoint
app.post('/api/download', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({
            success: false,
            error: 'URL is required',
            example: { url: 'https://www.tiktok.com/@username/video/1234567890123456789' }
        });
    }
    
    // Validate TikTok URL
    const tiktokRegex = /(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|tiktok\.com\/@[\w.-]+\/video\/\d+)/;
    if (!tiktokRegex.test(url)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid TikTok URL. Please provide a valid TikTok video link'
        });
    }
    
    try {
        const videoData = await fetchTikTokData(url);
        res.json({
            success: true,
            ...videoData
        });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to download video. Please try again later.'
        });
    }
});

// Fetch TikTok data from API
async function fetchTikTokData(url) {
    try {
        // Using tikwm.com API (reliable and free)
        const response = await axios.get('https://tikwm.com/api/', {
            params: { url: url },
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://tikwm.com/'
            }
        });
        
        if (!response.data || !response.data.data) {
            throw new Error('No data received from TikTok');
        }
        
        const data = response.data.data;
        
        // Extract download URLs
        let videoUrls = {
            no_watermark: data.play || null,
            watermark: data.wmplay || null,
            hd: data.hdplay || data.play || null
        };
        
        // Try to get HD version from different sources if not available
        if (!videoUrls.hd || videoUrls.hd === videoUrls.no_watermark) {
            if (data.images && data.images.length > 0) {
                // This is a slideshow/photo post
                videoUrls.hd = data.images[0];
                videoUrls.is_slideshow = true;
            }
        }
        
        // Get audio/MP3 URL
        let mp3Url = null;
        if (data.music) {
            mp3Url = data.music;
        } else if (data.music_info && data.music_info.play) {
            mp3Url = data.music_info.play;
        }
        
        // Format duration
        const duration = data.duration ? formatDuration(data.duration) : '00:00';
        
        return {
            platform: 'tiktok',
            id: data.id,
            title: data.title || 'TikTok Video',
            description: data.title || '',
            duration: duration,
            duration_seconds: data.duration || 0,
            thumbnail: data.cover || data.origin_cover || null,
            create_time: data.create_time ? new Date(data.create_time * 1000).toISOString() : null,
            stats: {
                likes: data.digg_count || 0,
                comments: data.comment_count || 0,
                shares: data.share_count || 0,
                views: data.play_count || 0,
                downloads: data.download_count || 0
            },
            author: {
                id: data.author?.id || null,
                username: data.author?.unique_id || data.author?.username || null,
                nickname: data.author?.nickname || null,
                avatar: data.author?.avatar || null,
                signature: data.author?.signature || null,
                followers: data.author?.follower_count || 0,
                following: data.author?.following_count || 0,
                videos: data.author?.video_count || 0
            },
            music: {
                id: data.music_info?.id || null,
                title: data.music_info?.title || null,
                author: data.music_info?.author || null,
                duration: data.music_info?.duration || null,
                play_url: mp3Url
            },
            downloads: {
                no_watermark: {
                    url: videoUrls.no_watermark,
                    quality: 'Normal (No Watermark)',
                    size: null,
                    type: 'video/mp4'
                },
                watermark: {
                    url: videoUrls.watermark,
                    quality: 'With Watermark',
                    size: null,
                    type: 'video/mp4'
                },
                hd: {
                    url: videoUrls.hd,
                    quality: 'HD (High Quality)',
                    size: null,
                    type: 'video/mp4'
                },
                mp3: {
                    url: mp3Url,
                    quality: 'MP3 Audio',
                    size: null,
                    type: 'audio/mpeg'
                }
            },
            is_slideshow: data.images && data.images.length > 0,
            images: data.images || null
        };
        
    } catch (error) {
        console.error('API Error:', error.message);
        
        // Fallback to alternative API
        try {
            return await fallbackFetch(url);
        } catch (fallbackError) {
            throw new Error('Unable to fetch video. Please check the URL and try again.');
        }
    }
}

// Fallback API (ssstik alternative)
async function fallbackFetch(url) {
    try {
        const response = await axios.get('https://ssstik.io/api', {
            params: { url: url, lang: 'en' },
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        
        if (response.data && response.data.video_url) {
            return {
                platform: 'tiktok',
                title: 'TikTok Video',
                thumbnail: response.data.thumbnail || null,
                downloads: {
                    no_watermark: {
                        url: response.data.video_url,
                        quality: 'No Watermark',
                        type: 'video/mp4'
                    },
                    hd: {
                        url: response.data.video_url,
                        quality: 'HD',
                        type: 'video/mp4'
                    },
                    mp3: {
                        url: response.data.music_url || null,
                        quality: 'MP3 Audio',
                        type: 'audio/mpeg'
                    }
                }
            };
        }
        throw new Error('No video URL found');
    } catch (error) {
        throw new Error('All API sources failed. Please try again later.');
    }
}

// Format duration helper
function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Get file size helper (optional)
async function getFileSize(url) {
    if (!url) return null;
    try {
        const response = await axios.head(url, { timeout: 5000 });
        const size = response.headers['content-length'];
        return size ? formatBytes(parseInt(size)) : null;
    } catch {
        return null;
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error. Please try again later.'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════╗
    ║   🎬 TikTok Downloader API is running!    ║
    ╠═══════════════════════════════════════════╣
    ║   Port: ${PORT}                              ║
    ║   URL: http://localhost:${PORT}              ║
    ╠═══════════════════════════════════════════╣
    ║   Endpoints:                              ║
    ║   POST /api/download - Download video     ║
    ║   GET  /api/info    - Get video info      ║
    ║   GET  /health      - Health check        ║
    ╚═══════════════════════════════════════════╝
    `);
});

module.exports = app;
