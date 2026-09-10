const BACKEND_URL = 'https://localisation-backend.onrender.com';

let sharing = false;
let intervalId = null;
let userId = null;

function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 10);
}

function updateStatus(msg, type = '') {
    const status = document.getElementById('status');
    status.textContent = msg;
    status.className = 'status ' + type;
}

function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Géolocalisation non supportée'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    });
}

async function sendPosition() {
    const name = document.getElementById('name').value.trim();
    if (!name) return;

    try {
        const pos = await getPosition();
        const response = await fetch(BACKEND_URL + '/api/position', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                name: name,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            })
        });
        const data = await response.json();
        if (data.status === 'ok') {
            updateStatus(`✅ Position envoyée (${new Date().toLocaleTimeString()})`, 'active');
        }
    } catch (e) {
        updateStatus('❌ Erreur: ' + e.message, 'error');
    }
}

async function toggleSharing() {
    const name = document.getElementById('name').value.trim();
    const btn = document.getElementById('shareBtn');
    const btnText = document.getElementById('btnText');

    if (!sharing) {
        if (!name) {
            updateStatus('⚠️ Entrez votre prénom', 'error');
            return;
        }
        sharing = true;
        userId = generateUserId();
        btn.classList.add('stop');
        btnText.textContent = 'Arrêter le partage';
        await sendPosition();
        intervalId = setInterval(sendPosition, 3000);
    } else {
        sharing = false;
        if (intervalId) clearInterval(intervalId);
        btn.classList.remove('stop');
        btnText.textContent = 'Partager ma position';
        if (userId) {
            fetch(BACKEND_URL + '/api/position/' + userId, { method: 'DELETE' });
        }
        updateStatus('Partage arrêté');
    }
}

window.addEventListener('beforeunload', function() {
    if (sharing && userId) {
        navigator.sendBeacon(BACKEND_URL + '/api/position/' + userId);
    }
});
