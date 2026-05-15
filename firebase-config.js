(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAeSf5uQRq0qcE5sF2fTW1WTnvNEYs2wn8",
    authDomain: "kindora-47c88.firebaseapp.com",
    databaseURL: "https://kindora-47c88-default-rtdb.firebaseio.com",
    projectId: "kindora-47c88",
    storageBucket: "kindora-47c88.firebasestorage.app",
    messagingSenderId: "638528530869",
    appId: "1:638528530869:web:8de9d1ed1f0d711114d1fc"
  };

  if (typeof firebase === 'undefined') {
    console.error('❌ Firebase SDK no encontrado.');
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    window.firebaseDb   = firebase.database();
    window.firebaseAuth = null;
    console.log('✅ Firebase DB listo');
  } catch (e) {
    console.error('❌ Error inicializando Firebase:', e);
  }
})();
