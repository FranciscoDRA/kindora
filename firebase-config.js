// ===============================
// FIREBASE CONFIGURATION - KINDORA
// ===============================

// Configuración de Firebase (la de Kindora)
// ⚠️ IMPORTANTE: Reemplazá los valores con los de tu consola de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB_2Qft1qHgnM5B85n43EdXExIbA6YF3ZY",
  authDomain: "kindora-47c88.firebaseapp.com",
  databaseURL: "https://kindora-47c88-default-rtdb.firebaseio.com",
  projectId: "kindora-47c88",
  storageBucket: "kindora-47c88.appspot.com",
  messagingSenderId: "638528530869",
  appId: "1:638528530869:web:2c8b7a5f9e3d1a6b"
};

// Inicializar Firebase (usando compatibilidad)
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  console.log('🔥 Firebase inicializado correctamente');
}

// Exportar instancias compatibles
window.firebaseDb = firebase.database();
window.firebaseAuth = firebase.auth();

// Inicializar Analytics (opcional)
let analytics = null;
try {
  if (firebase.analytics) {
    analytics = firebase.analytics();
    console.log('📊 Firebase Analytics inicializado');
  }
} catch (e) {
  console.warn('Analytics no disponible:', e);
}

// Listener para estado de autenticación (para tracking)
window.firebaseAuth.onAuthStateChanged(user => {
  console.log('Firebase Auth:', user ? 'Usuario anónimo conectado' : 'Desconectado');
});
