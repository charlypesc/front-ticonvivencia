export const environment = {
  production: false,
  // La IP de la máquina y no `localhost`, para que la app sirva también desde
  // otro equipo de la misma red WiFi. Ojo: el router la reasigna al cambiar de
  // red, y con la vieja el login se queda colgado en "Iniciando sesión..." sin
  // dar error (la llamada nunca vuelve). Se consulta con `ipconfig getifaddr en0`.
  apiUrl: 'http://192.168.16.47:3000/api',
  // apiUrl: 'https://backticonvivencia.onrender.com/api',
};
