// firebase-config.js — sin módulos ES, script clásico

(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAeSf5uQRq0qcE5sF2fTW1WTnvNEYs2wn8",
    authDomain: "kindora-47c88.firebaseapp.com",
    databaseURL: "https://kindora-47c88-default-rtdb.firebaseio.com",
    projectId: "kindora-47c88",
    storageBucket: "kindora-47c88.firebasestorage.app",
    messagingSenderId: "638528530869",
    appId: "1:638528530869:web:8de9d1ed1f0d711114d1fc",
    measurementId: "G-DKF3TTCSEC"
  };

  if (typeof firebase === 'undefined') {
    console.error('❌ Firebase SDK no encontrado. Verificá que los scripts de Firebase estén cargados antes de firebase-config.js');
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    window.firebaseDb = firebase.database();
    window.firebaseAuth = firebase.auth();

    console.log('✅ Firebase inicializado. DB y Auth disponibles en window.');
    console.log('   - window.firebaseDb:', !!window.firebaseDb);
    console.log('   - window.firebaseAuth:', !!window.firebaseAuth);
    
    // Opcional: Listener para estado de autenticación
    window.firebaseAuth.onAuthStateChanged(user => {
      console.log('🔐 Usuario Firebase:', user ? `Conectado (${user.email})` : 'Desconectado');
    });
    
  } catch (e) {
    console.error('❌ Error inicializando Firebase:', e);
  }
})();
