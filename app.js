// ============================================================
// SHARE - Partage de position avec Screen Wake Lock
// ============================================================
const BACKEND_URL = 'https://localisation-backend-sm3t.onrender.com';

let sharing = false;
let intervalId = null;
let userId = null;
let backendAwake = false;
let wakeLock = null;

function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 10);
}

function updateStatus(msg, type = '') {
    const status = document.getElementById('status');
    status.textContent = msg;
    status.className = 'status ' + type;
}

// ============================================================
// SCREEN WAKE LOCK [citation:1]
// ============================================================
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('✅ Wake Lock activé');
            
            // Ré-acquérir si l'onglet redevient visible [citation:1]
            document.addEventListener('visibilitychange', async () => {
                if (wakeLock !== null && document.visibilityState === 'visible' && sharing) {
                    wakeLock = await navigator.wakeLock.request('screen');
                }
            });
        }
    } catch (err) {
        console.warn('⚠️ Wake Lock non supporté:', err);
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release();
        wakeLock = null;
        console.log('✅ Wake Lock relâché');
    }
}

// ============================================================
// RÉVEIL DU BACKEND
// ============================================================
async function wakeBackend() {
    try {
        updateStatus('🔄 Connexion au serveur...', '');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        const response = await fetch(BACKEND_URL + '/api/ping', {
            signal: controller.signal,
            method: 'GET'
        });
        clearTimeout(timeoutId);
        if (response.ok) {
            backendAwake = true;
            updateStatus('✅ Serveur connecté. Entrez votre prénom.', 'active');
            return true;
        }
        updateStatus('⚠️ Serveur indisponible.', 'error');
        return false;
    } catch (e) {
        updateStatus('⚠️ Serveur en réveil. Patientez.', '');
        return false;
    }
}

// ============================================================
// GÉOLOCALISATION
// ============================================================
function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Géolocalisation non supportée'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        });
    });
}

async function sendPosition() {
    const name = document.getElementById('name').value.trim();
    if (!name) return;
    try {
        const pos = await getPosition();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        const response = await fetch(BACKEND_URL + '/api/position', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                name: name,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();
        if (data.status === 'ok') {
            updateStatus(`✅ Envoyé (${new Date().toLocaleTimeString()})`, 'active');
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            updateStatus('⚠️ Timeout. Réessayez.', 'error');
        } else {
            updateStatus('❌ Erreur: ' + e.message, 'error');
        }
    }
}

// ============================================================
// TOGGLE PARTAGE
// ============================================================
async function toggleSharing() {
    const name = document.getElementById('name').value.trim();
    const btn = document.getElementById('shareBtn');
    const btnText = document.getElementById('btnText');

    if (!sharing) {
        if (!name) {
            updateStatus('⚠️ Entrez votre prénom', 'error');
            return;
        }
        if (!backendAwake) {
            const awake = await wakeBackend();
            if (!awake) {
                updateStatus('⚠️ Serveur en réveil. Réessayez.', 'error');
                return;
            }
        }
        
        sharing = true;
        userId = generateUserId();
        btn.classList.add('stop');
        btnText.textContent = 'Arrêter le partage';
        
        await requestWakeLock(); // Activer le Wake Lock
        await sendPosition();
        intervalId = setInterval(sendPosition, 3000);
    } else {
        sharing = false;
        if (intervalId) clearInterval(intervalId);
        btn.classList.remove('stop');
        btnText.textContent = 'Partager ma position';
        releaseWakeLock(); // Désactiver le Wake Lock
        if (userId) {
            fetch(BACKEND_URL + '/api/position/' + userId, { method: 'DELETE' }).catch(() => {});
        }
        updateStatus('Partage arrêté');
    }
}

window.addEventListener('load', () => { wakeBackend(); });
window.addEventListener('beforeunload', () => {
    releaseWakeLock();
    if (sharing && userId) {
        navigator.sendBeacon(BACKEND_URL + '/api/position/' + userId);
    }
});
