const BACKEND_URL = 'https://localisation-backend-sm3t.onrender.com';
const SEND_INTERVAL = 2000;

let sharing = false;
let intervalId = null;
let pingId = null;
let userId = null;
let backendAwake = false;
let wakeLock = null;
let isSending = false;

function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 10);
}

function updateStatus(msg, type = '') {
    const s = document.getElementById('status');
    if (s) { s.textContent = msg; s.className = 'status ' + type; }
}

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
}
function releaseWakeLock() {
    if (wakeLock) { wakeLock.release(); wakeLock = null; }
}
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && sharing && wakeLock === null) {
        await requestWakeLock();
    }
});

async function wakeBackend() {
    try {
        updateStatus('🔄 Connexion...', '');
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 60000);
        const r = await fetch(BACKEND_URL + '/api/ping', { signal: c.signal });
        clearTimeout(t);
        if (r.ok) {
            backendAwake = true;
            updateStatus('✅ Connecté. Entrez vos infos.', 'active');
            return true;
        }
        return false;
    } catch (e) {
        updateStatus('⚠️ Réveil...', '');
        return false;
    }
}

function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('Non supportée')); return; }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 15000, maximumAge: 1000
        });
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
            body: JSON.stringify({
                user_id: userId, name: name, whatsapp: whatsapp,
                lat: pos.coords.latitude, lng: pos.coords.longitude,
                speed: pos.coords.speed || 0,
                accuracy: pos.coords.accuracy || 0,
                heading: pos.coords.heading || 0,
                altitude: pos.coords.altitude || 0
            }),
            signal: c.signal
        });
        clearTimeout(t);
        const data = await r.json();
        if (data.status === 'ok') {
            backendAwake = true;
            updateStatus(`✅ Envoyé ±${Math.round(pos.coords.accuracy)}m`, 'active');
        }
    } catch (e) {
        if (e.name !== 'AbortError') updateStatus('⚠️ Reconnexion...', '');
    } finally {
        isSending = false;
    }
}

async function toggleSharing() {
    const name = document.getElementById('name').value.trim();
    const whatsapp = document.getElementById('whatsapp').value.trim();
    const btn = document.getElementById('shareBtn');
    const btnText = document.getElementById('btnText');

    if (!sharing) {
        if (!name) { updateStatus('⚠️ Entrez votre prénom', 'error'); return; }
        if (!whatsapp) { updateStatus('⚠️ Entrez votre numéro WhatsApp', 'error'); return; }
        if (!backendAwake) {
            const ok = await wakeBackend();
            if (!ok) { updateStatus('⚠️ Réessayez dans 30s', 'error'); return; }
        }
        sharing = true;
        userId = generateUserId();
        btn.classList.add('stop');
        btnText.textContent = 'Arrêter le partage';
        await requestWakeLock();
        await sendPosition();
        intervalId = setInterval(sendPosition, SEND_INTERVAL);
        pingId = setInterval(() => fetch(BACKEND_URL + '/api/ping').catch(() => {}), 30000);
    } else {
        sharing = false;
        if (intervalId) clearInterval(intervalId);
        if (pingId) clearInterval(pingId);
        btn.classList.remove('stop');
        btnText.textContent = 'Partager ma position';
        releaseWakeLock();
        if (userId) fetch(BACKEND_URL + '/api/position/' + userId, { method: 'DELETE' }).catch(() => {});
        updateStatus('Partage arrêté');
    }
}

window.addEventListener('load', () => { wakeBackend(); });
window.addEventListener('beforeunload', () => {
    releaseWakeLock();
    if (sharing && userId) navigator.sendBeacon(BACKEND_URL + '/api/position/' + userId);
});
