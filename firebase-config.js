import { firebaseConfig, FIREBASE_URL } from './firebase-config.js';

// Variables globales para Firebase
let db = null;
let auth = null;
let HAS_FIREBASE_SDK = false;

// Función para inicializar Firebase
export async function initFirebase() {
  // Verificar si Firebase ya está disponible (cargado por script en HTML)
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK no cargado, usando modo fallback con fetch');
    return { db: null, auth: null, hasSDK: false, url: FIREBASE_URL };
  }

  try {
    // Inicializar solo si no existe
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log('✅ Firebase inicializado correctamente');
    }

    db = firebase.database();
    auth = firebase.auth();
    HAS_FIREBASE_SDK = true;

    return { db, auth, hasSDK: true, url: FIREBASE_URL };
  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
    return { db: null, auth: null, hasSDK: false, url: FIREBASE_URL };
  }
}

// Exportar instancias y estado
export { db, auth, HAS_FIREBASE_SDK, FIREBASE_URL };
