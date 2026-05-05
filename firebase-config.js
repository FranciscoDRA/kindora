// ===============================
// FIREBASE CONFIGURATION - KINDORA
// ===============================

// Configuración de Firebase (la de Kindora)
const firebaseConfig = {
  apiKey: "AIzaSy...", // <- REEMPLAZÁ ESTO con la clave que copiaste de Firebase
  authDomain: "kindora-47c88.firebaseapp.com",
  databaseURL: "https://kindora-47c88-default-rtdb.firebaseio.com",
  projectId: "kindora-47c88",
  storageBucket: "kindora-47c88.appspot.com",
  messagingSenderId: "638528530869", // <- Este es el Número del Proyecto que me pasaste
  appId: "1:638528530869:web:..."     // <- ESTO también está en la consola (necesitás copiarlo)
};
// Inicializar Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
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
