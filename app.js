const BACKEND_URL = 'https://localisation-backend-sm3t.onrender.com';
const SEND_INTERVAL = 2000;

let sharing = false;
let intervalId = null;
let pingId = null;
let userId = null;
let backendAwake = false;
let wakeLock = null;
let isSending = false;

function generateUserId() { return 'user_' + Math.random().toString(36).substring(2, 10); }

function updateStatus(msg, type) {
    if (type === undefined) type = '';
    const s = document.getElementById('status');
    if (!s) return;
    const icon = s.querySelector('.status-icon');
    const text = s.querySelector('.status-text');
    if (icon) icon.innerHTML = type === 'active' ? '<i class="fas fa-check-circle"></i>' : type === 'error' ? '<i class="fas fa-exclamation-triangle"></i>' : '<i class="fas fa-circle-notch fa-spin"></i>';
    if (text) text.textContent = msg;
    s.className = 'status ' + type;
}

function initParticles() {
    const canvas = document.getElementById('particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;
    const particles = [];
    for (let i = 0; i < 60; i++) {
        particles.push({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, size: Math.random() * 2 + 0.5, opacity: Math.random() * 0.5 + 0.2 });
    }
    function animate() {
        ctx.clearRect(0, 0, width, height);
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = 'rgba(0, 212, 255, ' + (0.15 * (1 - dist / 120)) + ')';
                    ctx.lineWidth = 0.5;
                    ctx.stroke();
                }
            }
        }
        particles.forEach(p => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > width) p.vx *= -1;
            if (p.y < 0 || p.y > height) p.vy *= -1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 212, 255, ' + p.opacity + ')';
            ctx.fill();
        });
        requestAnimationFrame(animate);
    }
    animate();
}

async function requestWakeLock() { try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {} }
function releaseWakeLock() { if (wakeLock) { wakeLock.release(); wakeLock = null; } }
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && sharing && wakeLock === null) await requestWakeLock(); });

async function wakeBackend() {
    try {
        updateStatus('CONNEXION...', '');
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 60000);
        const r = await fetch(BACKEND_URL + '/api/ping', { signal: c.signal });
        clearTimeout(t);
        if (r.ok) { backendAwake = true; updateStatus('SATELLITE CONNECTÉ', 'active'); return true; }
        return false;
    } catch (e) { updateStatus('RÉVEIL...', ''); return false; }
}

function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('GPS non supporté')); return; }
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000 });
    });
}

async function sendPosition() {
    if (isSending || !sharing) return;
    const name = document.getElementById('name').value.trim();
    const whatsapp = document.getElementById('whatsapp').value.trim();
    if (!name || !whatsapp) return;
    isSending = true;
    try {
        const pos = await getPosition();
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 8000);
        const r = await fetch(BACKEND_URL + '/api/position', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, name: name, whatsapp: whatsapp, lat: pos.coords.latitude, lng: pos.coords.longitude, speed: pos.coords.speed || 0, accuracy: pos.coords.accuracy || 0, heading: pos.coords.heading || 0, altitude: pos.coords.altitude || 0 }),
            signal: c.signal
        });
        clearTimeout(t);
        const data = await r.json();
        if (data.status === 'ok') { backendAwake = true; updateStatus('ENVOYÉ ±' + Math.round(pos.coords.accuracy) + 'M', 'active'); }
    } catch (e) { if (e.name !== 'AbortError') updateStatus('RECONNEXION...', ''); }
    finally { isSending = false; }
}

async function toggleSharing() {
    const name = document.getElementById('name').value.trim();
    const whatsapp = document.getElementById('whatsapp').value.trim();
    const btn = document.getElementById('shareBtn');
    const btnText = document.getElementById('btnText');
    if (!sharing) {
        if (!name) { updateStatus('ENTREZ VOTRE PRÉNOM', 'error'); return; }
        if (!whatsapp) { updateStatus('ENTREZ VOTRE WHATSAPP', 'error'); return; }
        if (!backendAwake) { const ok = await wakeBackend(); if (!ok) { updateStatus('RÉESSAYEZ', 'error'); return; } }
        sharing = true;
        userId = generateUserId();
        btn.classList.add('stop');
        btnText.textContent = 'ARRÊTER LE PARTAGE';
        await requestWakeLock();
        await sendPosition();
        intervalId = setInterval(sendPosition, SEND_INTERVAL);
        pingId = setInterval(() => { fetch(BACKEND_URL + '/api/ping').catch(() => {}); }, 30000);
    } else {
        sharing = false;
        if (intervalId) clearInterval(intervalId);
        if (pingId) clearInterval(pingId);
        btn.classList.remove('stop');
        btnText.textContent = 'DÉMARRER LE PARTAGE';
        releaseWakeLock();
        if (userId) fetch(BACKEND_URL + '/api/position/' + userId, { method: 'DELETE' }).catch(() => {});
        updateStatus('ARRÊTÉ', '');
    }
}

window.addEventListener('load', () => { initParticles(); wakeBackend(); });
window.addEventListener('beforeunload', () => { releaseWakeLock(); if (sharing && userId) navigator.sendBeacon(BACKEND_URL + '/api/position/' + userId); });

console.log('%c 📡 SHARE ✅', 'color:#00d4ff;font-weight:bold;font-size:14px');
