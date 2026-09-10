const BACKEND_URL = 'https://localisation-backend.onrender.com';

let sharing = false;
let intervalId = null;
let userId = null;
let permissionGranted = false;

function generateUserId() {
    return 'user_' + Math.random().toString(36).substring(2, 10);
}

function updateStatus(msg, type = '') {
    const status = document.getElementById('status');
    status.textContent = msg;
    status.className = 'status ' + type;
}

// ============================================================
// DEMANDER LA PERMISSION DÈS LE CHARGEMENT
// ============================================================
async function requestPermission() {
    if (!navigator.geolocation) {
        updateStatus('❌ Géolocalisation non supportée', 'error');
        return false;
    }
    
    // Vérifier la permission actuelle
    if (navigator.permissions) {
        try {
            const result = await navigator.permissions.query({ name: 'geolocation' });
            
            if (result.state === 'granted') {
                permissionGranted = true;
                updateStatus('✅ Localisation activée. Entrez votre prénom.', 'active');
                return true;
            } else if (result.state === 'denied') {
                updateStatus('❌ Localisation refusée. Activez-la dans les paramètres.', 'error');
                return false;
            }
        } catch (e) {
            // Ignorer
        }
    }
    
    // Tenter d'obtenir la position immédiatement
    try {
        const pos = await getPosition();
        permissionGranted = true;
        updateStatus('✅ Localisation activée. Entrez votre prénom.', 'active');
        return true;
    } catch (e) {
        updateStatus('⚠️ Veuillez autoriser la localisation.', 'error');
        return false;
    }
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
        
        // Demander la permission si pas encore fait
        if (!permissionGranted) {
            const granted = await requestPermission();
            if (!granted) return;
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

// ============================================================
// DEMANDER LA PERMISSION DÈS LE CHARGEMENT
// ============================================================
window.addEventListener('load', function() {
    setTimeout(requestPermission, 500);
});

// Prévenir si on quitte la page
window.addEventListener('beforeunload', function() {
    if (sharing && userId) {
        navigator.sendBeacon(BACKEND_URL + '/api/position/' + userId);
    }
});
