/* Analytics y errores con PostHog (piloto).
   Reglas:
   - Nunca bloquea el arranque: el SDK vive en web/vendor y se carga DESPUÉS de que la app ya mostró datos.
   - Si POSTHOG_KEY está vacío en config.js, todo esto queda apagado (interruptor).
   - Sin grabación de sesión ni autocaptura: la app tiene claves de puerta, huéspedes y nómina.
     Solo se mandan los eventos de abajo, sin contenido de registros (ni nombres, ni montos, ni claves). */
(function () {
  'use strict';
  var CFG = window.MGM_CONFIG || {};
  var KEY = CFG.POSTHOG_KEY, HOST = CFG.POSTHOG_HOST || 'https://us.i.posthog.com';
  var cola = [], listo = false, cargando = false, base = {};

  function enviar(ev, props) {
    var p = Object.assign({}, base, props || {}), err = p.err; delete p.err;
    if (listo && window.posthog) { try { mandar(ev, p, err); } catch (_) {} }
    else if (cola.length < 50) cola.push([ev, p, err]);
  }
  function mandar(ev, p, err) {
    if (ev === '$exception') window.posthog.captureException(err, p); else window.posthog.capture(ev, p);
  }
  function cargar(cb) {
    if (cargando) return; cargando = true;
    var s = document.createElement('script'); s.src = 'vendor/posthog-1.453.2.js'; s.async = true;
    s.onload = function () {
      try {
        window.posthog.init(KEY, {
          api_host: HOST,
          person_profiles: 'identified_only',
          autocapture: false,                 // nada de capturar textos de botones o pantallas
          capture_pageview: false,            // las pestañas se mandan como 'pestana_vista'
          capture_pageleave: false,
          disable_session_recording: true,    // sin grabación de pantalla
          mask_all_text: true, mask_all_element_attributes: true,
          persistence: 'localStorage'
        });
        listo = true; cb && cb();
        cola.splice(0).forEach(function (e) { try { mandar(e[0], Object.assign({}, base, e[1]), e[2]); } catch (_) {} });
      } catch (_) {}
    };
    s.onerror = function () {}; // si no carga, la app sigue igual
    document.head.appendChild(s);
  }

  var A = {
    on: !!KEY,
    // Se llama cuando la app ya cargó datos. Nunca antes.
    iniciar: function (u) {
      if (!KEY) return;
      base = { app: 'mgm-control-app', version: u.version, rol: u.rol || 'sin_acceso' };
      cargar(function () { if (u.email) window.posthog.identify(u.email, { rol: u.rol, name: u.name }); });
      try { // ¿la vez anterior salió la pantalla de rescate?
        var r = localStorage.getItem('mgm_rescate');
        if (r) { localStorage.removeItem('mgm_rescate'); enviar('pantalla_rescate', { motivo: r }); }
      } catch (_) {}
    },
    evento: function (ev, props) { if (KEY) enviar(ev, props); },
    error: function (err, contexto) {
      if (!KEY || !err) return;
      var e = err instanceof Error ? err : new Error(String(err && err.message || err));
      enviar('$exception', Object.assign({ err: e }, contexto || {}));
    }
  };
  window.MGM_AN = A;

  if (KEY) {
    window.addEventListener('error', function (e) { if (e && e.error) A.error(e.error, { origen: 'window.error' }); });
    window.addEventListener('unhandledrejection', function (e) { A.error(e && e.reason, { origen: 'promesa' }); });
  }
})();
