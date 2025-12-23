import { Request, Response, NextFunction } from 'express';
import { ipAccessService } from '../services/ip-access.service';

// A short set of "kata-kata mutiara" for blacklisted IPs
const BLACKLIST_QUOTES = [
    "Diam sejenak, dan renungkan langkahmu.",
    "Mutiara hati tak tumbuh di lautan kebencian.",
    "Jalan yang tenang memberi waktu untuk berubah.",
    "Setiap jiwa berhak atas kesempatan kedua.",
    "Hidup adalah perjalanan menuju pencerahan.",
    "Janganlah terlalu dekat dengan keadaan yang buruk.",
    "Hati yang keras perlu kelembutan untuk berubah.",
    "Dalam keheningan, kita menemukan diri sejati.",
    "Setiap tindakan membawa konsekuensi, pilihlah dengan bijak.",
    "Biarkan waktu menjadi guru terbaikmu.",
];

function pickQuote() {
    return BLACKLIST_QUOTES[Math.floor(Math.random() * BLACKLIST_QUOTES.length)];
}

export function ipAccessMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Prefer x-forwarded-for header if behind proxy
            const forwarded = (req.headers['x-forwarded-for'] as string) || '';
            const ip = forwarded.split(',')[0].trim() || req.ip || req.connection.remoteAddress || 'unknown';

            const entry = await ipAccessService.getByIp(ip);

            if (!entry) {
                // No record -> instruct client to request whitelist
                return res.status(403).json({ success: false, error: 'Your IP needs approval. Please POST /api/ip/request to request whitelist.' });
            }

            if (entry.status === 'PENDING') {
                return res.status(403).json({ success: false, error: 'Your IP is waiting approval.' });
            }

            if (entry.status === 'BLACKLIST') {
                return res.status(403).json({ success: false, status: 'Blacklisted', message: pickQuote() });
            }

            // WHITELIST
            next();
        } catch (err) {
            // Fail open in case of DB issues
            console.warn('⚠️ IP access middleware error:', err);
            next();
        }
    };
}
