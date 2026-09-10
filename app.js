// ============================================================
// SHARE - Partage de position GPS
// Version corrigée avec la bonne URL backend
// ============================================================

const BACKEND_URL = 'https://localisation-backend-sm3t.onrender.com';

let sharing = false;
let intervalId = null;
let userId = null;
let permissionGranted = false;
let backendAwake = false;

function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 10);
}

function updateStatus(msg, type = '') {
    const status = document.getElementById('status');
    status.textContent = msg;
    status.className = 'status ' + type;
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
        } else {
            updateStatus('⚠️ Serveur indisponible. Réessayez.', 'error');
            return false;
        }
    } catch (e) {
        console.error('Erreur wakeBackend:', e);
        updateStatus('⚠️ Serveur en cours de réveil. Patientez 30 sec.', '');
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
        navigator.geolocation.getCurrentPosition(
            resolve,
            (err) => reject(new Error('Localisation refusée: ' + err.message)),
            {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 0
            }
        );
    });
}

// ============================================================
// ENVOI DE LA POSITION
// ============================================================
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
            updateStatus(`✅ Position envoyée (${new Date().toLocaleTimeString()})`, 'active');
        } else {
            updateStatus('⚠️ Erreur serveur: ' + (data.error || 'inconnue'), 'error');
        }
    } catch (e) {
        console.error('Erreur sendPosition:', e);
        
        if (e.name === 'AbortError') {
            updateStatus('⚠️ Timeout. Le serveur est lent.', 'error');
        } else {
            updateStatus('❌ Erreur: ' + e.message, 'error');
        }
    }
}

// ============================================================
// DÉMARRER / ARRÊTER LE PARTAGE
// ============================================================
async function toggleSharing() {
    const name = document.getElementById('name').value.trim();
    const btn = document.getElementById('shareBtn');
    const btnText = document.getElementById('btnText');

    if (!sharing) {
        // DÉMARRER
        if (!name) {
            updateStatus('⚠️ Entrez votre prénom', 'error');
            return;
        }
        
        // Réveiller le backend si nécessaire
        if (!backendAwake) {
            const awake = await wakeBackend();
            if (!awake) {
                updateStatus('⚠️ Serveur en réveil. Réessayez dans 30 sec.', 'error');
                return;
            }
        }
        
        sharing = true;
        userId = generateUserId();
        btn.classList.add('stop');
        btnText.textContent = 'Arrêter le partage';
        
        // Envoyer immédiatement
        await sendPosition();
        
        // Puis toutes les 3 secondes
        intervalId = setInterval(sendPosition, 3000);
        
    } else {
        // ARRÊTER
        sharing = false;
        
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        
        btn.classList.remove('stop');
        btnText.textContent = 'Partager ma position';
        
        if (userId) {
            fetch(BACKEND_URL + '/api/position/' + userId, { method: 'DELETE' })
                .catch(() => {});
        }
        
        updateStatus('Partage arrêté');
    }
}

// ============================================================
// AU CHARGEMENT
// ============================================================
window.addEventListener('load', function() {
    // Réveiller le backend automatiquement
    wakeBackend();
});

// Prévenir si on quitte la page
window.addEventListener('beforeunload', function() {
    if (sharing && userId) {
        navigator.sendBeacon(BACKEND_URL + '/api/position/' + userId);
    }
});
