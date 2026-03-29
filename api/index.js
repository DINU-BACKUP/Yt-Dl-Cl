const axios = require('axios');

// Helper: Format duration
function formatDuration(seconds) {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Main function: Fetch TikTok data
async function fetchTikTokData(url) {
    try {
        const response = await axios.get('https://tikwm.com/api/', {
            params: { url: url },
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        });
        
        if (!response.data || !response.data.data) {
            throw new Error('No data received from TikTok');
        }
        
        const data = response.data.data;
        
        let videoUrls = {
            no_watermark: data.play || null,
            watermark: data.wmplay || null,
            hd: data.hdplay || data.play || null
        };
        
        let mp3Url = null;
        if (data.music) {
            mp3Url = data.music;
        } else if (data.music_info && data.music_info.play) {
            mp3Url = data.music_info.play;
        }
        
        const duration = data.duration ? formatDuration(data.duration) : '00:00';
        
        return {
            success: true,
            platform: 'tiktok',
            id: data.id,
            title: data.title || 'TikTok Video',
            description: data.title || '',
            duration: duration,
            duration_seconds: data.duration || 0,
            thumbnail: data.cover || data.origin_cover || null,
            stats: {
                likes: data.digg_count || 0,
                comments: data.comment_count || 0,
                shares: data.share_count || 0,
                views: data.play_count || 0
            },
            author: {
                username: data.author?.unique_id || data.author?.username || null,
                nickname: data.author?.nickname || null,
                avatar: data.author?.avatar || null
            },
            music: {
                title: data.music_info?.title || null,
                play_url: mp3Url
            },
            downloads: {
                no_watermark: {
                    url: videoUrls.no_watermark,
                    quality: 'Normal (No Watermark)',
                    type: 'video/mp4'
                },
                hd: {
                    url: videoUrls.hd,
                    quality: 'HD (High Quality)',
                    type: 'video/mp4'
                },
                mp3: {
                    url: mp3Url,
                    quality: 'MP3 Audio',
                    type: 'audio/mpeg'
                }
            }
        };
        
    } catch (error) {
        console.error('API Error:', error.message);
        throw new Error('Unable to fetch video. Please check the URL and try again.');
    }
}

// Vercel Serverless Function Handler
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // IMPORTANT: Vercel sometimes has full path with /api prefix
    // Let's extract the actual path
    let path = req.url || '/';
    // Remove query string
    if (path.includes('?')) {
        path = path.split('?')[0];
    }
    
    console.log('Method:', req.method, 'Path:', path); // Debug log
    
    // GET / - Root endpoint
    if (req.method === 'GET' && (path === '/' || path === '/api/download')) {
        return res.status(200).json({
            name: 'TikTok Downloader API',
            version: '2.0.0',
            description: 'Download TikTok videos without watermark',
            endpoints: {
                download: {
                    methods: ['GET', 'POST'],
                    url: '/api/download',
                    examples: {
                        get: '/api/download?url=VIDEO_URL',
                        post: 'POST /api/download with JSON body { "url": "VIDEO_URL" }'
                    }
                },
                info: '/api/info?url=VIDEO_URL',
                health: '/health'
            }
        });
    }
    
    // GET /health - Health check
    if (req.method === 'GET' && path === '/health') {
        return res.status(200).json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    }
    
    // ========== GET /api/download - Support GET method ==========
    if (req.method === 'GET' && path === '/api/download') {
        const { url } = req.query;
        
        console.log('GET download request, URL:', url);
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL parameter is required',
                example: '/api/download?url=https://vt.tiktok.com/ZSHdefqT1/'
            });
        }
        
        const tiktokRegex = /(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i;
        if (!tiktokRegex.test(url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid TikTok URL. Please provide a valid TikTok video link'
            });
        }
        
        try {
            const videoData = await fetchTikTokData(url);
            return res.status(200).json(videoData);
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    
    // GET /api/info - Get video info only
    if (req.method === 'GET' && path === '/api/info') {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required',
                usage: '/api/info?url=https://www.tiktok.com/@user/video/123456789'
            });
        }
        
        const tiktokRegex = /(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i;
        if (!tiktokRegex.test(url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid TikTok URL'
            });
        }
        
        try {
            const videoData = await fetchTikTokData(url);
            return res.status(200).json(videoData);
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    
    // POST /api/download - Download video
    if (req.method === 'POST' && (path === '/api/download' || path === '/')) {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL is required in request body',
                example: { url: 'https://www.tiktok.com/@username/video/123456789' }
            });
        }
        
        const tiktokRegex = /(tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i;
        if (!tiktokRegex.test(url)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid TikTok URL'
            });
        }
        
        try {
            const videoData = await fetchTikTokData(url);
            return res.status(200).json(videoData);
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
    
    // 404 for any other route
    console.log('404 - Path not matched:', path);
    return res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path_requested: path,
        method: req.method,
        available_endpoints: [
            '/ (GET)',
            '/api/download (GET with ?url=)',
            '/api/download (POST with JSON body)',
            '/api/info (GET with ?url=)',
            '/health (GET)'
        ]
    });
};
